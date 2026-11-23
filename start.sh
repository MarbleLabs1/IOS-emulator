#!/usr/bin/env bash
# Build everything and run the manager locally on http://127.0.0.1:8080
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

for cmd in go npm; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "error: '$cmd' is required" >&2; exit 2; }
done

echo "==> Building web UI"
[ -d node_modules ] || npm ci
npm run build

echo "==> Building manager"
mkdir -p bin
(cd linux-emulator-server && go build -o "$ROOT/bin/manager" ./cmd/manager)

export EMULATOR_RUNNER="$ROOT/linux-emulator-server/src/scripts/enhanced-run.sh"
export MANAGER_STATIC_DIR="$ROOT/dist"

echo "==> Starting manager (Ctrl+C stops it and any VMs it started)"
exec "$ROOT/bin/manager"
