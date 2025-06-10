const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
const winston = require('winston');

// Import routes and services
const apiRoutes = require('./routes/api');
const vmController = require('./controllers/vmController');
const qemuService = require('./services/qemuService');

// Configure logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Ensure required directories exist
const requiredDirs = ['logs', 'vms', 'disk-images', 'temp'];
requiredDirs.forEach(dir => {
  fs.ensureDirSync(path.join(__dirname, dir));
});

// Routes
app.use('/api', apiRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    qemu: qemuService.isQemuAvailable()
  });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);

  // Handle VM console connections
  socket.on('connect-console', async (vmId) => {
    try {
      await vmController.connectConsole(socket, vmId);
    } catch (error) {
      logger.error('Console connection error:', error);
      socket.emit('console-error', error.message);
    }
  });

  // Handle VM control commands
  socket.on('vm-command', async (data) => {
    try {
      const { vmId, command, params } = data;
      const result = await vmController.executeCommand(vmId, command, params);
      socket.emit('vm-response', { command, result });
    } catch (error) {
      logger.error('VM command error:', error);
      socket.emit('vm-error', { command: data.command, error: error.message });
    }
  });

  // Handle performance monitoring
  socket.on('start-monitoring', (vmId) => {
    vmController.startPerformanceMonitoring(socket, vmId);
  });

  socket.on('stop-monitoring', (vmId) => {
    vmController.stopPerformanceMonitoring(socket, vmId);
  });

  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
    vmController.cleanupSocket(socket);
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  logger.error('Unhandled error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  vmController.shutdownAllVMs().then(() => {
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  vmController.shutdownAllVMs().then(() => {
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  });
});

server.listen(PORT, () => {
  logger.info(`Silicon Emulator Backend running on port ${PORT}`);
  logger.info(`Frontend URL: ${process.env.FRONTEND_URL || "http://localhost:5173"}`);
  
  // Initialize QEMU service
  qemuService.initialize().then(() => {
    logger.info('QEMU service initialized successfully');
  }).catch(error => {
    logger.error('Failed to initialize QEMU service:', error);
  });
});

module.exports = { app, server, io };

