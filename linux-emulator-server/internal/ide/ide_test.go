package ide

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func newServer(t *testing.T) (*Server, string) {
	t.Helper()
	base := t.TempDir()
	root := filepath.Join(base, "root")
	s, err := New(root)
	if err != nil {
		t.Fatal(err)
	}
	return s, base
}

func TestResolveConfinesToRoot(t *testing.T) {
	s, base := newServer(t)

	secret := filepath.Join(base, "secret.txt")
	if err := os.WriteFile(secret, []byte("top secret"), 0o600); err != nil {
		t.Fatal(err)
	}
	// A symlink inside the root pointing outside it.
	if err := os.Symlink(base, filepath.Join(s.Root(), "escape")); err != nil {
		t.Fatal(err)
	}

	bad := []string{
		"../secret.txt",
		"a/../../secret.txt",
		secret,
		"/etc/passwd",
		"escape/secret.txt",
		"escape/new.txt",
		"nested/../../secret.txt",
	}
	for _, p := range bad {
		if _, err := s.resolve(p); err == nil {
			t.Errorf("resolve(%q) must fail", p)
		}
	}

	good := []string{"main.swift", "dir/sub/file.swift", filepath.Join(s.Root(), "x.swift")}
	for _, p := range good {
		if got, err := s.resolve(p); err != nil || !strings.HasPrefix(got, s.Root()) {
			t.Errorf("resolve(%q) = %q, %v", p, got, err)
		}
	}
	if _, err := s.resolve(""); err == nil {
		t.Error("empty path must fail")
	}
}

func TestReadWriteRoundTripAndLimits(t *testing.T) {
	s, base := newServer(t)

	write := func(path, body string) int {
		req := httptest.NewRequest("POST", "/?path="+path, strings.NewReader(body))
		rec := httptest.NewRecorder()
		s.WriteHandler(rec, req)
		return rec.Code
	}
	read := func(path string) (int, string) {
		req := httptest.NewRequest("GET", "/?path="+path, nil)
		rec := httptest.NewRecorder()
		s.ReadHandler(rec, req)
		return rec.Code, rec.Body.String()
	}

	if c := write("proj/main.swift", "print(1)"); c != http.StatusNoContent {
		t.Fatalf("write: %d", c)
	}
	if c, body := read("proj/main.swift"); c != http.StatusOK || body != "print(1)" {
		t.Fatalf("read: %d %q", c, body)
	}
	if c, _ := read("missing.swift"); c != http.StatusNotFound {
		t.Errorf("missing file: %d", c)
	}
	if c, _ := read("proj"); c != http.StatusBadRequest {
		t.Errorf("directory read: %d", c)
	}

	// Escapes are forbidden and must not touch the filesystem.
	if c := write("../pwned.txt", "x"); c != http.StatusForbidden {
		t.Errorf("escape write: %d", c)
	}
	if _, err := os.Stat(filepath.Join(base, "pwned.txt")); err == nil {
		t.Error("file was written outside the root")
	}
	if c, _ := read("../" + filepath.Base(s.Root()) + "/../x"); c != http.StatusForbidden && c != http.StatusNotFound {
		t.Errorf("escape read: %d", c)
	}

	if c := write("big.bin", strings.Repeat("a", maxFileBytes+1)); c != http.StatusRequestEntityTooLarge {
		t.Errorf("oversized write: %d", c)
	}
}

func TestListStaysInsideRoot(t *testing.T) {
	s, _ := newServer(t)
	_ = os.WriteFile(filepath.Join(s.Root(), "a.swift"), nil, 0o644)

	req := httptest.NewRequest("GET", "/", nil)
	rec := httptest.NewRecorder()
	s.ListHandler(rec, req)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "a.swift") {
		t.Fatalf("list: %d %s", rec.Code, rec.Body.String())
	}

	req = httptest.NewRequest("GET", "/?root=/etc", nil)
	rec = httptest.NewRecorder()
	s.ListHandler(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Errorf("list outside root: %d", rec.Code)
	}
}

func TestBuildRejectsPathsOutsideRoot(t *testing.T) {
	s, _ := newServer(t)
	for _, body := range []string{
		`{"path":"/etc/passwd","out":"app"}`,
		`{"path":"main.swift","out":"/tmp/app"}`,
		`{"path":"main.swift","out":"main.swift"}`,
	} {
		req := httptest.NewRequest("POST", "/", strings.NewReader(body))
		rec := httptest.NewRecorder()
		s.BuildHandler(rec, req)
		if rec.Code != http.StatusForbidden && rec.Code != http.StatusBadRequest {
			t.Errorf("%s: want 403/400, got %d", body, rec.Code)
		}
	}
}
