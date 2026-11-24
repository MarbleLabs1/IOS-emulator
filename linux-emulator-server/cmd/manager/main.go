// Command manager is the HTTP API that starts, stops and monitors QEMU VMs and
// serves the web UI.
//
// Environment variables:
//
//	MANAGER_ADDR        listen address (default 127.0.0.1:<MANAGER_PORT>)
//	MANAGER_PORT        listen port when MANAGER_ADDR is unset (default 8080)
//	MANAGER_TOKEN       shared secret required for /api/ (required for non-loopback addresses)
//	MANAGER_STATIC_DIR  built web UI to serve (default ../dist relative to the binary's working dir, if present)
//	EMULATOR_RUNNER     path to enhanced-run.sh
//	EMULATOR_LOG_DIR    directory for VM logs
//	IDE_ENABLED         "true" enables the file editor/compiler endpoints (requires MANAGER_TOKEN)
//	IDE_ROOT            directory the IDE endpoints are confined to (default ./workspace)
package main

import (
	"context"
	"errors"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gorilla/mux"

	"qemu-ios-emulator/internal/ide"
	"qemu-ios-emulator/internal/manager"
)

// Version and BuildTime are set with -ldflags at build time.
var (
	Version   = "dev"
	BuildTime = "unknown"
)

func listenAddr() string {
	if a := os.Getenv("MANAGER_ADDR"); a != "" {
		return a
	}
	port := os.Getenv("MANAGER_PORT")
	if port == "" {
		port = "8080"
	}
	return net.JoinHostPort("127.0.0.1", port)
}

func isLoopback(addr string) bool {
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		return false
	}
	if host == "localhost" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func staticDir() string {
	if d := os.Getenv("MANAGER_STATIC_DIR"); d != "" {
		return d
	}
	for _, d := range []string{"dist", "../dist"} {
		if st, err := os.Stat(d); err == nil && st.IsDir() {
			return d
		}
	}
	return ""
}

func main() {
	addr := listenAddr()
	token := os.Getenv("MANAGER_TOKEN")
	if token == "" && !isLoopback(addr) {
		log.Fatalf("refusing to listen on %s without MANAGER_TOKEN: set MANAGER_TOKEN or bind to a loopback address", addr)
	}

	m := manager.NewManager(manager.ConfigFromEnv())

	r := mux.NewRouter()
	r.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok","version":"` + Version + `"}`))
	}).Methods("GET")
	r.HandleFunc("/api/v1/vm/start", m.StartVMHandler).Methods("POST")
	r.HandleFunc("/api/v1/vm/stop", m.StopVMHandler).Methods("POST")
	r.HandleFunc("/api/v1/vm/status", m.StatusHandler).Methods("GET")
	r.HandleFunc("/api/v1/vm/list", m.ListHandler).Methods("GET")
	r.HandleFunc("/api/v1/ws/logs", m.LogsWSHandler)

	if os.Getenv("IDE_ENABLED") == "true" {
		if token == "" {
			log.Fatal("IDE_ENABLED=true requires MANAGER_TOKEN: the IDE can read, write and compile files on this host")
		}
		root := os.Getenv("IDE_ROOT")
		if root == "" {
			root = "workspace"
		}
		srv, err := ide.New(root)
		if err != nil {
			log.Fatalf("ide: %v", err)
		}
		r.HandleFunc("/api/v1/ide/list", srv.ListHandler).Methods("GET")
		r.HandleFunc("/api/v1/ide/read", srv.ReadHandler).Methods("GET")
		r.HandleFunc("/api/v1/ide/write", srv.WriteHandler).Methods("POST")
		r.HandleFunc("/api/v1/ide/build", srv.BuildHandler).Methods("POST")
		log.Printf("IDE enabled, confined to %s", srv.Root())
	}

	if dir := staticDir(); dir != "" {
		r.PathPrefix("/").Handler(http.FileServer(http.Dir(dir)))
		log.Printf("Serving web UI from %s", dir)
	} else {
		log.Printf("No built web UI found (run `npm run build`); serving API only")
	}

	srv := &http.Server{
		Addr:              addr,
		Handler:           manager.RequireToken(token, r),
		ReadHeaderTimeout: 10 * time.Second,
	}

	// Graceful shutdown: stop VMs we started, then the HTTP server.
	idle := make(chan struct{})
	go func() {
		sig := make(chan os.Signal, 1)
		signal.Notify(sig, os.Interrupt, syscall.SIGTERM)
		<-sig
		log.Print("shutting down")
		m.StopAll()
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = srv.Shutdown(ctx)
		close(idle)
	}()

	log.Printf("qemu-ios-emulator manager %s (built %s) listening on %s", Version, BuildTime, addr)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
	<-idle
}
