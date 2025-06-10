import { io, Socket } from 'socket.io-client';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Types
export interface VM {
  id: string;
  name: string;
  description?: string;
  memory: number;
  cpus: number;
  diskImage?: string;
  template: string;
  vncPort: number;
  status: 'stopped' | 'starting' | 'running' | 'paused' | 'error';
  createdAt: string;
  updatedAt: string;
  pid?: number;
  startTime?: string;
  uptime?: number;
}

export interface DiskImage {
  filename: string;
  originalName?: string;
  size: number;
  created: string;
  modified?: string;
}

export interface SystemInfo {
  cpu: {
    manufacturer: string;
    brand: string;
    cores: number;
    physicalCores: number;
    speed: number;
  };
  memory: {
    total: number;
    free: number;
    used: number;
  };
  os: {
    platform: string;
    distro: string;
    release: string;
    arch: string;
  };
  graphics: Array<{
    vendor: string;
    model: string;
    vram: number;
  }>;
}

export interface PerformanceData {
  cpu: number;
  memory: number;
  memoryMB: number;
  uptime: string;
}

export interface VMTemplate {
  id: string;
  name: string;
  description: string;
  memory: number;
  cpus: number;
  diskSize: string;
  bootloader: string;
}

// API Client Class
class ApiClient {
  private baseURL: string;
  private socket: Socket | null = null;

  constructor(baseURL: string = API_BASE_URL) {
    this.baseURL = baseURL;
  }

  // Generic HTTP methods
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    const config: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API request failed: ${endpoint}`, error);
      throw error;
    }
  }

  private async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  private async post<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  private async put<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  private async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  // Health check
  async healthCheck(): Promise<{ status: string; timestamp: string; qemu: boolean }> {
    return this.get('/health');
  }

  // VM Management
  async getVMs(): Promise<VM[]> {
    return this.get('/api/vms');
  }

  async getVM(id: string): Promise<VM> {
    return this.get(`/api/vms/${id}`);
  }

  async createVM(vmData: Partial<VM>): Promise<VM> {
    return this.post('/api/vms', vmData);
  }

  async updateVM(id: string, vmData: Partial<VM>): Promise<VM> {
    return this.put(`/api/vms/${id}`, vmData);
  }

  async deleteVM(id: string): Promise<{ message: string }> {
    return this.delete(`/api/vms/${id}`);
  }

  // VM Control
  async startVM(id: string): Promise<{ message: string; pid: number; vncPort: number }> {
    return this.post(`/api/vms/${id}/start`);
  }

  async stopVM(id: string): Promise<{ message: string }> {
    return this.post(`/api/vms/${id}/stop`);
  }

  async restartVM(id: string): Promise<{ message: string }> {
    return this.post(`/api/vms/${id}/restart`);
  }

  async pauseVM(id: string): Promise<{ message: string }> {
    return this.post(`/api/vms/${id}/pause`);
  }

  async resumeVM(id: string): Promise<{ message: string }> {
    return this.post(`/api/vms/${id}/resume`);
  }

  async resetVM(id: string): Promise<{ message: string }> {
    return this.post(`/api/vms/${id}/reset`);
  }

  // VM Status and Monitoring
  async getVMStatus(id: string): Promise<VM> {
    return this.get(`/api/vms/${id}/status`);
  }

  async getVMPerformance(id: string): Promise<PerformanceData> {
    return this.get(`/api/vms/${id}/performance`);
  }

  async getVMLogs(id: string): Promise<{ stdout: string; stderr: string; status: string }> {
    return this.get(`/api/vms/${id}/logs`);
  }

  // Disk Image Management
  async getDiskImages(): Promise<DiskImage[]> {
    return this.get('/api/disk-images');
  }

  async uploadDiskImage(file: File, onProgress?: (progress: number) => void): Promise<DiskImage> {
    const formData = new FormData();
    formData.append('diskImage', file);

    const xhr = new XMLHttpRequest();
    
    return new Promise((resolve, reject) => {
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && onProgress) {
          const progress = (event.loaded / event.total) * 100;
          onProgress(progress);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          reject(new Error(`Upload failed: ${xhr.statusText}`));
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Upload failed'));
      });

      xhr.open('POST', `${this.baseURL}/api/disk-images/upload`);
      xhr.send(formData);
    });
  }

  async createDiskImage(name: string, size: string = '64G', format: string = 'qcow2'): Promise<DiskImage> {
    return this.post('/api/disk-images/create', { name, size, format });
  }

  async deleteDiskImage(filename: string): Promise<{ message: string }> {
    return this.delete(`/api/disk-images/${filename}`);
  }

  // System Information
  async getSystemInfo(): Promise<SystemInfo> {
    return this.get('/api/system/info');
  }

  async checkRequirements(): Promise<{
    qemu: boolean;
    virtualization: boolean;
    memory: boolean;
    storage: boolean;
  }> {
    return this.get('/api/system/requirements');
  }

  async getQemuVersion(): Promise<{
    version: string;
    path: string;
    capabilities: Record<string, boolean>;
  }> {
    return this.get('/api/qemu/version');
  }

  // Templates
  async getVMTemplates(): Promise<VMTemplate[]> {
    return this.get('/api/templates');
  }

  async getVMTemplate(templateId: string): Promise<VMTemplate> {
    return this.get(`/api/templates/${templateId}`);
  }

  // VNC Info
  async getVNCInfo(id: string): Promise<{
    vncPort: number;
    vncUrl: string;
    status: string;
  }> {
    return this.get(`/api/vms/${id}/vnc-info`);
  }

  // Socket.IO Connection
  connectSocket(): Socket {
    if (this.socket?.connected) {
      return this.socket;
    }

    this.socket = io(this.baseURL, {
      transports: ['websocket', 'polling'],
      timeout: 20000,
    });

    this.socket.on('connect', () => {
      console.log('Connected to backend socket');
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from backend socket');
    });

    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
    });

    return this.socket;
  }

  disconnectSocket(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  // Socket event helpers
  onVMResponse(callback: (data: any) => void): void {
    this.socket?.on('vm-response', callback);
  }

  onVMError(callback: (data: any) => void): void {
    this.socket?.on('vm-error', callback);
  }

  onPerformanceData(callback: (data: PerformanceData & { vmId: string }) => void): void {
    this.socket?.on('performance-data', callback);
  }

  onConsoleData(callback: (data: string) => void): void {
    this.socket?.on('console-data', callback);
  }

  // Socket commands
  connectConsole(vmId: string): void {
    this.socket?.emit('connect-console', vmId);
  }

  sendVMCommand(vmId: string, command: string, params?: any): void {
    this.socket?.emit('vm-command', { vmId, command, params });
  }

  startPerformanceMonitoring(vmId: string): void {
    this.socket?.emit('start-monitoring', vmId);
  }

  stopPerformanceMonitoring(vmId: string): void {
    this.socket?.emit('stop-monitoring', vmId);
  }
}

// Export singleton instance
export const apiClient = new ApiClient();

// Export types and client
export default apiClient;

