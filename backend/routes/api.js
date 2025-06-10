const express = require('express');
const router = express.Router();
const vmController = require('../controllers/vmController');
const qemuService = require('../services/qemuService');
const multer = require('multer');
const path = require('path');

// Configure multer for disk image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../disk-images'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 * 1024 // 50GB limit for disk images
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.img', '.qcow2', '.vmdk', '.vdi', '.dmg'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: ' + allowedTypes.join(', ')));
    }
  }
});

// VM Management Routes
router.get('/vms', vmController.listVMs);
router.post('/vms', vmController.createVM);
router.get('/vms/:id', vmController.getVM);
router.put('/vms/:id', vmController.updateVM);
router.delete('/vms/:id', vmController.deleteVM);

// VM Control Routes
router.post('/vms/:id/start', vmController.startVM);
router.post('/vms/:id/stop', vmController.stopVM);
router.post('/vms/:id/restart', vmController.restartVM);
router.post('/vms/:id/pause', vmController.pauseVM);
router.post('/vms/:id/resume', vmController.resumeVM);
router.post('/vms/:id/reset', vmController.resetVM);

// VM Status and Monitoring
router.get('/vms/:id/status', vmController.getVMStatus);
router.get('/vms/:id/performance', vmController.getVMPerformance);
router.get('/vms/:id/logs', vmController.getVMLogs);

// Disk Image Management
router.get('/disk-images', vmController.listDiskImages);
router.post('/disk-images/upload', upload.single('diskImage'), vmController.uploadDiskImage);
router.post('/disk-images/create', vmController.createDiskImage);
router.delete('/disk-images/:filename', vmController.deleteDiskImage);

// VM Snapshots
router.get('/vms/:id/snapshots', vmController.listSnapshots);
router.post('/vms/:id/snapshots', vmController.createSnapshot);
router.post('/vms/:id/snapshots/:snapshotId/restore', vmController.restoreSnapshot);
router.delete('/vms/:id/snapshots/:snapshotId', vmController.deleteSnapshot);

// System Information
router.get('/system/info', vmController.getSystemInfo);
router.get('/system/requirements', vmController.checkRequirements);
router.get('/qemu/version', qemuService.getQemuVersion);
router.get('/qemu/capabilities', qemuService.getQemuCapabilities);

// Configuration Templates
router.get('/templates', vmController.getVMTemplates);
router.get('/templates/:templateId', vmController.getVMTemplate);

// Network Configuration
router.get('/vms/:id/network', vmController.getNetworkConfig);
router.put('/vms/:id/network', vmController.updateNetworkConfig);

// VNC/Console Access
router.get('/vms/:id/vnc-info', vmController.getVNCInfo);
router.post('/vms/:id/send-keys', vmController.sendKeys);

// Error handling for multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 50GB.' });
    }
  }
  next(error);
});

module.exports = router;

