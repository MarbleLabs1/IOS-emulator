# Silicon M1 Apple Emulator - Windows Installation Script
# This script installs Docker Desktop, QEMU, and sets up the emulator environment

param(
    [switch]$SkipChecks,
    [switch]$Force
)

# Set execution policy for this session
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process -Force

# Colors for output
$Colors = @{
    Red = "Red"
    Green = "Green"
    Yellow = "Yellow"
    Blue = "Blue"
    White = "White"
}

function Write-Log {
    param(
        [string]$Message,
        [string]$Level = "Info"
    )
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    
    switch ($Level) {
        "Info" { 
            Write-Host "[$timestamp] [INFO] $Message" -ForegroundColor $Colors.Blue
        }
        "Success" { 
            Write-Host "[$timestamp] [SUCCESS] $Message" -ForegroundColor $Colors.Green
        }
        "Warning" { 
            Write-Host "[$timestamp] [WARNING] $Message" -ForegroundColor $Colors.Yellow
        }
        "Error" { 
            Write-Host "[$timestamp] [ERROR] $Message" -ForegroundColor $Colors.Red
        }
    }
}

function Test-Administrator {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Test-WindowsVersion {
    $version = [System.Environment]::OSVersion.Version
    $build = [System.Environment]::OSVersion.Version.Build
    
    Write-Log "Windows Version: $($version.Major).$($version.Minor) Build $build"
    
    # Windows 10 version 1903 (build 18362) or later required for WSL2
    if ($version.Major -eq 10 -and $build -ge 18362) {
        return $true
    }
    elseif ($version.Major -gt 10) {
        return $true
    }
    else {
        return $false
    }
}

function Test-HyperV {
    Write-Log "Checking Hyper-V support..."
    
    try {
        $hyperv = Get-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V-All
        if ($hyperv.State -eq "Enabled") {
            Write-Log "Hyper-V is enabled" -Level "Success"
            return $true
        }
        else {
            Write-Log "Hyper-V is not enabled" -Level "Warning"
            return $false
        }
    }
    catch {
        Write-Log "Could not check Hyper-V status: $($_.Exception.Message)" -Level "Warning"
        return $false
    }
}

function Test-WSL2 {
    Write-Log "Checking WSL2 support..."
    
    try {
        $wsl = wsl --status 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Log "WSL2 is available" -Level "Success"
            return $true
        }
        else {
            Write-Log "WSL2 is not available" -Level "Warning"
            return $false
        }
    }
    catch {
        Write-Log "WSL2 is not installed" -Level "Warning"
        return $false
    }
}

