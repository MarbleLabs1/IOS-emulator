package manager

import (
	"crypto/subtle"
	"net/http"
	"strings"
)

// RequireToken wraps next so that requests under /api/ must present the shared
// secret, either as "Authorization: Bearer <token>" or, for browser WebSockets
// that cannot set headers, as a "token" query parameter.
// Static UI files stay public so the login screen can load.
// An empty token disables the check (only safe on a loopback listener).
func RequireToken(token string, next http.Handler) http.Handler {
	if token == "" {
		return next
	}
	want := []byte(token)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/api/") {
			next.ServeHTTP(w, r)
			return
		}
		got := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		if got == "" {
			got = r.URL.Query().Get("token")
		}
		if subtle.ConstantTimeCompare([]byte(got), want) != 1 {
			w.Header().Set("WWW-Authenticate", `Bearer realm="qemu-ios-emulator"`)
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}
		next.ServeHTTP(w, r)
	})
}
