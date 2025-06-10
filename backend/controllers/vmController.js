const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const qemuService = require('../services/qemuService');
const si = require('systeminformation');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.simple(),
  transports: [new winston.transports.Console()]
});

const VM_CONFIG_DIR = path.join(__dirname, '../vms');
const DISK_IMAGES_DIR = path.join(__dirname, '../disk-images');
const TEMPLATES_DIR = path.join(__dirname, '../config');

// Ensure directories exist
fs.ensureDirSync(VM_CONFIG_DIR);
fs.ensureDirSync(DISK_IMAGES_DIR);
fs.ensureDirSync(TEMPLATES_DIR);

class VMController {
  constructor() {
    this.monitoringIntervals = new Map();
    this.socketConnections = new Map();
  }

  // VM Management
  async listVMs(req, res) {
    try {
      const vmFiles = await fs.readdir(VM_CONFIG_DIR);
      const vms = [];

      for (const file of vmFiles) {
        if (file.endsWith('.json')) {
          const vmConfig = await fs.readJson(path.join(VM_CONFIG_DIR, file));
          const status = qemuService.getVMStatus(vmConfig.id);
          vms.push({ ...vmConfig, ...status });
        }
      }

      res.json(vms);
    } catch (error) {
      logger.error('Error listing VMs:', error);
      res.status(500).json({ error: 'Failed to list VMs' });
    }
  }

