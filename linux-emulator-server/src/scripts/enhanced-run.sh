#!/usr/bin/env bash
# Launch one QEMU AArch64 (ARM64) "virt" virtual machine.
#
# This runs ARM64 Linux (and other UEFI-bootable ARM64 operating systems).
# It cannot run iOS: iOS needs Apple's proprietary, signed boot chain.
set -euo pipefail

usage() {
  cat <<USAGE
Usage: $0 --name NAME [options]

  --name NAME          VM name (letters, digits, '.', '_', '-')          [required]
  --profile P          default (cortex-a72) | max (all emulated features) [default]
  --memory SIZE        guest RAM, e.g. 512M or 6G                         [2G]
  --cpus N             virtual CPUs                                       [2]
  --disk PATH          qcow2 disk image (created at 32G if omitted)
  --iso PATH           attach an installer ISO (boot media)
  --vnc :N             VNC display, listens on 127.0.0.1:590N             [:0]
  --ssh-port PORT      host port forwarded to guest port 22               [2222]
  --headless           no VNC/GPU; serial console on stdout
  --snapshot save|load --snapshot-name NAME    manage disk snapshots, then exit

Environment:
  FIRMWARE    path to the AArch64 UEFI firmware (QEMU_EFI.fd), auto-detected otherwise
  VM_DIR      where per-VM state lives
  VNC_LISTEN  address VNC binds to (default 127.0.0.1; anything else exposes an unauthenticated console)
  SSH_LISTEN  address the SSH forward binds to (default 127.0.0.1)
USAGE
  exit 1
}

die() { echo "error: $*" >&2; exit 2; }
require() { command -v "$1" >/dev/null 2>&1 || die "'$1' not found; install QEMU (see README); on Debian/Ubuntu also install ipxe-qemu"; }

# Pick the first directory we can create, so the script also works unprivileged.
writable_dir() {
  local d
  for d in "$@"; do
    if mkdir -p "$d" 2>/dev/null && [ -w "$d" ]; then echo "$d"; return 0; fi
  done
  return 1
}

NAME=""
PROFILE="default"
MEM="2G"
CPUS=2
DISK=""
ISO=""
VNC_DISPLAY=":0"
SSH_PORT=2222
HEADLESS=0
SNAP_ACTION=""
SNAP_NAME=""

need_arg() { [ $# -ge 2 ] || die "option $1 needs a value"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name)          need_arg "$@"; NAME="$2"; shift 2;;
    --profile)       need_arg "$@"; PROFILE="$2"; shift 2;;
    --memory)        need_arg "$@"; MEM="$2"; shift 2;;
    --cpus)          need_arg "$@"; CPUS="$2"; shift 2;;
    --disk)          need_arg "$@"; DISK="$2"; shift 2;;
    --iso)           need_arg "$@"; ISO="$2"; shift 2;;
    --vnc)           need_arg "$@"; VNC_DISPLAY="$2"; shift 2;;
    --ssh-port)      need_arg "$@"; SSH_PORT="$2"; shift 2;;
    --headless)      HEADLESS=1; shift;;
    --snapshot)      need_arg "$@"; SNAP_ACTION="$2"; shift 2;;
    --snapshot-name) need_arg "$@"; SNAP_NAME="$2"; shift 2;;
    -h|--help)       usage;;
    *)               echo "unknown argument: $1" >&2; usage;;
  esac
done

[[ "$NAME" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ ]] || { echo "--name is required and must be [A-Za-z0-9._-]" >&2; usage; }
[[ "$CPUS" =~ ^[0-9]+$ ]] && [ "$CPUS" -ge 1 ] || die "--cpus must be a positive integer"
[[ "$MEM" =~ ^[1-9][0-9]*[MG]$ ]] || die "--memory must look like 512M or 6G"
[[ "$VNC_DISPLAY" =~ ^:[0-9]+$ ]] || die "--vnc must look like :1"
[[ "$SSH_PORT" =~ ^[0-9]+$ ]] && [ "$SSH_PORT" -ge 1024 ] && [ "$SSH_PORT" -le 65535 ] || die "--ssh-port must be 1024-65535"

VM_DIR="${VM_DIR:-$(writable_dir /var/lib/qemu-ios-emulator/vms "$HOME/.local/share/qemu-ios-emulator/vms")}" \
  || die "no writable VM state directory; set VM_DIR"
VM_STATE_DIR="$VM_DIR/$NAME"
mkdir -p "$VM_STATE_DIR"

if [ -z "$DISK" ]; then
  DISK="$VM_STATE_DIR/disk.qcow2"
fi

