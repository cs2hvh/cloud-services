'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Terminal,
  Loader2,
  RefreshCw,
  Pause,
  Play,
  AlertTriangle,
  Download,
  Clock,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Instance info from pods API (no pod names exposed)
interface Instance {
  instanceId: string;
  displayName: string;
  status: 'Running' | 'Pending' | 'Succeeded' | 'Failed' | 'Unknown';
  ready: boolean;
  restartCount: number;
  startTime: string | null;
}

// Instance logs from runtime-logs API
interface InstanceLogs {
  instance: string;
  displayName: string;
  status: string;
  restartCount: number;
  logs: string;
  previousLogs: string | null;
}

interface RuntimeLogsProps {
  appId: string;
  appName: string;
  appStatus: string;
}

export function RuntimeLogs({ appId, appName, appStatus }: RuntimeLogsProps) {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<string>('all');
  const [logs, setLogs] = useState<InstanceLogs[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [showPrevious, setShowPrevious] = useState(false);
  
  const logsEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const streamLogsRef = useRef<string[]>([]);

  // Fetch instances list (masked pod names)
  const fetchInstances = useCallback(async () => {
    if (appStatus !== 'running' && appStatus !== 'degraded') return;
    
    try {
      const res = await fetch(`/api/services/platform-apps/pods?app_id=${appId}`);
      if (!res.ok) throw new Error('Failed to fetch instances');
      const data = await res.json();
      setInstances(data.instances || []);
    } catch (err) {
      console.error('Failed to fetch instances:', err);
    }
  }, [appId, appStatus]);

  // Fetch logs (non-streaming)
  const fetchLogs = useCallback(async () => {
    if (appStatus !== 'running' && appStatus !== 'degraded') {
      setError('App is not running. Logs are only available when the app is deployed.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const url = selectedInstance !== 'all'
        ? `/api/services/platform-apps/runtime-logs?app_id=${appId}&instance=${selectedInstance}&tail=500`
        : `/api/services/platform-apps/runtime-logs?app_id=${appId}&tail=500`;
      
      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch logs');
      }
      
      const data = await res.json();
      
      if (selectedInstance !== 'all') {
        // Single instance response
        setLogs([{
          instance: data.instance,
          displayName: data.displayName,
          status: 'Running',
          restartCount: 0,
          logs: data.logs || '',
          previousLogs: null,
        }]);
      } else {
        // Multi-instance response
        setLogs(data.instances || []);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch logs';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [appId, appStatus, selectedInstance]);

  // Start streaming logs
  const startStreaming = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const instance = selectedInstance !== 'all' ? `&instance=${selectedInstance}` : '';
    const url = `/api/services/platform-apps/runtime-logs?app_id=${appId}${instance}&follow=true&tail=100`;
    
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;
    streamLogsRef.current = [];
    setStreaming(true);

    eventSource.onmessage = (event) => {
      if (isPaused) return;
      
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'error') {
          setError(data.message);
          eventSource.close();
          setStreaming(false);
          return;
        }
        
        if (data.type === 'end') {
          setStreaming(false);
          return;
        }

        // Format log entry (no pod name, just timestamp and message)
        const logLine = `[${data.timestamp}] ${data.message}`;
        streamLogsRef.current.push(logLine);
        
        // Keep last 1000 lines
        if (streamLogsRef.current.length > 1000) {
          streamLogsRef.current = streamLogsRef.current.slice(-1000);
        }
        
        // Update state (batched for performance)
        setLogs([{
          instance: 'stream',
          displayName: 'Live Stream',
          status: 'Running',
          restartCount: 0,
          logs: streamLogsRef.current.join('\n'),
          previousLogs: null,
        }]);
        
        // Auto-scroll
        logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      } catch (e) {
        console.error('Failed to parse log entry:', e);
      }
    };

    eventSource.onerror = () => {
      setStreaming(false);
      eventSource.close();
    };
  }, [appId, selectedInstance, isPaused]);

  // Stop streaming
  const stopStreaming = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setStreaming(false);
  }, []);

  // Download logs
  const downloadLogs = useCallback(() => {
    const allLogs = logs.map(instanceLog => 
      `=== ${instanceLog.displayName} ===\n${instanceLog.logs}${instanceLog.previousLogs ? `\n\n=== Previous Container ===\n${instanceLog.previousLogs}` : ''}`
    ).join('\n\n');
    
    const blob = new Blob([allLogs], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${appName}-logs-${new Date().toISOString()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [logs, appName]);

  // Initial fetch
  useEffect(() => {
    fetchInstances();
    fetchLogs();
  }, [fetchInstances, fetchLogs]);

  // Cleanup streaming on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // Check if any instance has restarted
  const hasRestartedInstances = logs.some(inst => inst.restartCount > 0 && inst.previousLogs);

  if (appStatus !== 'running' && appStatus !== 'degraded') {
    return (
      <Card className="bg-white/5 border-white/10">
        <CardContent className="py-8">
          <div className="text-center text-white/50">
            <Terminal className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>Runtime logs are only available when the app is running.</p>
            <p className="text-sm mt-1">Current status: {appStatus}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white/5 border-white/10">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Terminal className="w-5 h-5" />
            Runtime Logs
            {streaming && (
              <Badge className="bg-green-500/20 text-green-400">
                <span className="w-2 h-2 bg-green-400 rounded-full mr-1.5 animate-pulse" />
                Live
              </Badge>
            )}
          </CardTitle>
          
          <div className="flex items-center gap-2">
            {/* Instance Selector */}
            {instances.length > 1 && (
              <Select value={selectedInstance} onValueChange={setSelectedInstance}>
                <SelectTrigger className="w-[180px] bg-black/30 border-white/20">
                  <SelectValue placeholder="Select instance" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Instances</SelectItem>
                  {instances.map(inst => (
                    <SelectItem key={inst.instanceId} value={inst.instanceId}>
                      {inst.displayName} {inst.restartCount > 0 && `(${inst.restartCount} restarts)`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Show Previous Logs Toggle */}
            {hasRestartedInstances && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPrevious(!showPrevious)}
                className={`border-white/20 ${showPrevious ? 'bg-yellow-500/20 text-yellow-400' : ''}`}
              >
                <AlertTriangle className="w-4 h-4 mr-1" />
                Previous
              </Button>
            )}

            {/* Stream Controls */}
            {!streaming ? (
              <Button
                variant="outline"
                size="sm"
                onClick={startStreaming}
                className="border-white/20"
              >
                <Play className="w-4 h-4 mr-1" />
                Stream
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsPaused(!isPaused)}
                  className="border-white/20"
                >
                  {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={stopStreaming}
                  className="border-white/20 text-red-400"
                >
                  Stop
                </Button>
              </>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={fetchLogs}
              disabled={loading || streaming}
              className="border-white/20"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={downloadLogs}
              disabled={logs.length === 0}
              className="border-white/20"
            >
              <Download className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-white/50" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-8 text-white/50">
            <Terminal className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No instances found</p>
            <p className="text-sm mt-1">The app may still be starting up</p>
          </div>
        ) : (
          <div className="space-y-4">
            {logs.map((instanceLog, idx) => (
              <div key={idx}>
                {/* Instance header (for multi-instance view) */}
                {selectedInstance === 'all' && logs.length > 1 && (
                  <div className="flex items-center gap-2 mb-2 text-xs text-white/60">
                    <Badge variant="outline" className="text-xs">
                      {instanceLog.displayName}
                    </Badge>
                    {instanceLog.restartCount > 0 && (
                      <span className="text-yellow-400 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        {instanceLog.restartCount} restarts
                      </span>
                    )}
                  </div>
                )}

                {/* Current Logs */}
                <pre className="text-xs text-white/70 font-mono overflow-x-auto max-h-[400px] overflow-y-auto bg-black/50 rounded-lg p-4 whitespace-pre-wrap">
                  {instanceLog.logs || 'Waiting for logs... (app may still be starting)'}
                </pre>

                {/* Previous Container Logs */}
                {showPrevious && instanceLog.previousLogs && (
                  <div className="mt-3">
                    <div className="flex items-center gap-2 mb-2 text-xs text-yellow-400">
                      <Clock className="w-3 h-3" />
                      Previous Container (before restart)
                    </div>
                    <pre className="text-xs text-yellow-400/70 font-mono overflow-x-auto max-h-[200px] overflow-y-auto bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-4 whitespace-pre-wrap">
                      {instanceLog.previousLogs}
                    </pre>
                  </div>
                )}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
