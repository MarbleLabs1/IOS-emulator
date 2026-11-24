#!/usr/bin/env bash
# Install the AArch64 UEFI firmware (EDK2) that QEMU needs to boot ARM64 guests.
set -euo pipefail

SUDO=""
[ "$(id -u)" -eq 0 ] || SUDO="sudo"

if [ -f /usr/share/qemu-efi-aarch64/QEMU_EFI.fd ]; then
  echo "UEFI firmware already installed: /usr/share/qemu-efi-aarch64/QEMU_EFI.fd"
  exit 0
fi

if command -v apt-get >/dev/null 2>&1; then
  $SUDO apt-get update -y
  $SUDO apt-get install -y qemu-efi-aarch64
  echo "Installed: /usr/share/qemu-efi-aarch64/QEMU_EFI.fd"
elif command -v dnf >/dev/null 2>&1; then
  $SUDO dnf install -y edk2-aarch64
  echo "Installed edk2-aarch64 (firmware under /usr/share/edk2/aarch64)"
elif command -v pacman >/dev/null 2>&1; then
  $SUDO pacman -S --noconfirm edk2-aarch64
  echo "Installed edk2-aarch64"
else
  echo "Unsupported package manager. Install an AArch64 EDK2 build (QEMU_EFI.fd)" >&2
  echo "and point the FIRMWARE environment variable at it." >&2
  exit 1
fi
