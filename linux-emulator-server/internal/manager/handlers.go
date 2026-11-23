package manager

import (
	"encoding/json"
	"errors"
	"net/http"
)

const maxBodyBytes = 1 << 20 // 1 MiB

// writeJSON sends v as JSON with the given status.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// writeError maps manager errors to HTTP status codes and a JSON body.
func writeError(w http.ResponseWriter, err error) {
	status := http.StatusInternalServerError
	switch {
	case errors.Is(err, ErrInvalid):
		status = http.StatusBadRequest
	case errors.Is(err, ErrNotFound):
		status = http.StatusNotFound
	case errors.Is(err, ErrConflict):
		status = http.StatusConflict
	}
	writeJSON(w, status, map[string]string{"error": err.Error()})
}

func decodeBody(w http.ResponseWriter, r *http.Request, dst any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON body: " + err.Error()})
		return false
	}
	return true
}

// StartVMHandler handles POST /api/v1/vm/start.
func (m *Manager) StartVMHandler(w http.ResponseWriter, r *http.Request) {
	var req StartOptions
	if !decodeBody(w, r, &req) {
		return
	}
	vs, err := m.StartVM(req)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, vs)
}

// StopReq is the body of POST /api/v1/vm/stop.
type StopReq struct {
	Name string `json:"name"`
}

// StopVMHandler handles POST /api/v1/vm/stop.
func (m *Manager) StopVMHandler(w http.ResponseWriter, r *http.Request) {
	var req StopReq
	if !decodeBody(w, r, &req) {
		return
	}
	if !ValidName(req.Name) {
		writeError(w, ErrInvalid)
		return
	}
	if err := m.StopVM(req.Name); err != nil {
		writeError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// StatusHandler handles GET /api/v1/vm/status?name=...
func (m *Manager) StatusHandler(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Query().Get("name")
	if !ValidName(name) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "valid name query parameter required"})
		return
	}
	v, ok := m.GetVM(name)
	if !ok {
		writeError(w, ErrNotFound)
		return
	}
	writeJSON(w, http.StatusOK, v)
}

// ListHandler handles GET /api/v1/vm/list.
func (m *Manager) ListHandler(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, m.ListVMs())
}
