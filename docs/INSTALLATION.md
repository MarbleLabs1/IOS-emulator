# 📦 Installation Guide

This guide provides detailed installation instructions for the Silicon M1 Apple Emulator on both Windows and Linux systems.

## 🐧 Linux Installation

### Supported Distributions

- Ubuntu 20.04+ / Debian 11+
- Fedora 35+ / CentOS 8+
- Arch Linux
- openSUSE Leap 15.3+

### Automated Installation

The easiest way to install on Linux is using the automated script:

```bash
# Clone the repository
git clone https://github.com/MarbleCeo/silicon-M1-Apple-emulator.git
cd silicon-M1-Apple-emulator

# Make the script executable
chmod +x install.sh

# Run the installation (will prompt for sudo password)
./install.sh
```

### Manual Installation

If you prefer to install manually or the script doesn't work for your distribution:

#### 1. Install Docker

**Ubuntu/Debian:**
```bash
# Update package index
sudo apt-get update

# Install prerequisites
sudo apt-get install -y apt-transport-https ca-certificates curl gnupg lsb-release

# Add Docker's GPG key
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

# Add Docker repository
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Add user to docker group
sudo usermod -aG docker $USER
```

**Fedora/CentOS:**
```bash
# Install Docker
sudo dnf install -y docker docker-compose

# Start and enable Docker
sudo systemctl start docker
sudo systemctl enable docker

# Add user to docker group
sudo usermod -aG docker $USER
```

**Arch Linux:**
```bash
# Install Docker
sudo pacman -S docker docker-compose

# Start and enable Docker
sudo systemctl start docker
sudo systemctl enable docker

# Add user to docker group
sudo usermod -aG docker $USER
```

#### 2. Install QEMU

**Ubuntu/Debian:**
```bash
sudo apt-get install -y qemu-system-x86 qemu-system-aarch64 qemu-utils qemu-kvm libvirt-daemon-system libvirt-clients bridge-utils virt-manager ovmf
```

**Fedora/CentOS:**
```bash
sudo dnf install -y qemu-system-x86 qemu-system-aarch64 qemu-img qemu-kvm libvirt virt-manager edk2-ovmf
```

**Arch Linux:**
```bash
sudo pacman -S qemu-system-x86_64 qemu-system-aarch64 qemu-img libvirt virt-manager edk2-ovmf
```

#### 3. Setup KVM (Linux only)

```bash
# Add user to KVM and libvirt groups
sudo usermod -aG kvm $USER
sudo usermod -aG libvirt $USER

# Start and enable libvirt
sudo systemctl start libvirtd
sudo systemctl enable libvirtd

# Verify KVM is available
ls -la /dev/kvm
```

#### 4. Build and Run

```bash
# Create project directories
mkdir -p data/{vms,disk-images,logs}

# Build Docker image
docker build -t silicon-emulator .

# Start the emulator
docker-compose up -d
```

### Post-Installation

1. **Log out and log back in** for group changes to take effect
2. **Verify installation**:
   ```bash
   docker --version
   qemu-system-x86_64 --version
   ls -la /dev/kvm  # Should show KVM device
   ```
3. **Start the emulator**:
   ```bash
   ./start-emulator.sh
   ```

---

## 🪟 Windows Installation

### System Requirements

- Windows 10 version 1903 (build 18362) or later
- Windows 11 (any version)
- Administrator privileges
- Hardware virtualization enabled in BIOS

### Automated Installation

Run the PowerShell script as Administrator:

```powershell
# Open PowerShell as Administrator
# Navigate to the project directory
cd silicon-M1-Apple-emulator

# Set execution policy for this session
Set-ExecutionPolicy Bypass -Scope Process -Force

# Run the installation script
.\install.ps1
```

### Manual Installation

#### 1. Enable Required Windows Features

**Enable WSL2:**
```powershell
# Enable WSL feature
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart

# Enable Virtual Machine Platform
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart

# Restart computer
Restart-Computer
```

**After restart, complete WSL2 setup:**
```powershell
# Download and install WSL2 kernel update
Invoke-WebRequest -Uri "https://wslstorestorage.blob.core.windows.net/wslblob/wsl_update_x64.msi" -OutFile "wsl_update_x64.msi"
Start-Process msiexec.exe -Wait -ArgumentList "/i wsl_update_x64.msi /quiet"

# Set WSL2 as default
wsl --set-default-version 2
```

**Alternative: Enable Hyper-V (Windows Pro/Enterprise):**
```powershell
Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V -All
```

