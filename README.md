# 🍎 Silicon M1 Apple Emulator

A powerful, cross-platform macOS virtualization solution that enables running macOS on Windows and Linux systems using QEMU and Docker containerization.

![Silicon Emulator](https://img.shields.io/badge/Platform-Windows%20%7C%20Linux-blue)
![License](https://img.shields.io/badge/License-MIT-green)
![Docker](https://img.shields.io/badge/Docker-Ready-blue)
![QEMU](https://img.shields.io/badge/QEMU-Powered-orange)

## ✨ Features

- 🖥️ **Cross-Platform**: Works on Windows 10/11 and Linux distributions
- 🐳 **Docker Containerized**: Easy deployment and isolation
- ⚡ **Hardware Acceleration**: KVM on Linux, WHPX on Windows
- 🎮 **Web Interface**: Modern React-based management UI
- 📊 **Real-time Monitoring**: Performance metrics and console access
- 🔧 **Template System**: Pre-configured macOS versions
- 💾 **Disk Management**: Upload and manage disk images
- 🌐 **VNC Access**: Remote desktop through web browser

## 🚀 Quick Start

### Linux Installation

```bash
# Clone the repository
git clone https://github.com/MarbleCeo/silicon-M1-Apple-emulator.git
cd silicon-M1-Apple-emulator

# Run the installation script
chmod +x install.sh
./install.sh

# Start the emulator
./start-emulator.sh
```

### Windows Installation

```powershell
# Clone the repository
git clone https://github.com/MarbleCeo/silicon-M1-Apple-emulator.git
cd silicon-M1-Apple-emulator

# Run the installation script as Administrator
Set-ExecutionPolicy Bypass -Scope Process -Force
.\install.ps1

# Start the emulator
.\start-emulator.bat
```

## 📋 System Requirements

### Minimum Requirements
- **OS**: Windows 10 (1903+) or Linux (Ubuntu 20.04+, Fedora 35+, etc.)
- **RAM**: 8GB (16GB recommended)
- **Storage**: 100GB free space
- **CPU**: x86_64 with virtualization support (Intel VT-x or AMD-V)

### Recommended Requirements
- **RAM**: 16GB or more
- **Storage**: 200GB+ SSD
- **CPU**: 6+ cores with hardware virtualization
- **GPU**: Dedicated graphics card (for better performance)

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Web Interface (React)                    │
├─────────────────────────────────────────────────────────────┤
│                    Backend API (Node.js)                   │
├─────────────────────────────────────────────────────────────┤
│                    QEMU Virtualization                     │
├─────────────────────────────────────────────────────────────┤
│              Docker Container Environment                   │
├─────────────────────────────────────────────────────────────┤
│                Host OS (Windows/Linux)                     │
└─────────────────────────────────────────────────────────────┘
```

## 🔧 Configuration

### Required Files

1. **OpenCore Bootloader**
   - Download from [OpenCore Releases](https://github.com/acidanthera/OpenCorePkg/releases)
   - Configure using [Dortania's Guide](https://dortania.github.io/OpenCore-Install-Guide/)
   - Place in `data/disk-images/bootloaders/`

2. **macOS Installer**
   - Download from Mac App Store or create recovery images
   - Convert to qcow2 format: `qemu-img convert -f dmg -O qcow2 installer.dmg installer.qcow2`
   - Place in `data/disk-images/macos-installers/`

### VM Templates

The emulator includes pre-configured templates for:
- macOS Monterey (12.x)
- macOS Ventura (13.x)
- macOS Sonoma (14.x)

## 🌐 Access Points

Once running, access the emulator through:

- **Web Interface**: http://localhost
- **Backend API**: http://localhost:3001
- **noVNC Console**: http://localhost:6080
- **VNC Direct**: `localhost:5900` (VM-specific ports)

## 📖 Usage Guide

### Creating Your First VM

1. **Access the web interface** at http://localhost
2. **Navigate to "Disk Images"** and upload your OpenCore bootloader
3. **Upload macOS installer** image
4. **Go to Dashboard** and click "Create VM"
5. **Configure VM settings**:
   - Name: Your VM name
   - Template: Choose macOS version
   - Memory: 8GB+ recommended
   - CPUs: 4+ recommended
   - Disk Image: Select your installer
6. **Start the VM** and access via VNC

### Managing VMs

- **Start/Stop**: Use the dashboard controls
- **Console Access**: Click "Console" tab for terminal access
- **Performance**: Monitor CPU, memory, and disk usage
- **Snapshots**: Create restore points (coming soon)

## 🔍 Troubleshooting

### Common Issues

**VM won't start**
```bash
# Check QEMU installation
qemu-system-x86_64 --version

# Verify Docker is running
docker info

# Check logs
docker-compose logs
```

**Poor performance**
- Ensure hardware virtualization is enabled in BIOS
- Allocate more RAM to the VM
- Use SSD storage for better I/O
- Close unnecessary host applications

**VNC connection issues**
- Check firewall settings
- Verify VNC port is not in use
- Try different VNC client

### Getting Help

1. Check the [Troubleshooting Guide](docs/TROUBLESHOOTING.md)
2. Review [Configuration Documentation](docs/CONFIGURATION.md)
3. Search existing [GitHub Issues](https://github.com/MarbleCeo/silicon-M1-Apple-emulator/issues)
4. Create a new issue with detailed information

## 🏗️ Development

### Building from Source

```bash
# Clone repository
git clone https://github.com/MarbleCeo/silicon-M1-Apple-emulator.git
cd silicon-M1-Apple-emulator

# Install frontend dependencies
npm install

# Install backend dependencies
cd backend
npm install

# Build frontend
npm run build

# Build Docker image
docker build -t silicon-emulator .
```

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## ⚖️ Legal Notice

**Important**: This software is for educational and development purposes only. 

- You must own a legitimate copy of macOS to use this emulator
- Comply with Apple's Software License Agreement
- This project does not include any Apple copyrighted material
- Users are responsible for obtaining legal copies of macOS and required software

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [QEMU Project](https://www.qemu.org/) - Virtualization engine
- [OpenCore](https://github.com/acidanthera/OpenCorePkg) - Bootloader
- [Dortania](https://dortania.github.io/) - Installation guides
- [Docker](https://www.docker.com/) - Containerization platform

## 📊 Project Status

- ✅ Core virtualization engine
- ✅ Web-based management interface
- ✅ Cross-platform support (Windows/Linux)
- ✅ Docker containerization
- ✅ Real-time monitoring
- 🔄 Snapshot management (in progress)
- 🔄 Network configuration (in progress)
- 🔄 GPU passthrough (planned)

---

**Star ⭐ this repository if you find it useful!**

For questions, suggestions, or support, please [open an issue](https://github.com/MarbleCeo/silicon-M1-Apple-emulator/issues).

