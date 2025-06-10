import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useVMStore, useVMs, useSystemInfo } from "@/stores/vmStore";
import { useVMPerformance } from "@/hooks/useWebSocket";
import { Play, Square, Pause, RotateCcw, Monitor, Cpu, HardDrive, MemoryStick } from "lucide-react";
import { toast } from "sonner";

const Dashboard = () => {
  const vms = useVMs();
  const systemInfo = useSystemInfo();
  const { fetchVMs, fetchSystemInfo, startVM, stopVM, pauseVM, resumeVM, restartVM } = useVMStore();
  const [selectedVMId, setSelectedVMId] = useState<string | null>(null);
  const performanceData = useVMPerformance(selectedVMId, selectedVMId !== null);

  useEffect(() => {
    fetchVMs();
    fetchSystemInfo();
    
    // Refresh VMs every 5 seconds
    const interval = setInterval(fetchVMs, 5000);
    return () => clearInterval(interval);
  }, [fetchVMs, fetchSystemInfo]);

  const handleVMAction = async (vmId: string, action: string) => {
    try {
      let success = false;
      switch (action) {
        case 'start':
          success = await startVM(vmId);
          break;
        case 'stop':
          success = await stopVM(vmId);
          break;
        case 'pause':
          success = await pauseVM(vmId);
          break;
        case 'resume':
          success = await resumeVM(vmId);
          break;
        case 'restart':
          success = await restartVM(vmId);
          break;
      }
      
      if (success) {
        toast.success(`VM ${action} successful`);
      }
    } catch (error: any) {
      toast.error(`Failed to ${action} VM: ${error.message}`);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'bg-green-500';
      case 'paused': return 'bg-yellow-500';
      case 'starting': return 'bg-blue-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatUptime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  return (
    <div className="space-y-6">
      {/* System Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total VMs</CardTitle>
            <Monitor className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{vms.length}</div>
            <p className="text-xs text-muted-foreground">
              {vms.filter(vm => vm.status === 'running').length} running
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Memory</CardTitle>
            <MemoryStick className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {systemInfo ? formatBytes(systemInfo.memory.total) : 'Loading...'}
            </div>
            <p className="text-xs text-muted-foreground">
              {systemInfo ? formatBytes(systemInfo.memory.free) : ''} available
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">CPU Cores</CardTitle>
            <Cpu className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {systemInfo ? systemInfo.cpu.cores : 'Loading...'}
            </div>
            <p className="text-xs text-muted-foreground">
              {systemInfo ? systemInfo.cpu.brand : ''}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Virtual Machines */}
      <Card>
        <CardHeader>
          <CardTitle>Virtual Machines</CardTitle>
          <CardDescription>
            Manage your macOS virtual machines
          </CardDescription>
        </CardHeader>
        <CardContent>
          {vms.length === 0 ? (
            <div className="text-center py-8">
              <Monitor className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No Virtual Machines</h3>
              <p className="text-muted-foreground mb-4">
                Create your first macOS virtual machine to get started
              </p>
              <Button>Create VM</Button>
            </div>
          ) : (
            <div className="space-y-4">
              {vms.map((vm) => (
                <div key={vm.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className={`w-3 h-3 rounded-full ${getStatusColor(vm.status)}`} />
                      <div>
                        <h3 className="font-medium">{vm.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          {vm.memory}MB RAM • {vm.cpus} CPUs
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Badge variant="outline">{vm.status}</Badge>
                      
                      {vm.status === 'stopped' && (
                        <Button
                          size="sm"
                          onClick={() => handleVMAction(vm.id, 'start')}
                        >
                          <Play className="h-4 w-4 mr-1" />
                          Start
                        </Button>
                      )}
                      
                      {vm.status === 'running' && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleVMAction(vm.id, 'pause')}
                          >
                            <Pause className="h-4 w-4 mr-1" />
                            Pause
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleVMAction(vm.id, 'restart')}
                          >
                            <RotateCcw className="h-4 w-4 mr-1" />
                            Restart
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleVMAction(vm.id, 'stop')}
                          >
                            <Square className="h-4 w-4 mr-1" />
                            Stop
                          </Button>
                        </>
                      )}
                      
                      {vm.status === 'paused' && (
                        <Button
                          size="sm"
                          onClick={() => handleVMAction(vm.id, 'resume')}
                        >
                          <Play className="h-4 w-4 mr-1" />
                          Resume
                        </Button>
                      )}
                    </div>
                  </div>
                  
                  {vm.status === 'running' && (
                    <div className="mt-4 pt-4 border-t">
                      <div className="flex items-center justify-between text-sm">
                        <span>Uptime: {vm.uptime ? formatUptime(vm.uptime) : 'Unknown'}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedVMId(selectedVMId === vm.id ? null : vm.id)}
                        >
                          {selectedVMId === vm.id ? 'Hide' : 'Show'} Performance
                        </Button>
                      </div>
                      
                      {selectedVMId === vm.id && performanceData && (
                        <div className="mt-4 space-y-3">
                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span>CPU Usage</span>
                              <span>{performanceData.cpu.toFixed(1)}%</span>
                            </div>
                            <Progress value={performanceData.cpu} className="h-2" />
                          </div>
                          
                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span>Memory Usage</span>
                              <span>{performanceData.memoryMB}MB ({performanceData.memory.toFixed(1)}%)</span>
                            </div>
                            <Progress value={performanceData.memory} className="h-2" />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;