# ---- snapshots (do not need to start a VM) ----------------------------------
if [ -n "$SNAP_ACTION" ]; then
  require qemu-img
  [ -n "$SNAP_NAME" ] || die "--snapshot-name is required"
  [ -f "$DISK" ] || die "disk not found: $DISK"
  case "$SNAP_ACTION" in
    save) qemu-img snapshot -c "$SNAP_NAME" "$DISK"; echo "snapshot '$SNAP_NAME' saved";;
    load) qemu-img snapshot -a "$SNAP_NAME" "$DISK"; echo "snapshot '$SNAP_NAME' applied";;
    *)    die "unknown snapshot action '$SNAP_ACTION' (use save or load)";;
  esac
  exit 0
fi

require qemu-system-aarch64
require qemu-img

# ---- UEFI firmware -----------------------------------------------------------
find_firmware() {
  local f
  for f in \
    "${FIRMWARE:-}" \
    /usr/share/qemu-efi-aarch64/QEMU_EFI.fd \
    /usr/share/AAVMF/AAVMF_CODE.fd \
    /usr/share/edk2/aarch64/QEMU_EFI.fd \
    /usr/share/edk2/aarch64/QEMU_CODE.fd \
    /usr/share/qemu/edk2-aarch64-code.fd \
    /usr/share/qemu/QEMU_EFI.fd \
    /opt/homebrew/share/qemu/edk2-aarch64-code.fd \
    /usr/local/share/qemu/edk2-aarch64-code.fd; do
    if [ -n "$f" ] && [ -f "$f" ]; then echo "$f"; return 0; fi
  done
  return 1
}
FW="$(find_firmware)" || die "AArch64 UEFI firmware not found. On Debian/Ubuntu run: sudo apt install qemu-efi-aarch64 (or set FIRMWARE=/path/to/QEMU_EFI.fd)"

# ---- acceleration -------------------------------------------------------------
# KVM only works when the host CPU is ARM64; on x86 hosts the guest is emulated (TCG).
HOST_ARCH="$(uname -m)"
if [ "$(uname -s)" = "Linux" ] && [[ "$HOST_ARCH" == aarch64 || "$HOST_ARCH" == arm64 ]] && [ -w /dev/kvm ]; then
  ACCEL="kvm"; CPU_MODEL="host"
  echo "acceleration: KVM"
else
  ACCEL="tcg"
  case "$PROFILE" in
    default) CPU_MODEL="cortex-a72";;
    max)     CPU_MODEL="max";;
    *)       die "unknown profile '$PROFILE' (use default or max)";;
  esac
  echo "acceleration: TCG software emulation (slow) - cpu $CPU_MODEL"
fi
case "$PROFILE" in default|max) ;; *) die "unknown profile '$PROFILE' (use default or max)";; esac

if [ ! -f "$DISK" ]; then
  qemu-img create -f qcow2 "$DISK" 32G
fi

# ---- assemble the command ---------------------------------------------------
SSH_LISTEN="${SSH_LISTEN:-127.0.0.1}"
QEMU_ARGS=(
  -name "$NAME"
  -machine virt,highmem=on
  -accel "$ACCEL"
  -cpu "$CPU_MODEL"
  -smp "$CPUS"
  -m "$MEM"
  -bios "$FW"
  -drive "file=$DISK,if=none,id=hd0,format=qcow2"
  -device virtio-blk-pci,drive=hd0
  -netdev "user,id=net0,hostfwd=tcp:${SSH_LISTEN}:${SSH_PORT}-:22"
  -device virtio-net-pci,netdev=net0
  -device virtio-rng-pci
  -serial stdio
  -monitor none
)

if [ -n "$ISO" ]; then
  [ -f "$ISO" ] || die "ISO not found: $ISO"
  QEMU_ARGS+=(
    -drive "file=$ISO,if=none,id=cd0,media=cdrom,readonly=on"
    -device virtio-scsi-pci,id=scsi0
    -device scsi-cd,drive=cd0
  )
fi

if [ "$HEADLESS" -eq 1 ]; then
  QEMU_ARGS+=( -display none )
else
  VNC_LISTEN="${VNC_LISTEN:-127.0.0.1}"
  QEMU_ARGS+=(
    -display none
    -vnc "${VNC_LISTEN}${VNC_DISPLAY}"
    -device virtio-gpu-pci
    -device qemu-xhci
    -device usb-kbd
    -device usb-tablet
  )
  echo "VNC: ${VNC_LISTEN}:$((5900 + ${VNC_DISPLAY#:}))"
fi
echo "SSH: ${SSH_LISTEN}:${SSH_PORT} -> guest :22"

exec qemu-system-aarch64 "${QEMU_ARGS[@]}"