function Test-Virtualization {
    Write-Log "Checking CPU virtualization support..."
    
    try {
        $cpu = Get-WmiObject -Class Win32_Processor
        $vmx = $cpu.Name -match "Intel" -and (Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Control\DeviceGuard" -Name "EnableVirtualizationBasedSecurity" -ErrorAction SilentlyContinue)
        $svm = $cpu.Name -match "AMD"
        
        if ($vmx -or $svm) {
            Write-Log "CPU virtualization support detected" -Level "Success"
            return $true
        }
        else {
            Write-Log "CPU virtualization support not clearly detected" -Level "Warning"
            return $false
        }
    }
    catch {
        Write-Log "Could not check virtualization support: $($_.Exception.Message)" -Level "Warning"
        return $false
    }
}

function Test-SystemRequirements {
    Write-Log "Checking system requirements..."
    
    # Check memory (minimum 8GB recommended)
    $memory = [math]::Round((Get-CimInstance Win32_PhysicalMemory | Measure-Object -Property capacity -Sum).sum / 1GB, 2)
    if ($memory -lt 8) {
        Write-Log "System has ${memory}GB RAM. 8GB+ recommended for macOS VMs." -Level "Warning"
    }
    else {
        Write-Log "Memory: ${memory}GB available" -Level "Success"
    }
    
    # Check disk space (minimum 100GB recommended)
    $disk = Get-WmiObject -Class Win32_LogicalDisk -Filter "DeviceID='C:'"
    $freeSpaceGB = [math]::Round($disk.FreeSpace / 1GB, 2)
    if ($freeSpaceGB -lt 100) {
        Write-Log "Only ${freeSpaceGB}GB disk space available. 100GB+ recommended." -Level "Warning"
    }
    else {
        Write-Log "Disk space: ${freeSpaceGB}GB available" -Level "Success"
    }
}

function Install-Chocolatey {
    Write-Log "Installing Chocolatey package manager..."
    
    if (Get-Command choco -ErrorAction SilentlyContinue) {
        Write-Log "Chocolatey is already installed" -Level "Success"
        return
    }
    
    try {
        Set-ExecutionPolicy Bypass -Scope Process -Force
        [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
        Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
        
        # Refresh environment variables
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        
        Write-Log "Chocolatey installed successfully" -Level "Success"
    }
    catch {
        Write-Log "Failed to install Chocolatey: $($_.Exception.Message)" -Level "Error"
        throw
    }
}

function Install-DockerDesktop {
    Write-Log "Installing Docker Desktop..."
    
    if (Get-Command docker -ErrorAction SilentlyContinue) {
        Write-Log "Docker is already installed" -Level "Success"
        return
    }
    
    try {
        choco install docker-desktop -y
        Write-Log "Docker Desktop installed successfully" -Level "Success"
        Write-Log "Please restart your computer and start Docker Desktop manually" -Level "Warning"
    }
    catch {
        Write-Log "Failed to install Docker Desktop: $($_.Exception.Message)" -Level "Error"
        Write-Log "Please install Docker Desktop manually from https://www.docker.com/products/docker-desktop" -Level "Info"
    }
}

function Install-QEMU {
    Write-Log "Installing QEMU..."
    
    if (Get-Command qemu-system-x86_64 -ErrorAction SilentlyContinue) {
        Write-Log "QEMU is already installed" -Level "Success"
        return
    }
    
    try {
        choco install qemu -y
        
        # Refresh environment variables
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        
        Write-Log "QEMU installed successfully" -Level "Success"
    }
    catch {
        Write-Log "Failed to install QEMU via Chocolatey: $($_.Exception.Message)" -Level "Warning"
        Write-Log "Please install QEMU manually from https://www.qemu.org/download/#windows" -Level "Info"
    }
}

function Enable-WSL2 {
    Write-Log "Enabling WSL2..."
    
    try {
        # Enable WSL feature
        dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
        
        # Enable Virtual Machine Platform
        dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
        
        Write-Log "WSL2 features enabled. Restart required." -Level "Success"
        
        # Download and install WSL2 kernel update
        $kernelUrl = "https://wslstorestorage.blob.core.windows.net/wslblob/wsl_update_x64.msi"
        $kernelPath = "$env:TEMP\wsl_update_x64.msi"
        
        Write-Log "Downloading WSL2 kernel update..."
        Invoke-WebRequest -Uri $kernelUrl -OutFile $kernelPath
        
        Write-Log "Installing WSL2 kernel update..."
        Start-Process msiexec.exe -Wait -ArgumentList "/i $kernelPath /quiet"
        
        # Set WSL2 as default
        wsl --set-default-version 2
        
        Write-Log "WSL2 setup completed" -Level "Success"
    }
    catch {
        Write-Log "Failed to enable WSL2: $($_.Exception.Message)" -Level "Error"
    }
}

function Enable-HyperV {
    Write-Log "Enabling Hyper-V..."
    
    try {
        Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V -All -NoRestart
        Write-Log "Hyper-V enabled. Restart required." -Level "Success"
    }
    catch {
        Write-Log "Failed to enable Hyper-V: $($_.Exception.Message)" -Level "Error"
        Write-Log "Please enable Hyper-V manually through Windows Features" -Level "Info"
    }
}

function New-ProjectDirectories {
    Write-Log "Creating project directories..."
    
    $directories = @(
        "data\vms",
        "data\disk-images",
        "data\logs",
        "data\disk-images\bootloaders",
        "data\disk-images\macos-installers",
        "data\disk-images\vm-disks"
    )
    
    foreach ($dir in $directories) {
        if (!(Test-Path $dir)) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
        }
    }
    
    Write-Log "Project directories created" -Level "Success"
}

function New-WindowsDockerfile {
    Write-Log "Creating Windows-specific Dockerfile..."
    
    $dockerfileContent = @"
# Windows-specific Dockerfile for Silicon M1 Apple Emulator
FROM mcr.microsoft.com/windows/servercore:ltsc2022

# Install Chocolatey
RUN powershell -Command \
    Set-ExecutionPolicy Bypass -Scope Process -Force; \
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; \
    iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Install Node.js and QEMU
RUN choco install nodejs qemu -y

# Set working directory
WORKDIR C:\app

# Copy backend code
COPY backend\ C:\app\backend\

# Install backend dependencies
WORKDIR C:\app\backend
RUN npm ci --only=production

# Copy frontend build
COPY frontend\dist C:\app\frontend\

# Expose ports
EXPOSE 3001 80 5900-5999 6080

# Set environment variables
ENV NODE_ENV=production
ENV QEMU_ACCEL=tcg

# Start command
CMD ["node", "server.js"]
"@
    
    $dockerfileContent | Out-File -FilePath "docker\windows.dockerfile" -Encoding UTF8
    Write-Log "Windows Dockerfile created" -Level "Success"
}

function New-StartupScript {
    Write-Log "Creating startup script..."
    
    $startupScript = @"
@echo off
echo 🍎 Starting Silicon M1 Apple Emulator for Windows...

REM Check if Docker is running
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker is not running. Please start Docker Desktop first.
    pause
    exit /b 1
)

REM Start the emulator
docker-compose -f docker-compose.yml -f docker-compose.windows.yml up -d

echo ✅ Emulator started successfully!
echo.
echo 📊 Access points:
echo    • Web Interface: http://localhost
echo    • Backend API: http://localhost:3001
echo    • noVNC Console: http://localhost:6080
echo.
echo 📖 Next steps:
echo    1. Upload OpenCore bootloader files
echo    2. Upload macOS installer images
echo    3. Create your first VM
echo.
echo 🛑 To stop the emulator, run: docker-compose down
pause
"@
    
    $startupScript | Out-File -FilePath "start-emulator.bat" -Encoding ASCII
    Write-Log "Startup script created: start-emulator.bat" -Level "Success"
}

