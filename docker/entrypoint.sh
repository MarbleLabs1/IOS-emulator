#!/bin/bash
set -e

echo "🍎 Starting Silicon M1 Apple Emulator..."

# Create required directories
mkdir -p /app/vms /app/disk-images /app/logs /app/temp

# Check if running on Linux with KVM support
if [ -e /dev/kvm ]; then
    echo "✅ KVM acceleration available"
    # Ensure KVM permissions
    if [ -w /dev/kvm ]; then
        echo "✅ KVM permissions OK"
    else
        echo "⚠️  KVM device not writable, falling back to TCG"
        export QEMU_ACCEL=tcg
    fi
else
    echo "⚠️  KVM not available, using TCG emulation"
    export QEMU_ACCEL=tcg
fi

# Check QEMU installation
if command -v qemu-system-x86_64 >/dev/null 2>&1; then
    echo "✅ QEMU x86_64 available: $(qemu-system-x86_64 --version | head -n1)"
else
    echo "❌ QEMU x86_64 not found"
    exit 1
fi

if command -v qemu-system-aarch64 >/dev/null 2>&1; then
    echo "✅ QEMU aarch64 available: $(qemu-system-aarch64 --version | head -n1)"
else
    echo "❌ QEMU aarch64 not found"
    exit 1
fi

# Check for OVMF firmware
if [ -f "/app/disk-images/OVMF_CODE.fd" ] && [ -f "/app/disk-images/OVMF_VARS.fd" ]; then
    echo "✅ OVMF firmware files found"
else
    echo "⚠️  OVMF firmware files missing, copying defaults..."
    cp /usr/share/OVMF/OVMF_CODE.fd /app/disk-images/ 2>/dev/null || echo "❌ Could not copy OVMF_CODE.fd"
    cp /usr/share/OVMF/OVMF_VARS.fd /app/disk-images/ 2>/dev/null || echo "❌ Could not copy OVMF_VARS.fd"
fi

# Set up VNC password if provided
if [ -n "$VNC_PASSWORD" ]; then
    echo "🔐 Setting up VNC password..."
    mkdir -p ~/.vnc
    echo "$VNC_PASSWORD" | vncpasswd -f > ~/.vnc/passwd
    chmod 600 ~/.vnc/passwd
fi

# Start noVNC websocket proxy
echo "🌐 Starting noVNC websocket proxy..."
websockify --web=/usr/share/novnc/ 6080 localhost:5900 &

# Initialize backend database/config if needed
echo "🔧 Initializing backend configuration..."
cd /app/backend

# Create default VM templates if they don't exist
if [ ! -f "/app/backend/config/vm-templates.json" ]; then
    mkdir -p /app/backend/config
    cat > /app/backend/config/vm-templates.json << 'EOF'
[
  {
    "id": "macos-monterey",
    "name": "macOS Monterey",
    "description": "macOS 12 Monterey template with optimized settings",
    "memory": 8192,
    "cpus": 4,
    "diskSize": "64G",
    "bootloader": "OpenCore-Monterey.qcow2"
  },
  {
    "id": "macos-ventura", 
    "name": "macOS Ventura",
    "description": "macOS 13 Ventura template with optimized settings",
    "memory": 8192,
    "cpus": 4,
    "diskSize": "64G",
    "bootloader": "OpenCore-Ventura.qcow2"
  },
  {
    "id": "macos-sonoma",
    "name": "macOS Sonoma", 
    "description": "macOS 14 Sonoma template with optimized settings",
    "memory": 12288,
    "cpus": 6,
    "diskSize": "80G",
    "bootloader": "OpenCore-Sonoma.qcow2"
  }
]
EOF
fi

# Check system requirements
echo "🔍 Checking system requirements..."

# Memory check
TOTAL_MEM=$(free -m | awk 'NR==2{printf "%.0f", $2}')
if [ "$TOTAL_MEM" -lt 8192 ]; then
    echo "⚠️  Warning: System has ${TOTAL_MEM}MB RAM, 8GB+ recommended for macOS VMs"
else
    echo "✅ Memory: ${TOTAL_MEM}MB available"
fi

# CPU check
CPU_CORES=$(nproc)
echo "✅ CPU cores: $CPU_CORES available"

# Disk space check
DISK_SPACE=$(df /app/disk-images | awk 'NR==2 {print int($4/1024/1024)}')
if [ "$DISK_SPACE" -lt 100 ]; then
    echo "⚠️  Warning: Only ${DISK_SPACE}GB disk space available, 100GB+ recommended"
else
    echo "✅ Disk space: ${DISK_SPACE}GB available"
fi

# Create sample disk images directory structure
mkdir -p /app/disk-images/{bootloaders,macos-installers,vm-disks}

# Create helpful README files
cat > /app/disk-images/README.md << 'EOF'
# Disk Images Directory

This directory contains all disk images and bootloaders for your macOS VMs.

## Directory Structure:
- `bootloaders/` - OpenCore bootloader files (*.qcow2)
- `macos-installers/` - macOS installer disk images (*.dmg, *.img)
- `vm-disks/` - Virtual machine disk images (*.qcow2)

## Required Files:
1. **OpenCore Bootloader**: Download from https://github.com/acidanthera/OpenCorePkg
2. **macOS Installer**: Create from App Store or download recovery images
3. **OVMF Firmware**: Already provided (OVMF_CODE.fd, OVMF_VARS.fd)

## Legal Notice:
Please ensure you comply with Apple's Software License Agreement when using macOS.
This software is for educational and development purposes only.
EOF

cat > /app/disk-images/bootloaders/README.md << 'EOF'
# OpenCore Bootloaders

Place your OpenCore bootloader files here:
- OpenCore-Monterey.qcow2
- OpenCore-Ventura.qcow2  
- OpenCore-Sonoma.qcow2

Download from: https://github.com/acidanthera/OpenCorePkg
Configure according to Dortania's OpenCore Install Guide.
EOF

echo "📁 Created directory structure and documentation"

# Set proper permissions
chown -R appuser:appuser /app/vms /app/disk-images /app/logs 2>/dev/null || true

echo "🚀 Silicon M1 Apple Emulator initialization complete!"
echo ""
echo "📊 Access points:"
echo "   • Web Interface: http://localhost"
echo "   • Backend API: http://localhost:3001"
echo "   • noVNC Console: http://localhost:6080"
echo ""
echo "📖 Next steps:"
echo "   1. Upload OpenCore bootloader files to /app/disk-images/bootloaders/"
echo "   2. Upload macOS installer images to /app/disk-images/macos-installers/"
echo "   3. Create your first VM through the web interface"
echo ""

# Execute the main command
exec "$@"

