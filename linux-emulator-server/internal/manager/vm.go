package manager

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"sync"
	"time"
)

// Config holds the filesystem locations the manager relies on.
type Config struct {
	// RunnerScript is the path of the script that launches a single VM
	// (enhanced-run.sh).
	RunnerScript string
	// LogDir is where per-VM log files are written.
	LogDir string
}

// ConfigFromEnv builds a Config from environment variables, falling back to
// paths relative to the working directory and to a user-writable log dir.
//
//	EMULATOR_RUNNER   path to enhanced-run.sh
//	EMULATOR_LOG_DIR  directory for VM logs
func ConfigFromEnv() Config {
	cfg := Config{
		RunnerScript: os.Getenv("EMULATOR_RUNNER"),
		LogDir:       os.Getenv("EMULATOR_LOG_DIR"),
	}
	if cfg.RunnerScript == "" {
		cfg.RunnerScript = filepath.Join("src", "scripts", "enhanced-run.sh")
	}
	if cfg.LogDir == "" {
		cfg.LogDir = "/var/log/qemu-ios-emulator"
		if err := os.MkdirAll(cfg.LogDir, 0o755); err != nil {
			cfg.LogDir = filepath.Join(os.TempDir(), "qemu-ios-emulator", "logs")
		}
	}
	return cfg
}

// VMState is the public, JSON-serialisable view of a running VM.
type VMState struct {
	Name      string    `json:"name"`
	PID       int       `json:"pid"`
	StartedAt time.Time `json:"started_at"`
}

// StartOptions are the validated parameters accepted when starting a VM.
type StartOptions struct {
	Name     string `json:"name"`
	Profile  string `json:"profile,omitempty"`
	Memory   string `json:"memory,omitempty"`
	CPUs     int    `json:"cpus,omitempty"`
	VNC      string `json:"vnc,omitempty"`
	SSHPort  int    `json:"ssh_port,omitempty"`
	Headless bool   `json:"headless,omitempty"`
}

