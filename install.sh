#!/bin/bash

# Silicon M1 Apple Emulator - Linux Installation Script
# This script installs Docker, QEMU, and sets up the emulator environment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
check_root() {
    if [[ $EUID -eq 0 ]]; then
        log_error "This script should not be run as root. Please run as a regular user."
        exit 1
    fi
}

# Detect Linux distribution
detect_distro() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        DISTRO=$ID
        VERSION=$VERSION_ID
    else
        log_error "Cannot detect Linux distribution"
        exit 1
    fi
    
    log_info "Detected distribution: $DISTRO $VERSION"
}

# Check system requirements
check_requirements() {
    log_info "Checking system requirements..."
    
    # Check CPU virtualization support
    if grep -q -E "(vmx|svm)" /proc/cpuinfo; then
        log_success "CPU virtualization support detected"
    else
        log_warning "CPU virtualization support not detected. Performance will be limited."
    fi
    
    # Check memory (minimum 8GB recommended)
    TOTAL_MEM=$(free -m | awk 'NR==2{printf "%.0f", $2}')
    if [ "$TOTAL_MEM" -lt 8192 ]; then
        log_warning "System has ${TOTAL_MEM}MB RAM. 8GB+ recommended for macOS VMs."
    else
        log_success "Memory: ${TOTAL_MEM}MB available"
    fi
    
    # Check disk space (minimum 100GB recommended)
    DISK_SPACE=$(df / | awk 'NR==2 {print int($4/1024/1024)}')
    if [ "$DISK_SPACE" -lt 100 ]; then
        log_warning "Only ${DISK_SPACE}GB disk space available. 100GB+ recommended."
    else
        log_success "Disk space: ${DISK_SPACE}GB available"
    fi
}

# Install Docker
install_docker() {
    log_info "Installing Docker..."
    
    if command -v docker &> /dev/null; then
        log_success "Docker is already installed"
        return
    fi
    
    case $DISTRO in
        ubuntu|debian)
            # Update package index
            sudo apt-get update
            
            # Install prerequisites
            sudo apt-get install -y \
                apt-transport-https \
                ca-certificates \
                curl \
                gnupg \
                lsb-release
            
            # Add Docker's official GPG key
            curl -fsSL https://download.docker.com/linux/$DISTRO/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
            
            # Set up stable repository
            echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/$DISTRO $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
            
            # Install Docker Engine
            sudo apt-get update
            sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
            ;;
        fedora|centos|rhel)
            # Install Docker using dnf/yum
            if command -v dnf &> /dev/null; then
                sudo dnf install -y docker docker-compose
            else
                sudo yum install -y docker docker-compose
            fi
            ;;
        arch)
            sudo pacman -S --noconfirm docker docker-compose
            ;;
        *)
            log_error "Unsupported distribution: $DISTRO"
            log_info "Please install Docker manually from https://docs.docker.com/engine/install/"
            exit 1
            ;;
    esac
    
    # Start and enable Docker service
    sudo systemctl start docker
    sudo systemctl enable docker
    
    # Add user to docker group
    sudo usermod -aG docker $USER
    
    log_success "Docker installed successfully"
    log_warning "Please log out and log back in for Docker group changes to take effect"
}

# Install QEMU
install_qemu() {
    log_info "Installing QEMU..."
    
    if command -v qemu-system-x86_64 &> /dev/null; then
        log_success "QEMU is already installed"
        return
    fi
    
    case $DISTRO in
        ubuntu|debian)
            sudo apt-get update
            sudo apt-get install -y \
                qemu-system-x86 \
                qemu-system-aarch64 \
                qemu-utils \
                qemu-kvm \
                libvirt-daemon-system \
                libvirt-clients \
                bridge-utils \
                virt-manager \
                ovmf
            ;;
        fedora|centos|rhel)
            if command -v dnf &> /dev/null; then
                sudo dnf install -y \
                    qemu-system-x86 \
                    qemu-system-aarch64 \
                    qemu-img \
                    qemu-kvm \
                    libvirt \
                    virt-manager \
                    edk2-ovmf
            else
                sudo yum install -y \
                    qemu-system-x86 \
                    qemu-system-aarch64 \
                    qemu-img \
                    qemu-kvm \
                    libvirt \
                    virt-manager \
                    edk2-ovmf
            fi
            ;;
        arch)
            sudo pacman -S --noconfirm \
                qemu-system-x86_64 \
                qemu-system-aarch64 \
                qemu-img \
                libvirt \
                virt-manager \
                edk2-ovmf
            ;;
        *)
            log_error "Unsupported distribution for QEMU installation: $DISTRO"
            exit 1
            ;;
    esac
    
    log_success "QEMU installed successfully"
}

