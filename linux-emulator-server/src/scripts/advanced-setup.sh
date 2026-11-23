#!/usr/bin/env bash
# Install the packages the emulator needs (QEMU for ARM64 + UEFI firmware).
set -euo pipefail

SUDO=""
[ "$(id -u)" -eq 0 ] || SUDO="sudo"

if [ -f /etc/os-release ]; then . /etc/os-release; OS="${ID:-unknown}"; else OS="$(uname -s)"; fi
echo "Detected OS=$OS ARCH=$(uname -m)"

case "$OS" in
  ubuntu|debian)
    $SUDO apt-get update -y
    $SUDO apt-get install -y qemu-system-arm qemu-utils qemu-efi-aarch64 ipxe-qemu openssh-client
    ;;
  fedora)
    $SUDO dnf install -y qemu-system-aarch64 qemu-img edk2-aarch64
    ;;
  arch)
    $SUDO pacman -Sy --noconfirm qemu-system-aarch64 qemu-img edk2-aarch64
    ;;
  *)
    echo "Unsupported OS '$OS'. Install QEMU (qemu-system-aarch64, qemu-img) and an AArch64 UEFI firmware manually." >&2
    exit 1
    ;;
esac

command -v qemu-system-aarch64 >/dev/null && qemu-system-aarch64 --version | head -1
echo "Setup complete."