var (
	nameRe   = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$`)
	memoryRe = regexp.MustCompile(`^[1-9][0-9]{0,3}[MG]$`)
	vncRe    = regexp.MustCompile(`^:[0-9]{1,2}$`)

	// Profiles must match the ones understood by enhanced-run.sh.
	validProfiles = map[string]bool{"default": true, "max": true}
)

// ErrInvalid marks errors caused by bad client input (HTTP 400).
var ErrInvalid = errors.New("invalid request")

// ErrNotFound marks lookups of unknown VMs (HTTP 404).
var ErrNotFound = errors.New("vm not found")

// ErrConflict marks starting a VM whose name is already in use (HTTP 409).
var ErrConflict = errors.New("vm already running")

// ValidName reports whether name is safe to use as a VM name and file name.
func ValidName(name string) bool { return nameRe.MatchString(name) }

// args validates every field and returns the argument list for the runner.
func (o StartOptions) args() ([]string, error) {
	if !ValidName(o.Name) {
		return nil, fmt.Errorf("%w: name must match %s", ErrInvalid, nameRe)
	}
	args := []string{"--name", o.Name}
	if o.Profile != "" {
		if !validProfiles[o.Profile] {
			return nil, fmt.Errorf("%w: unknown profile %q", ErrInvalid, o.Profile)
		}
		args = append(args, "--profile", o.Profile)
	}
	if o.Memory != "" {
		if !memoryRe.MatchString(o.Memory) {
			return nil, fmt.Errorf("%w: memory must look like 512M or 6G", ErrInvalid)
		}
		args = append(args, "--memory", o.Memory)
	}
	if o.CPUs != 0 {
		if o.CPUs < 1 || o.CPUs > 64 {
			return nil, fmt.Errorf("%w: cpus must be between 1 and 64", ErrInvalid)
		}
		args = append(args, "--cpus", strconv.Itoa(o.CPUs))
	}
	if o.VNC != "" {
		if !vncRe.MatchString(o.VNC) {
			return nil, fmt.Errorf("%w: vnc must look like :1", ErrInvalid)
		}
		args = append(args, "--vnc", o.VNC)
	}
	if o.SSHPort != 0 {
		if o.SSHPort < 1024 || o.SSHPort > 65535 {
			return nil, fmt.Errorf("%w: ssh_port must be between 1024 and 65535", ErrInvalid)
		}
		args = append(args, "--ssh-port", strconv.Itoa(o.SSHPort))
	}
	if o.Headless {
		args = append(args, "--headless")
	}
	return args, nil
}

type vmEntry struct {
	state VMState
	cmd   *exec.Cmd
	done  chan struct{} // closed once the process has been reaped
}

// Manager tracks the VMs it launched.
type Manager struct {
	cfg Config
	mu  sync.Mutex
	vms map[string]*vmEntry
}

// NewManager returns a Manager using cfg.
func NewManager(cfg Config) *Manager {
	return &Manager{cfg: cfg, vms: make(map[string]*vmEntry)}
}

// LogDir returns the directory holding VM logs.
func (m *Manager) LogDir() string { return m.cfg.LogDir }

// LogPath returns the log file path for a (validated) VM name.
func (m *Manager) LogPath(name string) (string, error) {
	if !ValidName(name) {
		return "", fmt.Errorf("%w: bad name", ErrInvalid)
	}
	return filepath.Join(m.cfg.LogDir, name+".log"), nil
}

// StartVM launches a VM in its own process group and returns once it has
// survived a short startup window. The VM keeps running after the caller's
// request has finished.
func (m *Manager) StartVM(opts StartOptions) (VMState, error) {
	args, err := opts.args()
	if err != nil {
		return VMState{}, err
	}

	m.mu.Lock()
	if _, ok := m.vms[opts.Name]; ok {
		m.mu.Unlock()
		return VMState{}, ErrConflict
	}
	// Reserve the name while we start the process.
	entry := &vmEntry{done: make(chan struct{})}
	m.vms[opts.Name] = entry
	m.mu.Unlock()

	release := func() {
		m.mu.Lock()
		delete(m.vms, opts.Name)
		m.mu.Unlock()
	}

	if err := os.MkdirAll(m.cfg.LogDir, 0o755); err != nil {
		release()
		return VMState{}, fmt.Errorf("create log dir: %w", err)
	}
	logPath, _ := m.LogPath(opts.Name)
	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		release()
		return VMState{}, fmt.Errorf("open log file: %w", err)
	}

	// Deliberately NOT exec.CommandContext: the VM must outlive the HTTP request.
	cmd := exec.Command("/bin/bash", append([]string{m.cfg.RunnerScript}, args...)...)
	cmd.Stdout = logFile
	cmd.Stderr = logFile
	cmd.Env = append(os.Environ(), "LOG_DIR="+m.cfg.LogDir)
	setProcessGroup(cmd)

	if err := cmd.Start(); err != nil {
		logFile.Close()
		release()
		return VMState{}, fmt.Errorf("start runner: %w", err)
	}

	state := VMState{Name: opts.Name, PID: cmd.Process.Pid, StartedAt: time.Now()}
	m.mu.Lock()
	entry.cmd = cmd
	entry.state = state
	m.mu.Unlock()

	exitErr := make(chan error, 1)
	go func() {
		err := cmd.Wait()
		logFile.Close()
		close(entry.done)
		release()
		exitErr <- err
	}()

	// Detect immediate failures (missing qemu, bad arguments, ...).
	select {
	case err := <-exitErr:
		return VMState{}, fmt.Errorf("vm exited during startup (%v); see %s", exitStatus(err), logPath)
	case <-time.After(750 * time.Millisecond):
	}
	return state, nil
}

func exitStatus(err error) string {
	if err == nil {
		return "exit status 0"
	}
	return err.Error()
}

// StopVM asks the VM's process group to terminate, escalating to SIGKILL
// after a grace period.
func (m *Manager) StopVM(name string) error {
	m.mu.Lock()
	entry, ok := m.vms[name]
	var cmd *exec.Cmd
	if ok {
		cmd = entry.cmd
	}
	m.mu.Unlock()
	if !ok || cmd == nil {
		return ErrNotFound
	}
	terminateGroup(cmd, false)
	select {
	case <-entry.done:
	case <-time.After(5 * time.Second):
		terminateGroup(cmd, true)
		<-entry.done
	}
	return nil
}

// ListVMs returns the running VMs sorted by name.
func (m *Manager) ListVMs() []VMState {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]VMState, 0, len(m.vms))
	for _, v := range m.vms {
		if v.cmd != nil {
			out = append(out, v.state)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

// GetVM looks up a running VM.
func (m *Manager) GetVM(name string) (VMState, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	v, ok := m.vms[name]
	if !ok || v.cmd == nil {
		return VMState{}, false
	}
	return v.state, true
}

// StopAll terminates every VM; used on shutdown.
func (m *Manager) StopAll() {
	for _, v := range m.ListVMs() {
		_ = m.StopVM(v.Name)
	}
}
