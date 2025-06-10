import { useEffect, useRef, useState } from 'react';
import { Socket } from 'socket.io-client';
import { apiClient } from '@/services/api';

export interface UseWebSocketOptions {
  autoConnect?: boolean;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: any) => void;
}

export const useWebSocket = (options: UseWebSocketOptions = {}) => {
  const { autoConnect = true, onConnect, onDisconnect, onError } = options;
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect]);

  const connect = () => {
    try {
      socketRef.current = apiClient.connectSocket();
      
      socketRef.current.on('connect', () => {
        setIsConnected(true);
        setError(null);
        onConnect?.();
      });

      socketRef.current.on('disconnect', () => {
        setIsConnected(false);
        onDisconnect?.();
      });

      socketRef.current.on('connect_error', (err) => {
        setError(err.message);
        setIsConnected(false);
        onError?.(err);
      });

    } catch (err: any) {
      setError(err.message);
      onError?.(err);
    }
  };

  const disconnect = () => {
    if (socketRef.current) {
      apiClient.disconnectSocket();
      socketRef.current = null;
      setIsConnected(false);
    }
  };

  const emit = (event: string, data?: any) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data);
    } else {
      console.warn('Socket not connected, cannot emit event:', event);
    }
  };

  const on = (event: string, callback: (...args: any[]) => void) => {
    if (socketRef.current) {
      socketRef.current.on(event, callback);
    }
  };

  const off = (event: string, callback?: (...args: any[]) => void) => {
    if (socketRef.current) {
      socketRef.current.off(event, callback);
    }
  };

  return {
    isConnected,
    error,
    connect,
    disconnect,
    emit,
    on,
    off,
    socket: socketRef.current
  };
};

// Specialized hook for VM console connection
export const useVMConsole = (vmId: string | null) => {
  const [consoleOutput, setConsoleOutput] = useState<string[]>([]);
  const [isConsoleConnected, setIsConsoleConnected] = useState(false);
  
  const { isConnected, emit, on, off } = useWebSocket({
    onConnect: () => {
      if (vmId) {
        connectToConsole(vmId);
      }
    }
  });

  const connectToConsole = (id: string) => {
    if (isConnected) {
      emit('connect-console', id);
    }
  };

  const sendCommand = (command: string, params?: any) => {
    if (vmId && isConnected) {
      emit('vm-command', { vmId, command, params });
    }
  };

  useEffect(() => {
    const handleConsoleConnected = (data: { vmId: string }) => {
      if (data.vmId === vmId) {
        setIsConsoleConnected(true);
      }
    };

    const handleConsoleData = (data: string) => {
      setConsoleOutput(prev => [...prev, data]);
    };

    const handleConsoleError = (error: string) => {
      setConsoleOutput(prev => [...prev, `Error: ${error}`]);
    };

    on('console-connected', handleConsoleConnected);
    on('console-data', handleConsoleData);
    on('console-error', handleConsoleError);

    return () => {
      off('console-connected', handleConsoleConnected);
      off('console-data', handleConsoleData);
      off('console-error', handleConsoleError);
    };
  }, [vmId, on, off]);

  useEffect(() => {
    if (vmId && isConnected) {
      connectToConsole(vmId);
    }
  }, [vmId, isConnected]);

  const clearConsole = () => {
    setConsoleOutput([]);
  };

  return {
    consoleOutput,
    isConsoleConnected,
    connectToConsole,
    sendCommand,
    clearConsole
  };
};

// Specialized hook for VM performance monitoring
export const useVMPerformance = (vmId: string | null, enabled: boolean = true) => {
  const [performanceData, setPerformanceData] = useState<{
    cpu: number;
    memory: number;
    memoryMB: number;
    uptime: string;
  } | null>(null);

  const { isConnected, emit, on, off } = useWebSocket();

  useEffect(() => {
    const handlePerformanceData = (data: any) => {
      if (data.vmId === vmId) {
        setPerformanceData({
          cpu: data.cpu,
          memory: data.memory,
          memoryMB: data.memoryMB,
          uptime: data.uptime
        });
      }
    };

    on('performance-data', handlePerformanceData);

    return () => {
      off('performance-data', handlePerformanceData);
    };
  }, [vmId, on, off]);

  useEffect(() => {
    if (vmId && isConnected && enabled) {
      emit('start-monitoring', vmId);
    } else if (vmId && isConnected && !enabled) {
      emit('stop-monitoring', vmId);
    }

    return () => {
      if (vmId && isConnected) {
        emit('stop-monitoring', vmId);
      }
    };
  }, [vmId, isConnected, enabled, emit]);

  return performanceData;
};

export default useWebSocket;

