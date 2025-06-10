const { spawn, exec } = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.simple(),
  transports: [new winston.transports.Console()]
});

class QemuService {
  constructor() {
    this.qemuPath = null;
    this.qemuVersion = null;
    this.capabilities = {};
    this.runningVMs = new Map();
  }

  async initialize() {
    try {
      await this.detectQemu();
      await this.getCapabilities();
      logger.info('QEMU service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize QEMU service:', error);
      throw error;
    }
  }

  async detectQemu() {
    const possiblePaths = [
      'qemu-system-aarch64',
      'qemu-system-x86_64',
      '/usr/bin/qemu-system-aarch64',
      '/usr/bin/qemu-system-x86_64',
      '/usr/local/bin/qemu-system-aarch64',
      '/usr/local/bin/qemu-system-x86_64'
    ];

    for (const qemuPath of possiblePaths) {
      try {
        await this.execCommand(`${qemuPath} --version`);
        this.qemuPath = qemuPath;
        logger.info(`Found QEMU at: ${qemuPath}`);
        return;
      } catch (error) {
        continue;
      }
    }

    throw new Error('QEMU not found. Please install QEMU first.');
  }

  async getCapabilities() {
    try {
      const versionOutput = await this.execCommand(`${this.qemuPath} --version`);
      this.qemuVersion = versionOutput.split('\n')[0];

      // Check for KVM support on Linux
      if (os.platform() === 'linux') {
        try {
          await fs.access('/dev/kvm');
          this.capabilities.kvm = true;
        } catch {
          this.capabilities.kvm = false;
        }
      }

      // Check for WHPX support on Windows
      if (os.platform() === 'win32') {
        this.capabilities.whpx = await this.checkWHPX();
      }

      // Check for HVF support on macOS
      if (os.platform() === 'darwin') {
        this.capabilities.hvf = await this.checkHVF();
      }

      this.capabilities.tcg = true; // TCG is always available
      
      logger.info('QEMU capabilities:', this.capabilities);
    } catch (error) {
      logger.error('Failed to get QEMU capabilities:', error);
    }
  }

  async checkWHPX() {
    try {
      const output = await this.execCommand('powershell "Get-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V-Hypervisor"');
      return output.includes('Enabled');
    } catch {
      return false;
    }
  }

  async checkHVF() {
    try {
      const output = await this.execCommand('sysctl kern.hv_support');
      return output.includes('kern.hv_support: 1');
    } catch {
      return false;
    }
  }

  generateMacOSCommand(vmConfig) {
    const {
      id,
      name,
      memory = 8192,
      cpus = 4,
      diskImage,
      bootloader = 'OpenCore.qcow2',
      vncPort = 5900,
      enableAcceleration = true
    } = vmConfig;

    let cmd = [this.qemuPath];

    // Basic system configuration
    cmd.push('-machine', 'q35');
    cmd.push('-cpu', 'Penryn,kvm=on,vendor=GenuineIntel,+invtsc,vmware-cpuid-freq=on');
    cmd.push('-smp', `${cpus},cores=${Math.min(cpus, 4)},threads=${Math.ceil(cpus/4)}`);
    cmd.push('-m', `${memory}M`);

    // Acceleration
    if (enableAcceleration) {
      if (os.platform() === 'linux' && this.capabilities.kvm) {
        cmd.push('-accel', 'kvm');
      } else if (os.platform() === 'win32' && this.capabilities.whpx) {
        cmd.push('-accel', 'whpx');
      } else if (os.platform() === 'darwin' && this.capabilities.hvf) {
        cmd.push('-accel', 'hvf');
      } else {
        cmd.push('-accel', 'tcg');
      }
    } else {
      cmd.push('-accel', 'tcg');
    }

    // UEFI firmware
    cmd.push('-drive', 'if=pflash,format=raw,readonly=on,file=OVMF_CODE.fd');
    cmd.push('-drive', 'if=pflash,format=raw,file=OVMF_VARS.fd');

    // Disk drives
    if (bootloader) {
      cmd.push('-drive', `file=${path.join(__dirname, '../disk-images', bootloader)},if=virtio,format=qcow2`);
    }
    
    if (diskImage) {
      cmd.push('-drive', `file=${path.join(__dirname, '../disk-images', diskImage)},if=virtio,format=qcow2`);
    }

    // Network
    cmd.push('-netdev', 'user,id=net0,hostfwd=tcp::2222-:22');
    cmd.push('-device', 'virtio-net-pci,netdev=net0,id=net0,mac=52:54:00:c9:18:27');

    // Audio
    cmd.push('-audiodev', 'none,id=none');
    cmd.push('-device', 'ich9-intel-hda');
    cmd.push('-device', 'hda-duplex,audiodev=none');

    // USB
    cmd.push('-usb');
    cmd.push('-device', 'usb-kbd');
    cmd.push('-device', 'usb-tablet');

    // Display
    cmd.push('-vga', 'virtio');
    cmd.push('-display', 'vnc=:' + (vncPort - 5900));

    // macOS specific optimizations
    cmd.push('-device', 'isa-applesmc,osk=ourhardworkbythesewordsguardedpleasedontsteal(c)AppleComputerInc');
    cmd.push('-smbios', 'type=2');

    // Performance optimizations
    cmd.push('-global', 'kvm-pit.lost_tick_policy=discard');
    cmd.push('-global', 'ICH9-LPC.acpi-pci-hotplug-with-bridge-support=off');

    return cmd;
  }