#### 2. Install Chocolatey

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
```

#### 3. Install Docker Desktop

```powershell
# Using Chocolatey
choco install docker-desktop -y

# Or download manually from https://www.docker.com/products/docker-desktop
```

#### 4. Install QEMU

```powershell
# Using Chocolatey
choco install qemu -y

# Or download manually from https://www.qemu.org/download/#windows
```

#### 5. Configure Docker Desktop

1. **Start Docker Desktop**
2. **Go to Settings → General**
3. **Enable "Use the WSL 2 based engine"**
4. **Go to Settings → Resources → WSL Integration**
5. **Enable integration with your WSL distributions**

#### 6. Build and Run

```powershell
# Create project directories
New-Item -ItemType Directory -Path "data\vms" -Force
New-Item -ItemType Directory -Path "data\disk-images" -Force
New-Item -ItemType Directory -Path "data\logs" -Force

# Build Docker image
docker build -t silicon-emulator .

# Start the emulator
docker-compose -f docker-compose.yml -f docker-compose.windows.yml up -d
```

### Post-Installation

1. **Restart your computer** to complete setup
2. **Start Docker Desktop** and ensure it's running
3. **Verify installation**:
   ```powershell
   docker --version
   qemu-system-x86_64 --version
   ```
4. **Start the emulator**:
   ```cmd
   start-emulator.bat
   ```

---

## 🔧 Configuration

### Environment Variables

Create a `.env` file in the project root:

```env
# Backend configuration
NODE_ENV=production
PORT=3001
FRONTEND_URL=http://localhost

# VNC configuration
VNC_PASSWORD=silicon123

# QEMU configuration
QEMU_ACCEL=kvm  # or tcg for software emulation
```

### Docker Compose Override

Create `docker-compose.override.yml` for custom settings:

```yaml
version: '3.8'

services:
  silicon-emulator:
    environment:
      - CUSTOM_VAR=value
    volumes:
      - ./custom-data:/app/custom
    ports:
      - "8080:80"  # Custom port mapping
```

### Firewall Configuration

**Linux (UFW):**
```bash
sudo ufw allow 3001/tcp  # Backend API
sudo ufw allow 80/tcp    # Frontend
sudo ufw allow 5900:5999/tcp  # VNC ports
sudo ufw allow 6080/tcp  # noVNC
```

**Windows Firewall:**
```powershell
# Allow Docker Desktop through firewall
New-NetFirewallRule -DisplayName "Silicon Emulator" -Direction Inbound -Protocol TCP -LocalPort 80,3001,5900-5999,6080 -Action Allow
```

---

## 🔍 Verification

### Health Checks

1. **Check Docker containers**:
   ```bash
   docker-compose ps
   ```

2. **Check backend health**:
   ```bash
   curl http://localhost:3001/health
   ```

3. **Access web interface**:
   Open http://localhost in your browser

4. **Check QEMU availability**:
   ```bash
   # Linux
   qemu-system-x86_64 --version
   
   # Windows
   qemu-system-x86_64.exe --version
   ```

### Performance Testing

Run the built-in system check:
```bash
# Linux
./scripts/check-requirements.sh

# Windows
.\scripts\check-requirements.ps1
```

---

## 🚨 Troubleshooting

### Common Issues

**Docker permission denied (Linux)**:
```bash
# Add user to docker group and restart
sudo usermod -aG docker $USER
# Log out and log back in
```

**KVM permission denied (Linux)**:
```bash
# Check KVM permissions
ls -la /dev/kvm
sudo chmod 666 /dev/kvm
```

**WSL2 not working (Windows)**:
```powershell
# Check WSL status
wsl --status
# Update WSL
wsl --update
```

**Docker Desktop won't start (Windows)**:
1. Restart Docker Desktop
2. Check Windows features are enabled
3. Restart computer
4. Reinstall Docker Desktop if needed

### Getting Help

If you encounter issues:

1. Check the [Troubleshooting Guide](TROUBLESHOOTING.md)
2. Review Docker and QEMU logs
3. Search [GitHub Issues](https://github.com/MarbleCeo/silicon-M1-Apple-emulator/issues)
4. Create a new issue with:
   - Operating system and version
   - Error messages
   - Steps to reproduce
   - System specifications

---

## 📚 Next Steps

After successful installation:

1. Read the [Configuration Guide](CONFIGURATION.md)
2. Follow the [Quick Start Tutorial](../README.md#quick-start)
3. Upload your OpenCore bootloader and macOS installer
4. Create your first virtual machine

---

**Need help?** Join our community or open an issue on GitHub!