function New-WindowsDockerCompose {
    Write-Log "Creating Windows Docker Compose configuration..."
    
    $dockerComposeWindows = @"
version: '3.8'

services:
  silicon-emulator:
    build:
      context: .
      dockerfile: docker/windows.dockerfile
    container_name: silicon-emulator-windows
    ports:
      - "3001:3001"
      - "80:80"
      - "5900-5910:5900-5910"
      - "6080:6080"
    volumes:
      - .\data\vms:C:\app\vms
      - .\data\disk-images:C:\app\disk-images
      - .\data\logs:C:\app\logs
    environment:
      - NODE_ENV=production
      - FRONTEND_URL=http://localhost
      - VNC_PASSWORD=silicon123
      - QEMU_ACCEL=tcg
    restart: unless-stopped
"@
    
    $dockerComposeWindows | Out-File -FilePath "docker-compose.windows.yml" -Encoding UTF8
    Write-Log "Windows Docker Compose configuration created" -Level "Success"
}

function New-Documentation {
    Write-Log "Creating Windows documentation..."
    
    $setupGuide = @"
# Silicon M1 Apple Emulator - Windows Setup Guide

## Prerequisites

1. **Windows 10/11** (version 1903 or later)
2. **Docker Desktop** with WSL2 backend
3. **8GB+ RAM** (16GB recommended)
4. **100GB+ free disk space**
5. **CPU virtualization support** (Intel VT-x or AMD-V)

## Quick Start

1. **Start Docker Desktop** (ensure it's running)

2. **Run the startup script:**
   ```cmd
   start-emulator.bat
   ```

3. **Access the web interface:**
   Open http://localhost in your browser

## Performance Notes

- **Windows uses TCG emulation** (no KVM acceleration)
- **Performance will be slower** than Linux with KVM
- **Allocate maximum resources** to Docker Desktop
- **Close unnecessary applications** while running VMs

## Required Files

### OpenCore Bootloader
- Download from: https://github.com/acidanthera/OpenCorePkg
- Place in: `data\disk-images\bootloaders\`

### macOS Installer
- Create recovery images or use existing installers
- Place in: `data\disk-images\macos-installers\`

## Troubleshooting

### Docker Issues
- Ensure Docker Desktop is running
- Check WSL2 integration is enabled
- Restart Docker Desktop if needed

### Performance Issues
- Increase Docker Desktop memory allocation
- Enable hardware acceleration in BIOS
- Use SSD storage for better I/O performance

### Legal Notice
Please ensure you comply with Apple's Software License Agreement when using macOS.
This software is for educational and development purposes only.
"@
    
    $setupGuide | Out-File -FilePath "SETUP-WINDOWS.md" -Encoding UTF8
    Write-Log "Windows documentation created: SETUP-WINDOWS.md" -Level "Success"
}

function Main {
    Write-Host "🍎 Silicon M1 Apple Emulator - Windows Installation" -ForegroundColor $Colors.Blue
    Write-Host "====================================================" -ForegroundColor $Colors.Blue
    Write-Host ""
    
    # Check if running as administrator
    if (-not (Test-Administrator)) {
        Write-Log "This script requires administrator privileges. Please run as administrator." -Level "Error"
        Read-Host "Press Enter to exit"
        exit 1
    }
    
    # Check Windows version
    if (-not (Test-WindowsVersion)) {
        Write-Log "Windows 10 version 1903 (build 18362) or later is required." -Level "Error"
        Read-Host "Press Enter to exit"
        exit 1
    }
    
    if (-not $SkipChecks) {
        Test-SystemRequirements
        Test-Virtualization
        
        $hypervEnabled = Test-HyperV
        $wsl2Available = Test-WSL2
        
        if (-not $hypervEnabled -and -not $wsl2Available) {
            Write-Log "Neither Hyper-V nor WSL2 is available. Enabling WSL2..." -Level "Warning"
            Enable-WSL2
        }
    }
    
    Write-Log "Starting installation..."
    
    try {
        Install-Chocolatey
        Install-DockerDesktop
        Install-QEMU
        New-ProjectDirectories
        New-WindowsDockerfile
        New-WindowsDockerCompose
        New-StartupScript
        New-Documentation
        
        Write-Host ""
        Write-Log "Installation completed successfully!" -Level "Success"
        Write-Host ""
        Write-Host "🔄 Please restart your computer to complete the setup." -ForegroundColor $Colors.Yellow
        Write-Host "🐳 Start Docker Desktop after restart." -ForegroundColor $Colors.Yellow
        Write-Host "🚀 Then run: start-emulator.bat to start the emulator" -ForegroundColor $Colors.Green
        Write-Host ""
        Write-Host "📖 Read SETUP-WINDOWS.md for detailed setup instructions" -ForegroundColor $Colors.Blue
        Write-Host "🌐 Web interface will be available at: http://localhost" -ForegroundColor $Colors.Blue
        Write-Host ""
        
        $restart = Read-Host "Would you like to restart now? (y/N)"
        if ($restart -eq "y" -or $restart -eq "Y") {
            Restart-Computer -Force
        }
    }
    catch {
        Write-Log "Installation failed: $($_.Exception.Message)" -Level "Error"
        Read-Host "Press Enter to exit"
        exit 1
    }
}

# Run main function
Main

