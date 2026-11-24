package manager

import (
	"io"
	"net/http"
	"net/url"
	"os"
	"time"

	"github.com/gorilla/websocket"
)

// sameOrigin allows requests without an Origin header (non-browser clients)
// and browser requests whose Origin host matches the request Host.
func sameOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}
	u, err := url.Parse(origin)
	if err != nil {
		return false
	}
	return u.Host == r.Host
}

var upgrader = websocket.Upgrader{CheckOrigin: sameOrigin}

const (
	logPollInterval = 500 * time.Millisecond
	logWriteTimeout = 10 * time.Second
	logInitialTail  = 64 * 1024 // bytes of history sent when a client connects
)

// LogsWSHandler streams a VM log file over a WebSocket (GET /api/v1/ws/logs?name=...).
func (m *Manager) LogsWSHandler(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Query().Get("name")
	logPath, err := m.LogPath(name)
	if err != nil {
		http.Error(w, "valid name query parameter required", http.StatusBadRequest)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return // Upgrade already replied
	}
	defer conn.Close()

	// Detect client disconnects: reading is the only way to observe a close.
	closed := make(chan struct{})
	go func() {
		defer close(closed)
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				return
			}
		}
	}()

	send := func(msg []byte) bool {
		_ = conn.SetWriteDeadline(time.Now().Add(logWriteTimeout))
		return conn.WriteMessage(websocket.TextMessage, msg) == nil
	}

	ticker := time.NewTicker(logPollInterval)
	defer ticker.Stop()

	var f *os.File
	defer func() {
		if f != nil {
			f.Close()
		}
	}()
	var offset int64
	announcedWaiting := false
	buf := make([]byte, 4096)

	for {
		if f == nil {
			opened, err := os.Open(logPath)
			if err != nil {
				if !announcedWaiting {
					announcedWaiting = true
					if !send([]byte("waiting for log file...\n")) {
						return
					}
				}
			} else {
				f = opened
				if st, err := f.Stat(); err == nil && st.Size() > logInitialTail {
					offset = st.Size() - logInitialTail
				}
			}
		}

		if f != nil {
			for {
				n, err := f.ReadAt(buf, offset)
				if n > 0 {
					offset += int64(n)
					if !send(buf[:n]) {
						return
					}
				}
				if err == io.EOF {
					break
				}
				if err != nil {
					send([]byte("error reading log: " + err.Error() + "\n"))
					return
				}
			}
		}

		select {
		case <-closed:
			return
		case <-ticker.C:
		}
	}
}