# Setup KVM
setup_kvm() {
    log_info "Setting up KVM..."
    
    # Check if KVM is available
    if [ ! -e /dev/kvm ]; then
        log_warning "KVM device not found. Hardware virtualization may not be enabled."
        return
    fi
    
    # Add user to kvm and libvirt groups
    sudo usermod -aG kvm $USER
    sudo usermod -aG libvirt $USER
    
    # Start and enable libvirt service
    sudo systemctl start libvirtd
    sudo systemctl enable libvirtd
    
    log_success "KVM setup completed"
}

# Create project directories
create_directories() {
    log_info "Creating project directories..."
    
    mkdir -p data/{vms,disk-images,logs}
    mkdir -p data/disk-images/{bootloaders,macos-installers,vm-disks}
    
    log_success "Project directories created"
}

# Download and setup the emulator
setup_emulator() {
    log_info "Setting up Silicon M1 Apple Emulator..."
    
    # Build Docker image
    if [ -f "Dockerfile" ]; then
        log_info "Building Docker image..."
        docker build -t silicon-emulator .
        log_success "Docker image built successfully"
    else
        log_error "Dockerfile not found. Please ensure you're in the project directory."
        exit 1
    fi
    
    # Create docker-compose override for Linux
    cat > docker-compose.override.yml << EOF
version: '3.8'

services:
  silicon-emulator:
    devices:
      - /dev/kvm:/dev/kvm
    volumes:
      - /dev/kvm:/dev/kvm
    environment:
      - QEMU_ACCEL=kvm
EOF
    
    log_success "Emulator setup completed"
}

# Create startup script
create_startup_script() {
    log_info "Creating startup script..."
    
    cat > start-emulator.sh << 'EOF'
#!/bin/bash

# Silicon M1 Apple Emulator Startup Script

echo "🍎 Starting Silicon M1 Apple Emulator..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Start the emulator
docker-compose up -d

echo "✅ Emulator started successfully!"
echo ""
echo "📊 Access points:"
echo "   • Web Interface: http://localhost"
echo "   • Backend API: http://localhost:3001"
echo "   • noVNC Console: http://localhost:6080"
echo ""
echo "📖 Next steps:"
echo "   1. Upload OpenCore bootloader files"
echo "   2. Upload macOS installer images"
echo "   3. Create your first VM"
echo ""
echo "🛑 To stop the emulator, run: docker-compose down"
EOF
    
    chmod +x start-emulator.sh
    
    log_success "Startup script created: ./start-emulator.sh"
}

# Create helpful documentation
create_documentation() {
    log_info "Creating documentation..."
    
    cat > SETUP.md << 'EOF'
# Silicon M1 Apple Emulator - Setup Guide

## Quick Start

1. **Start the emulator:**
   ```bash
   ./start-emulator.sh
   ```

2. **Access the web interface:**
   Open http://localhost in your browser

3. **Upload required files:**
   - OpenCore bootloader files to `data/disk-images/bootloaders/`
   - macOS installer images to `data/disk-images/macos-installers/`

## Required Files

### OpenCore Bootloader
Download from: https://github.com/acidanthera/OpenCorePkg
- Configure according to Dortania's OpenCore Install Guide
- Convert to qcow2 format: `qemu-img convert -f raw -O qcow2 OpenCore.img OpenCore.qcow2`

### macOS Installer
- Download from Mac App Store (if you have a Mac)
- Use recovery images for installation
- Convert DMG to qcow2: `qemu-img convert -f dmg -O qcow2 installer.dmg installer.qcow2`

## Performance Tips

1. **Enable KVM acceleration** (Linux only)
2. **Allocate sufficient RAM** (8GB+ recommended)
3. **Use SSD storage** for better performance
4. **Close unnecessary applications** while running VMs

## Troubleshooting

### VM won't start
- Check if QEMU is installed: `qemu-system-x86_64 --version`
- Verify KVM permissions: `ls -la /dev/kvm`
- Check Docker logs: `docker-compose logs`

### Poor performance
- Ensure KVM is enabled and accessible
- Increase VM memory allocation
- Check host system resources

### Legal Notice
Please ensure you comply with Apple's Software License Agreement when using macOS.
This software is for educational and development purposes only.
EOF
    
    log_success "Documentation created: ./SETUP.md"
}

# Main installation function
main() {
    echo "🍎 Silicon M1 Apple Emulator - Linux Installation"
    echo "=================================================="
    echo ""
    
    check_root
    detect_distro
    check_requirements
    
    echo ""
    log_info "Starting installation..."
    
    install_docker
    install_qemu
    setup_kvm
    create_directories
    setup_emulator
    create_startup_script
    create_documentation
    
    echo ""
    log_success "Installation completed successfully!"
    echo ""
    echo "🔄 Please log out and log back in for group changes to take effect."
    echo "🚀 Then run: ./start-emulator.sh to start the emulator"
    echo ""
    echo "📖 Read SETUP.md for detailed setup instructions"
    echo "🌐 Web interface will be available at: http://localhost"
    echo ""
}

# Run main function
main "$@"

