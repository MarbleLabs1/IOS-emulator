//go:build !windows

package manager

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// newTestManager returns a Manager whose runner script is the given bash body.
func newTestManager(t *testing.T, script string) *Manager {
	t.Helper()
	dir := t.TempDir()
	runner := filepath.Join(dir, "runner.sh")
	if err := os.WriteFile(runner, []byte("#!/bin/bash\n"+script+"\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	m := NewManager(Config{RunnerScript: runner, LogDir: filepath.Join(dir, "logs")})
	t.Cleanup(m.StopAll)
	return m
}

func TestStartOptionsValidation(t *testing.T) {
	bad := []StartOptions{
		{Name: ""},
		{Name: "../etc/passwd"},
		{Name: "a b"},
		{Name: "-rf"},
		{Name: "ok", Profile: "nope"},
		{Name: "ok", Memory: "6GB"},
		{Name: "ok", Memory: "$(id)"},
		{Name: "ok", CPUs: 999},
		{Name: "ok", CPUs: -1},
		{Name: "ok", VNC: "localhost:1"},
		{Name: "ok", SSHPort: 22},
		{Name: "ok", SSHPort: 70000},
	}
	for _, o := range bad {
		if _, err := o.args(); !errors.Is(err, ErrInvalid) {
			t.Errorf("%+v: want ErrInvalid, got %v", o, err)
		}
	}

	args, err := StartOptions{Name: "vm1", Profile: "max", Memory: "6G", CPUs: 4, VNC: ":1", SSHPort: 2223, Headless: true}.args()
	if err != nil {
		t.Fatal(err)
	}
	got := strings.Join(args, " ")
	want := "--name vm1 --profile max --memory 6G --cpus 4 --vnc :1 --ssh-port 2223 --headless"
	if got != want {
		t.Errorf("args = %q, want %q", got, want)
	}
}

// The VM must keep running after StartVM returns (regression: it used to be
// killed when the request context was cancelled).
func TestVMOutlivesStartAndCanBeStopped(t *testing.T) {
	m := newTestManager(t, `echo "started $*"; exec sleep 60`)

	st, err := m.StartVM(StartOptions{Name: "vm1"})
	if err != nil {
		t.Fatalf("StartVM: %v", err)
	}
	if st.PID <= 0 {
		t.Fatalf("bad pid %d", st.PID)
	}

	time.Sleep(1200 * time.Millisecond)
	if _, ok := m.GetVM("vm1"); !ok {
		t.Fatal("VM disappeared while it should still be running")
	}
	if got := m.ListVMs(); len(got) != 1 || got[0].Name != "vm1" {
		t.Fatalf("ListVMs = %+v", got)
	}

	logPath, _ := m.LogPath("vm1")
	data, err := os.ReadFile(logPath)
	if err != nil || !strings.Contains(string(data), "started --name vm1") {
		t.Fatalf("log = %q, err = %v", data, err)
	}

	if _, err := m.StartVM(StartOptions{Name: "vm1"}); !errors.Is(err, ErrConflict) {
		t.Errorf("duplicate start: want ErrConflict, got %v", err)
	}

	if err := m.StopVM("vm1"); err != nil {
		t.Fatalf("StopVM: %v", err)
	}
	if _, ok := m.GetVM("vm1"); ok {
		t.Error("VM still listed after stop")
	}
	if err := m.StopVM("vm1"); !errors.Is(err, ErrNotFound) {
		t.Errorf("second stop: want ErrNotFound, got %v", err)
	}
}

func TestStartReportsImmediateFailure(t *testing.T) {
	m := newTestManager(t, `echo "missing qemu" >&2; exit 3`)
	_, err := m.StartVM(StartOptions{Name: "broken"})
	if err == nil || !strings.Contains(err.Error(), "exited during startup") {
		t.Fatalf("want startup failure, got %v", err)
	}
	// The name must be free again.
	if _, ok := m.GetVM("broken"); ok {
		t.Error("failed VM still registered")
	}
}

func TestHandlers(t *testing.T) {
	m := newTestManager(t, `exec sleep 60`)

	do := func(h http.HandlerFunc, method, target, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, target, strings.NewReader(body))
		rec := httptest.NewRecorder()
		h(rec, req)
		return rec
	}

	if rec := do(m.StartVMHandler, "POST", "/", `{"name":"../x"}`); rec.Code != http.StatusBadRequest {
		t.Errorf("bad name: %d", rec.Code)
	}
	if rec := do(m.StartVMHandler, "POST", "/", `{"name":"x","args":["--disk","/etc/passwd"]}`); rec.Code != http.StatusBadRequest {
		t.Errorf("unknown field must be rejected: %d", rec.Code)
	}
	if rec := do(m.StartVMHandler, "POST", "/", `not json`); rec.Code != http.StatusBadRequest {
		t.Errorf("bad json: %d", rec.Code)
	}
	if rec := do(m.StopVMHandler, "POST", "/", `{"name":"ghost"}`); rec.Code != http.StatusNotFound {
		t.Errorf("stop unknown: %d", rec.Code)
	}
	if rec := do(m.StatusHandler, "GET", "/?name=ghost", ""); rec.Code != http.StatusNotFound {
		t.Errorf("status unknown: %d", rec.Code)
	}
	if rec := do(m.StatusHandler, "GET", "/", ""); rec.Code != http.StatusBadRequest {
		t.Errorf("status without name: %d", rec.Code)
	}
	if rec := do(m.ListHandler, "GET", "/", ""); rec.Code != http.StatusOK || strings.TrimSpace(rec.Body.String()) != "[]" {
		t.Errorf("empty list: %d %q", rec.Code, rec.Body.String())
	}

	rec := do(m.StartVMHandler, "POST", "/", `{"name":"web1"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("start: %d %s", rec.Code, rec.Body.String())
	}
	if rec := do(m.StatusHandler, "GET", "/?name=web1", ""); rec.Code != http.StatusOK {
		t.Errorf("status running: %d", rec.Code)
	}
	if rec := do(m.StopVMHandler, "POST", "/", `{"name":"web1"}`); rec.Code != http.StatusNoContent {
		t.Errorf("stop: %d", rec.Code)
	}
}

func TestLogsWSRejectsBadName(t *testing.T) {
	m := newTestManager(t, `true`)
	for _, name := range []string{"", "../../etc/passwd", "a/b"} {
		req := httptest.NewRequest("GET", "/api/v1/ws/logs?name="+name, nil)
		rec := httptest.NewRecorder()
		m.LogsWSHandler(rec, req)
		if rec.Code != http.StatusBadRequest {
			t.Errorf("name %q: want 400, got %d", name, rec.Code)
		}
	}
}

func TestSameOrigin(t *testing.T) {
	cases := []struct {
		origin, host string
		want         bool
	}{
		{"", "localhost:8080", true},
		{"http://localhost:8080", "localhost:8080", true},
		{"http://evil.example", "localhost:8080", false},
		{"://bad", "localhost:8080", false},
	}
	for _, c := range cases {
		req := httptest.NewRequest("GET", "/", nil)
		req.Host = c.host
		if c.origin != "" {
			req.Header.Set("Origin", c.origin)
		}
		if got := sameOrigin(req); got != c.want {
			t.Errorf("origin %q host %q: got %v want %v", c.origin, c.host, got, c.want)
		}
	}
}

func TestRequireToken(t *testing.T) {
	ok := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	h := RequireToken("s3cret", ok)

	call := func(path, header, query string) int {
		req := httptest.NewRequest("GET", path+query, nil)
		if header != "" {
			req.Header.Set("Authorization", header)
		}
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec.Code
	}

	if c := call("/api/v1/vm/list", "", ""); c != http.StatusUnauthorized {
		t.Errorf("no token: %d", c)
	}
	if c := call("/api/v1/vm/list", "Bearer wrong", ""); c != http.StatusUnauthorized {
		t.Errorf("wrong token: %d", c)
	}
	if c := call("/api/v1/vm/list", "Bearer s3cret", ""); c != http.StatusOK {
		t.Errorf("header token: %d", c)
	}
	if c := call("/api/v1/ws/logs", "", "?token=s3cret"); c != http.StatusOK {
		t.Errorf("query token: %d", c)
	}
	if c := call("/index.html", "", ""); c != http.StatusOK {
		t.Errorf("static must stay public: %d", c)
	}
	if RequireToken("", ok) == nil {
		t.Error("empty token must pass handler through")
	}
}