  async createVM(req, res) {
    try {
      const {
        name,
        description,
        memory = 8192,
        cpus = 4,
        diskImage,
        template = 'macos-monterey'
      } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'VM name is required' });
      }

      const vmId = uuidv4();
      const vmConfig = {
        id: vmId,
        name,
        description,
        memory,
        cpus,
        diskImage,
        template,
        vncPort: 5900 + Math.floor(Math.random() * 100),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await fs.writeJson(path.join(VM_CONFIG_DIR, `${vmId}.json`), vmConfig, { spaces: 2 });

      logger.info(`Created VM: ${name} (${vmId})`);
      res.status(201).json(vmConfig);
    } catch (error) {
      logger.error('Error creating VM:', error);
      res.status(500).json({ error: 'Failed to create VM' });
    }
  }

  async getVM(req, res) {
    try {
      const { id } = req.params;
      const vmConfigPath = path.join(VM_CONFIG_DIR, `${id}.json`);

      if (!await fs.pathExists(vmConfigPath)) {
        return res.status(404).json({ error: 'VM not found' });
      }

      const vmConfig = await fs.readJson(vmConfigPath);
      const status = qemuService.getVMStatus(id);

      res.json({ ...vmConfig, ...status });
    } catch (error) {
      logger.error('Error getting VM:', error);
      res.status(500).json({ error: 'Failed to get VM' });
    }
  }

  async updateVM(req, res) {
    try {
      const { id } = req.params;
      const vmConfigPath = path.join(VM_CONFIG_DIR, `${id}.json`);

      if (!await fs.pathExists(vmConfigPath)) {
        return res.status(404).json({ error: 'VM not found' });
      }

      const vmConfig = await fs.readJson(vmConfigPath);
      const updatedConfig = {
        ...vmConfig,
        ...req.body,
        id, // Ensure ID cannot be changed
        updatedAt: new Date().toISOString()
      };

      await fs.writeJson(vmConfigPath, updatedConfig, { spaces: 2 });

      logger.info(`Updated VM: ${updatedConfig.name} (${id})`);
      res.json(updatedConfig);
    } catch (error) {
      logger.error('Error updating VM:', error);
      res.status(500).json({ error: 'Failed to update VM' });
    }
  }

  async deleteVM(req, res) {
    try {
      const { id } = req.params;
      const vmConfigPath = path.join(VM_CONFIG_DIR, `${id}.json`);

      if (!await fs.pathExists(vmConfigPath)) {
        return res.status(404).json({ error: 'VM not found' });
      }

      // Stop VM if running
      try {
        await qemuService.stopVM(id);
      } catch (error) {
        // VM might not be running, continue with deletion
      }

      await fs.remove(vmConfigPath);

      logger.info(`Deleted VM: ${id}`);
      res.json({ message: 'VM deleted successfully' });
    } catch (error) {
      logger.error('Error deleting VM:', error);
      res.status(500).json({ error: 'Failed to delete VM' });
    }
  }

  // VM Control
  async startVM(req, res) {
    try {
      const { id } = req.params;
      const vmConfigPath = path.join(VM_CONFIG_DIR, `${id}.json`);

      if (!await fs.pathExists(vmConfigPath)) {
        return res.status(404).json({ error: 'VM not found' });
      }

      const vmConfig = await fs.readJson(vmConfigPath);
      const vmInstance = await qemuService.startVM(vmConfig);

      logger.info(`Started VM: ${vmConfig.name} (${id})`);
      res.json({ 
        message: 'VM started successfully',
        pid: vmInstance.process.pid,
        vncPort: vmConfig.vncPort
      });
    } catch (error) {
      logger.error('Error starting VM:', error);
      res.status(500).json({ error: error.message || 'Failed to start VM' });
    }
  }

  async stopVM(req, res) {
    try {
      const { id } = req.params;
      await qemuService.stopVM(id);

      logger.info(`Stopped VM: ${id}`);
      res.json({ message: 'VM stopped successfully' });
    } catch (error) {
      logger.error('Error stopping VM:', error);
      res.status(500).json({ error: error.message || 'Failed to stop VM' });
    }
  }

  async restartVM(req, res) {
    try {
      const { id } = req.params;
      
      // Stop the VM first
      try {
        await qemuService.stopVM(id);
      } catch (error) {
        // VM might not be running
      }

      // Wait a moment then start
      setTimeout(async () => {
        try {
          const vmConfigPath = path.join(VM_CONFIG_DIR, `${id}.json`);
          const vmConfig = await fs.readJson(vmConfigPath);
          await qemuService.startVM(vmConfig);
        } catch (error) {
          logger.error('Error restarting VM:', error);
        }
      }, 2000);

      res.json({ message: 'VM restart initiated' });
    } catch (error) {
      logger.error('Error restarting VM:', error);
      res.status(500).json({ error: 'Failed to restart VM' });
    }
  }

  async pauseVM(req, res) {
    try {
      const { id } = req.params;
      await qemuService.pauseVM(id);

      logger.info(`Paused VM: ${id}`);
      res.json({ message: 'VM paused successfully' });
    } catch (error) {
      logger.error('Error pausing VM:', error);
      res.status(500).json({ error: error.message || 'Failed to pause VM' });
    }
  }

  async resumeVM(req, res) {
    try {
      const { id } = req.params;
      await qemuService.resumeVM(id);

      logger.info(`Resumed VM: ${id}`);
      res.json({ message: 'VM resumed successfully' });
    } catch (error) {
      logger.error('Error resuming VM:', error);
      res.status(500).json({ error: error.message || 'Failed to resume VM' });
    }
  }

  async resetVM(req, res) {
    try {
      const { id } = req.params;
      // For now, reset is the same as restart
      await this.restartVM(req, res);
    } catch (error) {
      logger.error('Error resetting VM:', error);
      res.status(500).json({ error: 'Failed to reset VM' });
    }
  }

  // Status and Monitoring
  async getVMStatus(req, res) {
    try {
      const { id } = req.params;
      const status = qemuService.getVMStatus(id);
      res.json(status);
    } catch (error) {
      logger.error('Error getting VM status:', error);
      res.status(500).json({ error: 'Failed to get VM status' });
    }
  }

  async getVMPerformance(req, res) {
    try {
      const { id } = req.params;
      const vmStatus = qemuService.getVMStatus(id);
      
      if (vmStatus.status !== 'running') {
        return res.json({ error: 'VM is not running' });
      }

      const performance = await this.getPerformanceData(vmStatus.pid);
      res.json(performance);
    } catch (error) {
      logger.error('Error getting VM performance:', error);
      res.status(500).json({ error: 'Failed to get VM performance' });
    }
  }

  async getVMLogs(req, res) {
    try {
      const { id } = req.params;
      const vmStatus = qemuService.getVMStatus(id);
      
      res.json({
        stdout: vmStatus.lastOutput || '',
        stderr: vmStatus.lastError || '',
        status: vmStatus.status
      });
    } catch (error) {
      logger.error('Error getting VM logs:', error);
      res.status(500).json({ error: 'Failed to get VM logs' });
    }
  }

  // Disk Image Management
  async listDiskImages(req, res) {
    try {
      const files = await fs.readdir(DISK_IMAGES_DIR);
      const diskImages = [];

      for (const file of files) {
        const filePath = path.join(DISK_IMAGES_DIR, file);
        const stats = await fs.stat(filePath);
        
        if (stats.isFile()) {
          diskImages.push({
            filename: file,
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime
          });
        }
      }

      res.json(diskImages);
    } catch (error) {
      logger.error('Error listing disk images:', error);
      res.status(500).json({ error: 'Failed to list disk images' });
    }
  }

  async uploadDiskImage(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const fileInfo = {
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        path: req.file.path,
        uploaded: new Date().toISOString()
      };

      logger.info(`Uploaded disk image: ${req.file.originalname}`);
      res.json(fileInfo);
    } catch (error) {
      logger.error('Error uploading disk image:', error);
      res.status(500).json({ error: 'Failed to upload disk image' });
    }
  }

  async createDiskImage(req, res) {
    try {
      const { name, size = '64G', format = 'qcow2' } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'Disk image name is required' });
      }

      const filename = `${name}.${format}`;
      const imagePath = path.join(DISK_IMAGES_DIR, filename);

      // Create disk image using qemu-img
      const { exec } = require('child_process');
      const command = `qemu-img create -f ${format} "${imagePath}" ${size}`;

      exec(command, (error, stdout, stderr) => {
        if (error) {
          logger.error('Error creating disk image:', error);
          return res.status(500).json({ error: 'Failed to create disk image' });
        }

        logger.info(`Created disk image: ${filename}`);
        res.json({
          filename,
          size,
          format,
          path: imagePath,
          created: new Date().toISOString()
        });
      });
    } catch (error) {
      logger.error('Error creating disk image:', error);
      res.status(500).json({ error: 'Failed to create disk image' });
    }
  }

  async deleteDiskImage(req, res) {
    try {
      const { filename } = req.params;
      const imagePath = path.join(DISK_IMAGES_DIR, filename);

      if (!await fs.pathExists(imagePath)) {
        return res.status(404).json({ error: 'Disk image not found' });
      }

      await fs.remove(imagePath);

      logger.info(`Deleted disk image: ${filename}`);
      res.json({ message: 'Disk image deleted successfully' });
    } catch (error) {
      logger.error('Error deleting disk image:', error);
      res.status(500).json({ error: 'Failed to delete disk image' });
    }
  }

  // System Information
  async getSystemInfo(req, res) {
    try {
      const [cpu, mem, osInfo, graphics] = await Promise.all([
        si.cpu(),
        si.mem(),
        si.osInfo(),
        si.graphics()
      ]);

      res.json({
        cpu: {
          manufacturer: cpu.manufacturer,
          brand: cpu.brand,
          cores: cpu.cores,
          physicalCores: cpu.physicalCores,
          speed: cpu.speed
        },
        memory: {
          total: mem.total,
          free: mem.free,
          used: mem.used
        },
        os: {
          platform: osInfo.platform,
          distro: osInfo.distro,
          release: osInfo.release,
          arch: osInfo.arch
        },
        graphics: graphics.controllers.map(gpu => ({
          vendor: gpu.vendor,
          model: gpu.model,
          vram: gpu.vram
        }))
      });
    } catch (error) {
      logger.error('Error getting system info:', error);
      res.status(500).json({ error: 'Failed to get system info' });
    }
  }

  async checkRequirements(req, res) {
    try {
      const requirements = {
        qemu: qemuService.isQemuAvailable(),
        virtualization: false,
        memory: false,
        storage: false
      };

      // Check virtualization support
      const osInfo = await si.osInfo();
      if (osInfo.platform === 'linux') {
        try {
          await fs.access('/dev/kvm');
          requirements.virtualization = true;
        } catch {
          requirements.virtualization = false;
        }
      } else if (osInfo.platform === 'win32') {
        // Check for Hyper-V
        requirements.virtualization = qemuService.capabilities.whpx || false;
      } else if (osInfo.platform === 'darwin') {
        requirements.virtualization = qemuService.capabilities.hvf || false;
      }

      // Check memory (minimum 8GB recommended)
      const mem = await si.mem();
      requirements.memory = mem.total >= 8 * 1024 * 1024 * 1024;

      // Check storage (minimum 100GB free space)
      const fsSize = await si.fsSize();
      const rootFs = fsSize.find(fs => fs.mount === '/' || fs.mount === 'C:');
      requirements.storage = rootFs ? rootFs.available >= 100 * 1024 * 1024 * 1024 : false;

      res.json(requirements);
    } catch (error) {
      logger.error('Error checking requirements:', error);
      res.status(500).json({ error: 'Failed to check requirements' });
    }
  }

  // Templates
  async getVMTemplates(req, res) {
    try {
      const templatesPath = path.join(TEMPLATES_DIR, 'vm-templates.json');
      
      if (!await fs.pathExists(templatesPath)) {
        // Create default templates if file doesn't exist
        const defaultTemplates = this.getDefaultTemplates();
        await fs.writeJson(templatesPath, defaultTemplates, { spaces: 2 });
      }

      const templates = await fs.readJson(templatesPath);
      res.json(templates);
    } catch (error) {
      logger.error('Error getting VM templates:', error);
      res.status(500).json({ error: 'Failed to get VM templates' });
    }
  }

  async getVMTemplate(req, res) {
    try {
      const { templateId } = req.params;
      const templatesPath = path.join(TEMPLATES_DIR, 'vm-templates.json');
      
      if (!await fs.pathExists(templatesPath)) {
        return res.status(404).json({ error: 'Templates not found' });
      }

      const templates = await fs.readJson(templatesPath);
      const template = templates.find(t => t.id === templateId);

      if (!template) {
        return res.status(404).json({ error: 'Template not found' });
      }

      res.json(template);
    } catch (error) {
      logger.error('Error getting VM template:', error);
      res.status(500).json({ error: 'Failed to get VM template' });
    }
  }

  getDefaultTemplates() {
    return [
      {
        id: 'macos-monterey',
        name: 'macOS Monterey',
        description: 'macOS 12 Monterey template with optimized settings',
        memory: 8192,
        cpus: 4,
        diskSize: '64G',
        bootloader: 'OpenCore-Monterey.qcow2'
      },
      {
        id: 'macos-ventura',
        name: 'macOS Ventura',
        description: 'macOS 13 Ventura template with optimized settings',
        memory: 8192,
        cpus: 4,
        diskSize: '64G',
        bootloader: 'OpenCore-Ventura.qcow2'
      },
      {
        id: 'macos-sonoma',
        name: 'macOS Sonoma',
        description: 'macOS 14 Sonoma template with optimized settings',
        memory: 12288,
        cpus: 6,
        diskSize: '80G',
        bootloader: 'OpenCore-Sonoma.qcow2'
      }
    ];
  }

  // Performance monitoring helpers
  async getPerformanceData(pid) {
    try {
      const processes = await si.processes();
      const process = processes.list.find(p => p.pid === pid);
      
      if (!process) {
        return { error: 'Process not found' };
      }

      return {
        cpu: process.cpu,
        memory: process.mem,
        memoryMB: Math.round(process.memRss / 1024 / 1024),
        uptime: process.started
      };
    } catch (error) {
      return { error: 'Failed to get performance data' };
    }
  }

  // Socket.IO handlers
  async connectConsole(socket, vmId) {
    // Store socket connection for this VM
    if (!this.socketConnections.has(vmId)) {
      this.socketConnections.set(vmId, new Set());
    }
    this.socketConnections.get(vmId).add(socket);

    socket.emit('console-connected', { vmId });
  }

  async executeCommand(vmId, command, params) {
    // Handle various VM commands
    switch (command) {
      case 'start':
        return await qemuService.startVM(params);
      case 'stop':
        return await qemuService.stopVM(vmId);
      case 'pause':
        return await qemuService.pauseVM(vmId);
      case 'resume':
        return await qemuService.resumeVM(vmId);
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  }

  startPerformanceMonitoring(socket, vmId) {
    const interval = setInterval(async () => {
      try {
        const vmStatus = qemuService.getVMStatus(vmId);
        if (vmStatus.status === 'running' && vmStatus.pid) {
          const performance = await this.getPerformanceData(vmStatus.pid);
          socket.emit('performance-data', { vmId, ...performance });
        }
      } catch (error) {
        logger.error('Performance monitoring error:', error);
      }
    }, 2000);

    this.monitoringIntervals.set(socket.id + vmId, interval);
  }

  stopPerformanceMonitoring(socket, vmId) {
    const intervalKey = socket.id + vmId;
    const interval = this.monitoringIntervals.get(intervalKey);
    if (interval) {
      clearInterval(interval);
      this.monitoringIntervals.delete(intervalKey);
    }
  }

  cleanupSocket(socket) {
    // Clean up monitoring intervals for this socket
    for (const [key, interval] of this.monitoringIntervals) {
      if (key.startsWith(socket.id)) {
        clearInterval(interval);
        this.monitoringIntervals.delete(key);
      }
    }

    // Remove socket from VM connections
    for (const [vmId, sockets] of this.socketConnections) {
      sockets.delete(socket);
      if (sockets.size === 0) {
        this.socketConnections.delete(vmId);
      }
    }
  }

  async shutdownAllVMs() {
    return await qemuService.shutdownAll();
  }

  // Additional methods for snapshots, network config, VNC info, etc.
  async listSnapshots(req, res) {
    res.json({ message: 'Snapshots feature coming soon' });
  }

  async createSnapshot(req, res) {
    res.json({ message: 'Snapshots feature coming soon' });
  }

  async restoreSnapshot(req, res) {
    res.json({ message: 'Snapshots feature coming soon' });
  }

  async deleteSnapshot(req, res) {
    res.json({ message: 'Snapshots feature coming soon' });
  }

  async getNetworkConfig(req, res) {
    res.json({ message: 'Network configuration feature coming soon' });
  }

  async updateNetworkConfig(req, res) {
    res.json({ message: 'Network configuration feature coming soon' });
  }

  async getVNCInfo(req, res) {
    try {
      const { id } = req.params;
      const vmConfigPath = path.join(VM_CONFIG_DIR, `${id}.json`);

      if (!await fs.pathExists(vmConfigPath)) {
        return res.status(404).json({ error: 'VM not found' });
      }

      const vmConfig = await fs.readJson(vmConfigPath);
      const vmStatus = qemuService.getVMStatus(id);

      res.json({
        vncPort: vmConfig.vncPort,
        vncUrl: `vnc://localhost:${vmConfig.vncPort}`,
        status: vmStatus.status
      });
    } catch (error) {
      logger.error('Error getting VNC info:', error);
      res.status(500).json({ error: 'Failed to get VNC info' });
    }
  }

  async sendKeys(req, res) {
    res.json({ message: 'Send keys feature coming soon' });
  }
}

module.exports = new VMController();

