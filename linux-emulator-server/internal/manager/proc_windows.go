//go:build windows

package manager

import "os/exec"

func setProcessGroup(cmd *exec.Cmd) {}

func terminateGroup(cmd *exec.Cmd, force bool) {
	if cmd.Process != nil {
		_ = cmd.Process.Kill()
	}
}