  async startVM(vmConfig) {
    const vmId = vmConfig.id;
    
    if (this.runningVMs.has(vmId)) {
      throw new Error(`VM ${vmId} is already running`);
    }

    const command = this.generateMacOSCommand(vmConfig);
    logger.info(`Starting VM ${vmId} with command:`, command.join(' '));

    const qemuProcess = spawn(command[0], command.slice(1), {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: path.join(__dirname, '../'),
      env: { ...process.env }
    });

    const vmInstance = {
      process: qemuProcess,
      config: vmConfig,
      startTime: new Date(),
      status: 'starting'
    };

    this.runningVMs.set(vmId, vmInstance);

    // Handle process events
    qemuProcess.on('spawn', () => {
      logger.info(`VM ${vmId} process spawned successfully`);
      vmInstance.status = 'running';
    });

    qemuProcess.on('error', (error) => {
      logger.error(`VM ${vmId} process error:`, error);
      vmInstance.status = 'error';
      vmInstance.error = error.message;
    });

    qemuProcess.on('exit', (code, signal) => {
      logger.info(`VM ${vmId} process exited with code ${code}, signal ${signal}`);
      vmInstance.status = 'stopped';
      vmInstance.exitCode = code;
      vmInstance.exitSignal = signal;
    });

    // Capture stdout and stderr
    qemuProcess.stdout.on('data', (data) => {
      vmInstance.lastOutput = data.toString();
    });

    qemuProcess.stderr.on('data', (data) => {
      vmInstance.lastError = data.toString();
      logger.warn(`VM ${vmId} stderr:`, data.toString());
    });

    return vmInstance;
  }

  async stopVM(vmId) {
    const vmInstance = this.runningVMs.get(vmId);
    if (!vmInstance) {
      throw new Error(`VM ${vmId} is not running`);
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        vmInstance.process.kill('SIGKILL');
        reject(new Error('VM shutdown timeout, force killed'));
      }, 30000);

      vmInstance.process.on('exit', () => {
        clearTimeout(timeout);
        this.runningVMs.delete(vmId);
        resolve();
      });

      // Send ACPI shutdown signal
      vmInstance.process.kill('SIGTERM');
    });
  }

  async pauseVM(vmId) {
    const vmInstance = this.runningVMs.get(vmId);
    if (!vmInstance) {
      throw new Error(`VM ${vmId} is not running`);
    }

    vmInstance.process.kill('SIGSTOP');
    vmInstance.status = 'paused';
  }

  async resumeVM(vmId) {
    const vmInstance = this.runningVMs.get(vmId);
    if (!vmInstance) {
      throw new Error(`VM ${vmId} is not running`);
    }

    vmInstance.process.kill('SIGCONT');
    vmInstance.status = 'running';
  }

  getVMStatus(vmId) {
    const vmInstance = this.runningVMs.get(vmId);
    if (!vmInstance) {
      return { status: 'stopped' };
    }

    return {
      status: vmInstance.status,
      pid: vmInstance.process.pid,
      startTime: vmInstance.startTime,
      uptime: Date.now() - vmInstance.startTime.getTime(),
      lastOutput: vmInstance.lastOutput,
      lastError: vmInstance.lastError,
      exitCode: vmInstance.exitCode,
      exitSignal: vmInstance.exitSignal
    };
  }

  isQemuAvailable() {
    return this.qemuPath !== null;
  }

  getQemuVersion() {
    return {
      version: this.qemuVersion,
      path: this.qemuPath,
      capabilities: this.capabilities
    };
  }

  getQemuCapabilities() {
    return this.capabilities;
  }

  async execCommand(command) {
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          resolve(stdout);
        }
      });
    });
  }

  async shutdownAll() {
    const shutdownPromises = [];
    for (const [vmId] of this.runningVMs) {
      shutdownPromises.push(this.stopVM(vmId).catch(err => 
        logger.error(`Failed to shutdown VM ${vmId}:`, err)
      ));
    }
    await Promise.all(shutdownPromises);
  }
}

module.exports = new QemuService();

