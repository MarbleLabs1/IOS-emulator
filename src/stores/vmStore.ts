import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { apiClient, VM, DiskImage, SystemInfo, VMTemplate } from '@/services/api';

interface VMStore {
  // State
  vms: VM[];
  selectedVM: VM | null;
  diskImages: DiskImage[];
  systemInfo: SystemInfo | null;
  templates: VMTemplate[];
  isLoading: boolean;
  error: string | null;

  // Actions
  setVMs: (vms: VM[]) => void;
  setSelectedVM: (vm: VM | null) => void;
  setDiskImages: (images: DiskImage[]) => void;
  setSystemInfo: (info: SystemInfo) => void;
  setTemplates: (templates: VMTemplate[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Async actions
  fetchVMs: () => Promise<void>;
  fetchVM: (id: string) => Promise<VM | null>;
  createVM: (vmData: Partial<VM>) => Promise<VM | null>;
  updateVM: (id: string, vmData: Partial<VM>) => Promise<VM | null>;
  deleteVM: (id: string) => Promise<boolean>;
  
  startVM: (id: string) => Promise<boolean>;
  stopVM: (id: string) => Promise<boolean>;
  restartVM: (id: string) => Promise<boolean>;
  pauseVM: (id: string) => Promise<boolean>;
  resumeVM: (id: string) => Promise<boolean>;
  resetVM: (id: string) => Promise<boolean>;

  fetchDiskImages: () => Promise<void>;
  uploadDiskImage: (file: File, onProgress?: (progress: number) => void) => Promise<DiskImage | null>;
  createDiskImage: (name: string, size?: string, format?: string) => Promise<DiskImage | null>;
  deleteDiskImage: (filename: string) => Promise<boolean>;

  fetchSystemInfo: () => Promise<void>;
  fetchTemplates: () => Promise<void>;
  
  // Utility actions
  refreshVM: (id: string) => Promise<void>;
  clearError: () => void;
}

export const useVMStore = create<VMStore>()(
  devtools(
    (set, get) => ({
      // Initial state
      vms: [],
      selectedVM: null,
      diskImages: [],
      systemInfo: null,
      templates: [],
      isLoading: false,
      error: null,

      // Basic setters
      setVMs: (vms) => set({ vms }),
      setSelectedVM: (vm) => set({ selectedVM: vm }),
      setDiskImages: (images) => set({ diskImages: images }),
      setSystemInfo: (info) => set({ systemInfo: info }),
      setTemplates: (templates) => set({ templates }),
      setLoading: (loading) => set({ isLoading: loading }),
      setError: (error) => set({ error }),

      // VM Management
      fetchVMs: async () => {
        set({ isLoading: true, error: null });
        try {
          const vms = await apiClient.getVMs();
          set({ vms, isLoading: false });
        } catch (error: any) {
          set({ error: error.message, isLoading: false });
        }
      },

      fetchVM: async (id: string) => {
        set({ error: null });
        try {
          const vm = await apiClient.getVM(id);
          
          // Update the VM in the list
          const { vms } = get();
          const updatedVMs = vms.map(v => v.id === id ? vm : v);
          set({ vms: updatedVMs });
          
          // Update selected VM if it's the same one
          const { selectedVM } = get();
          if (selectedVM?.id === id) {
            set({ selectedVM: vm });
          }
          
          return vm;
        } catch (error: any) {
          set({ error: error.message });
          return null;
        }
      },

      createVM: async (vmData) => {
        set({ isLoading: true, error: null });
        try {
          const newVM = await apiClient.createVM(vmData);
          const { vms } = get();
          set({ vms: [...vms, newVM], isLoading: false });
          return newVM;
        } catch (error: any) {
          set({ error: error.message, isLoading: false });
          return null;
        }
      },

      updateVM: async (id: string, vmData) => {
        set({ error: null });
        try {
          const updatedVM = await apiClient.updateVM(id, vmData);
          const { vms } = get();
          const updatedVMs = vms.map(vm => vm.id === id ? updatedVM : vm);
          set({ vms: updatedVMs });
          
          // Update selected VM if it's the same one
          const { selectedVM } = get();
          if (selectedVM?.id === id) {
            set({ selectedVM: updatedVM });
          }
          
          return updatedVM;
        } catch (error: any) {
          set({ error: error.message });
          return null;
        }
      },

      deleteVM: async (id: string) => {
        set({ error: null });
        try {
          await apiClient.deleteVM(id);
          const { vms, selectedVM } = get();
          const updatedVMs = vms.filter(vm => vm.id !== id);
          set({ 
            vms: updatedVMs,
            selectedVM: selectedVM?.id === id ? null : selectedVM
          });
          return true;
        } catch (error: any) {
          set({ error: error.message });
          return false;
        }
      },

      // VM Control
      startVM: async (id: string) => {
        set({ error: null });
        try {
          await apiClient.startVM(id);
          // Refresh VM status
          await get().refreshVM(id);
          return true;
        } catch (error: any) {
          set({ error: error.message });
          return false;
        }
      },

      stopVM: async (id: string) => {
        set({ error: null });
        try {
          await apiClient.stopVM(id);
          // Refresh VM status
          await get().refreshVM(id);
          return true;
        } catch (error: any) {
          set({ error: error.message });
          return false;
        }
      },

      restartVM: async (id: string) => {
        set({ error: null });
        try {
          await apiClient.restartVM(id);
          // Refresh VM status after a delay
          setTimeout(() => get().refreshVM(id), 2000);
          return true;
        } catch (error: any) {
          set({ error: error.message });
          return false;
        }
      },

      pauseVM: async (id: string) => {
        set({ error: null });
        try {
          await apiClient.pauseVM(id);
          await get().refreshVM(id);
          return true;
        } catch (error: any) {
          set({ error: error.message });
          return false;
        }
      },

      resumeVM: async (id: string) => {
        set({ error: null });
        try {
          await apiClient.resumeVM(id);
          await get().refreshVM(id);
          return true;
        } catch (error: any) {
          set({ error: error.message });
          return false;
        }
      },

      resetVM: async (id: string) => {
        set({ error: null });
        try {
          await apiClient.resetVM(id);
          setTimeout(() => get().refreshVM(id), 2000);
          return true;
        } catch (error: any) {
          set({ error: error.message });
          return false;
        }
      },

      // Disk Image Management
      fetchDiskImages: async () => {
        set({ isLoading: true, error: null });
        try {
          const images = await apiClient.getDiskImages();
          set({ diskImages: images, isLoading: false });
        } catch (error: any) {
          set({ error: error.message, isLoading: false });
        }
      },

      uploadDiskImage: async (file: File, onProgress?: (progress: number) => void) => {
        set({ error: null });
        try {
          const image = await apiClient.uploadDiskImage(file, onProgress);
          const { diskImages } = get();
          set({ diskImages: [...diskImages, image] });
          return image;
        } catch (error: any) {
          set({ error: error.message });
          return null;
        }
      },

      createDiskImage: async (name: string, size = '64G', format = 'qcow2') => {
        set({ error: null });
        try {
          const image = await apiClient.createDiskImage(name, size, format);
          const { diskImages } = get();
          set({ diskImages: [...diskImages, image] });
          return image;
        } catch (error: any) {
          set({ error: error.message });
          return null;
        }
      },

      deleteDiskImage: async (filename: string) => {
        set({ error: null });
        try {
          await apiClient.deleteDiskImage(filename);
          const { diskImages } = get();
          const updatedImages = diskImages.filter(img => img.filename !== filename);
          set({ diskImages: updatedImages });
          return true;
        } catch (error: any) {
          set({ error: error.message });
          return false;
        }
      },

      // System Information
      fetchSystemInfo: async () => {
        set({ error: null });
        try {
          const info = await apiClient.getSystemInfo();
          set({ systemInfo: info });
        } catch (error: any) {
          set({ error: error.message });
        }
      },

      fetchTemplates: async () => {
        set({ error: null });
        try {
          const templates = await apiClient.getVMTemplates();
          set({ templates });
        } catch (error: any) {
          set({ error: error.message });
        }
      },

      // Utility actions
      refreshVM: async (id: string) => {
        try {
          const vm = await apiClient.getVMStatus(id);
          const { vms } = get();
          const updatedVMs = vms.map(v => v.id === id ? { ...v, ...vm } : v);
          set({ vms: updatedVMs });
          
          // Update selected VM if it's the same one
          const { selectedVM } = get();
          if (selectedVM?.id === id) {
            set({ selectedVM: { ...selectedVM, ...vm } });
          }
        } catch (error: any) {
          console.error('Failed to refresh VM:', error);
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'vm-store',
    }
  )
);

// Selector hooks for better performance
export const useVMs = () => useVMStore(state => state.vms);
export const useSelectedVM = () => useVMStore(state => state.selectedVM);
export const useDiskImages = () => useVMStore(state => state.diskImages);
export const useSystemInfo = () => useVMStore(state => state.systemInfo);
export const useTemplates = () => useVMStore(state => state.templates);
export const useVMLoading = () => useVMStore(state => state.isLoading);
export const useVMError = () => useVMStore(state => state.error);

export default useVMStore;

