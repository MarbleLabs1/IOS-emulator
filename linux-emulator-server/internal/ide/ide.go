// Package ide exposes a tiny file browser/editor/compiler over HTTP.
//
// Every path is confined to a single root directory. The endpoints can read,
// write and compile files on the host, so they must only be exposed behind
// authentication (see manager.RequireToken) and are disabled unless the
// operator opts in.
package ide

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

const (
	maxFileBytes  = 5 << 20 // largest file that can be read or written
	maxListItems  = 5000
	buildTimeout  = 60 * time.Second
	maxJSONBody   = 1 << 20
	maxBuildBytes = 1 << 20 // compiler output returned to the client
)

// Server serves the IDE endpoints for files below Root.
type Server struct {
	root string // absolute, symlink-resolved
}

// New creates a Server confined to root, creating the directory if needed.
func New(root string) (*Server, error) {
	abs, err := filepath.Abs(root)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(abs, 0o755); err != nil {
		return nil, err
	}
	resolved, err := filepath.EvalSymlinks(abs)
	if err != nil {
		return nil, err
	}
	return &Server{root: resolved}, nil
}

// Root returns the confinement directory.
func (s *Server) Root() string { return s.root }

var errOutside = errors.New("path is outside the IDE root")

// resolve maps a client-supplied path (absolute or relative to the root) to a
// real path guaranteed to be inside the root, following symlinks of the
// deepest existing ancestor so links cannot be used to escape.
func (s *Server) resolve(p string) (string, error) {
	if p == "" {
		return "", errors.New("path required")
	}
	if strings.ContainsRune(p, 0) {
		return "", errors.New("invalid path")
	}
	if !filepath.IsAbs(p) {
		p = filepath.Join(s.root, p)
	}
	p = filepath.Clean(p)

	// Split into the part that exists (resolved) and the not-yet-created tail.
	existing, tail := p, ""
	for {
		if _, err := os.Lstat(existing); err == nil {
			break
		}
		parent := filepath.Dir(existing)
		if parent == existing {
			return "", errOutside
		}
		tail = filepath.Join(filepath.Base(existing), tail)
		existing = parent
	}
	real, err := filepath.EvalSymlinks(existing)
	if err != nil {
		return "", err
	}
	full := filepath.Join(real, tail)
	if full != s.root && !strings.HasPrefix(full, s.root+string(filepath.Separator)) {
		return "", errOutside
	}
	return full, nil
}

func httpError(w http.ResponseWriter, err error) {
	status := http.StatusInternalServerError
	switch {
	case errors.Is(err, errOutside):
		status = http.StatusForbidden
	case errors.Is(err, fs.ErrNotExist):
		status = http.StatusNotFound
	}
	http.Error(w, err.Error(), status)
}

// FileEntry is one item in a directory listing.
type FileEntry struct {
	Path  string `json:"path"`
	IsDir bool   `json:"is_dir"`
}

// ListHandler handles GET /api/v1/ide/list?root=<dir inside the IDE root>.
func (s *Server) ListHandler(w http.ResponseWriter, r *http.Request) {
	dir := s.root
	if q := r.URL.Query().Get("root"); q != "" {
		resolved, err := s.resolve(q)
		if err != nil {
			httpError(w, err)
			return
		}
		dir = resolved
	}
	entries := []FileEntry{}
	truncated := false
	_ = filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() && d.Name() == ".git" {
			return filepath.SkipDir
		}
		if len(entries) >= maxListItems {
			truncated = true
			return filepath.SkipAll
		}
		entries = append(entries, FileEntry{Path: path, IsDir: d.IsDir()})
		return nil
	})
	if truncated {
		w.Header().Set("X-Truncated", "true")
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(entries)
}

// ReadHandler handles GET /api/v1/ide/read?path=...
func (s *Server) ReadHandler(w http.ResponseWriter, r *http.Request) {
	path, err := s.resolve(r.URL.Query().Get("path"))
	if err != nil {
		httpError(w, err)
		return
	}
	f, err := os.Open(path)
	if err != nil {
		httpError(w, err)
		return
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		httpError(w, err)
		return
	}
	if !st.Mode().IsRegular() {
		http.Error(w, "not a regular file", http.StatusBadRequest)
		return
	}
	if st.Size() > maxFileBytes {
		http.Error(w, "file too large", http.StatusRequestEntityTooLarge)
		return
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	_, _ = io.Copy(w, f)
}

// WriteHandler handles POST /api/v1/ide/write?path=... (raw body = content).
func (s *Server) WriteHandler(w http.ResponseWriter, r *http.Request) {
	path, err := s.resolve(r.URL.Query().Get("path"))
	if err != nil {
		httpError(w, err)
		return
	}
	if path == s.root {
		http.Error(w, "path must be a file", http.StatusBadRequest)
		return
	}
	body := http.MaxBytesReader(w, r.Body, maxFileBytes)
	data, err := io.ReadAll(body)
	if err != nil {
		http.Error(w, "body too large or unreadable", http.StatusRequestEntityTooLarge)
		return
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		httpError(w, err)
		return
	}
	// Re-validate after creating parents (guards against races with symlinks).
	if _, err := s.resolve(path); err != nil {
		httpError(w, err)
		return
	}
	if err := os.WriteFile(path, data, 0o644); err != nil {
		httpError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// BuildReq is the body of POST /api/v1/ide/build.
type BuildReq struct {
	Path string `json:"path"`
	Out  string `json:"out"`
}

// BuildHandler handles POST /api/v1/ide/build. It compiles Path into Out with
// swiftc when available, otherwise clang (Objective-C).
func (s *Server) BuildHandler(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxJSONBody)
	var req BuildReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid JSON body: "+err.Error(), http.StatusBadRequest)
		return
	}
	src, err := s.resolve(req.Path)
	if err != nil {
		httpError(w, err)
		return
	}
	out, err := s.resolve(req.Out)
	if err != nil {
		httpError(w, err)
		return
	}
	if src == out {
		http.Error(w, "output must differ from source", http.StatusBadRequest)
		return
	}

	var args []string
	var compiler string
	if p, err := exec.LookPath("swiftc"); err == nil {
		compiler, args = p, []string{"-o", out, src}
	} else if p, err := exec.LookPath("clang"); err == nil {
		compiler, args = p, []string{"-o", out, src, "-ObjC", "-framework", "Foundation"}
	} else {
		http.Error(w, "no compiler found (swiftc or clang)", http.StatusServiceUnavailable)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), buildTimeout)
	defer cancel()
	output, err := exec.CommandContext(ctx, compiler, args...).CombinedOutput()
	if len(output) > maxBuildBytes {
		output = output[:maxBuildBytes]
	}
	if err != nil {
		msg := string(output)
		if ctx.Err() == context.DeadlineExceeded {
			msg = fmt.Sprintf("build timed out after %s\n%s", buildTimeout, msg)
		}
		http.Error(w, msg, http.StatusUnprocessableEntity)
		return
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	_, _ = fmt.Fprintf(w, "built: %s", out)
}
