//go:build !windows

package manager

import (
	"os/exec"
	"syscall"
)

// setProcessGroup puts the child in its own process group so that the whole
// tree (bash + qemu) can be signalled together.
func setProcessGroup(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
}

// terminateGroup signals the child's process group.
func terminateGroup(cmd *exec.Cmd, force bool) {
	if cmd.Process == nil {
		return
	}
	sig := syscall.SIGTERM
	if force {
		sig = syscall.SIGKILL
	}
	// A negative PID targets the process group.
	if err := syscall.Kill(-cmd.Process.Pid, sig); err != nil {
		_ = cmd.Process.Signal(sig)
	}
}
