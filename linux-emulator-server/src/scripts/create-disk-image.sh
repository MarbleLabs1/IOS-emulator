#!/usr/bin/env bash
# Create an empty qcow2 disk image.
# Usage: create-disk-image.sh [PATH] [SIZE]
set -euo pipefail

IMAGE="${1:-./images/disk.qcow2}"
SIZE="${2:-32G}"

command -v qemu-img >/dev/null 2>&1 || { echo "qemu-img not found; install QEMU first" >&2; exit 2; }
[ ! -e "$IMAGE" ] || { echo "refusing to overwrite existing file: $IMAGE" >&2; exit 1; }

mkdir -p "$(dirname "$IMAGE")"
qemu-img create -f qcow2 "$IMAGE" "$SIZE"
qemu-img info "$IMAGE"
echo "Use it with: enhanced-run.sh --name NAME --disk $IMAGE"
