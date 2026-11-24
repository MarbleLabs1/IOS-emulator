#!/usr/bin/env bash
# Install the manager as a systemd service under /opt/qemu-ios-emulator.
# Run from a checkout of this repository:  sudo ./install.sh
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Run as root: sudo $0" >&2; exit 1; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PREFIX=/opt/qemu-ios-emulator
CONF=/etc/qemu-ios-emulator
DATA=/var/lib/qemu-ios-emulator
LOGS=/var/log/qemu-ios-emulator

for cmd in go npm systemctl; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "error: '$cmd' is required" >&2; exit 2; }
done

echo "==> Installing QEMU and UEFI firmware"
bash "$ROOT/linux-emulator-server/src/scripts/advanced-setup.sh"

echo "==> Building web UI"
(cd "$ROOT" && npm ci && npm run build)

echo "==> Building manager"
(cd "$ROOT/linux-emulator-server" && go build -o "$ROOT/bin/manager" ./cmd/manager)

echo "==> Creating user and directories"
id -u emulator >/dev/null 2>&1 || useradd --system --home-dir "$DATA" --shell /usr/sbin/nologin emulator
getent group kvm >/dev/null 2>&1 && usermod -aG kvm emulator || true
install -d -o emulator -g emulator "$DATA" "$DATA/vms" "$DATA/workspace" "$LOGS"
install -d "$PREFIX" "$PREFIX/scripts" "$CONF"

echo "==> Installing files"
install -m 755 "$ROOT/bin/manager" "$PREFIX/manager"
install -m 755 "$ROOT/linux-emulator-server/src/scripts/enhanced-run.sh" "$PREFIX/scripts/enhanced-run.sh"
rm -rf "$PREFIX/dist" && cp -r "$ROOT/dist" "$PREFIX/dist"
install -m 644 "$ROOT/linux-emulator-server/configs/systemd/qemu-ios-emulator.service" /etc/systemd/system/qemu-ios-emulator.service

if [ ! -f "$CONF/manager.env" ]; then
  command -v openssl >/dev/null 2>&1 || { echo "error: openssl is required to generate the API token" >&2; exit 2; }
  umask 077
  cat > "$CONF/manager.env" <<ENV
# Listen on loopback only. Put a TLS reverse proxy in front before exposing it.
MANAGER_ADDR=127.0.0.1:8080
MANAGER_TOKEN=$(openssl rand -hex 32)
EMULATOR_RUNNER=$PREFIX/scripts/enhanced-run.sh
EMULATOR_LOG_DIR=$LOGS
MANAGER_STATIC_DIR=$PREFIX/dist
VM_DIR=$DATA/vms
# Uncomment to enable the remote file editor/compiler (it can read, write and compile files under IDE_ROOT):
#IDE_ENABLED=true
#IDE_ROOT=$DATA/workspace
ENV
  chown root:emulator "$CONF/manager.env"
  chmod 640 "$CONF/manager.env"
  echo "Generated API token in $CONF/manager.env"
else
  echo "Keeping existing $CONF/manager.env"
fi

systemctl daemon-reload
systemctl enable --now qemu-ios-emulator.service

echo
echo "Done. The dashboard listens on http://127.0.0.1:8080"
echo "Log in with the token from:  sudo grep MANAGER_TOKEN $CONF/manager.env"
echo "Remote access: use an SSH tunnel (ssh -L 8080:127.0.0.1:8080 user@host) or a TLS reverse proxy."
echo "VM logs: $LOGS    Service logs: journalctl -u qemu-ios-emulator"
