'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Terminal,
  Loader2,
  RefreshCw,
  Pause,
  Play,
  AlertTriangle,
  Download,
  Clock,
  Search,
  Filter,
  X,
  Copy,
  Check,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Time range options for log filtering
const TIME_RANGES = [
  { value: '900', label: 'Last 15 min' },
  { value: '3600', label: 'Last 1 hour' },
  { value: '21600', label: 'Last 6 hours' },
  { value: '86400', label: 'Last 24 hours' },
  { value: '604800', label: 'Last 7 days' },
] as const;

// Log level filters
type LogLevel = 'all' | 'error' | 'warn' | 'info';
const LOG_LEVELS: { value: LogLevel; label: string; color: string }[] = [
  { value: 'all', label: 'All Levels', color: 'text-white' },
  { value: 'error', label: 'Errors', color: 'text-red-400' },
  { value: 'warn', label: 'Warnings', color: 'text-yellow-400' },
  { value: 'info', label: 'Info', color: 'text-blue-400' },
];

// Component to render log content with search highlighting and log level coloring
function LogContent({ content, searchTerm }: { content: string; searchTerm: string }) {
  if (!content) return null;
  
  const lines = content.split('\n');
  
  return (
    <>
      {lines.map((line, i) => {
        // Determine line color based on log level
        let lineClass = 'text-white/70';
        const lowerLine = line.toLowerCase();
        if (lowerLine.includes('error') || lowerLine.includes('fatal') || lowerLine.includes('panic')) {
          lineClass = 'text-red-400';
        } else if (lowerLine.includes('warn')) {
          lineClass = 'text-yellow-400';
        } else if (lowerLine.includes('info')) {
          lineClass = 'text-blue-400';
        }
        
        // Highlight search matches
        if (searchTerm) {
          const parts = line.split(new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
          return (
            <div key={i} className={lineClass}>
              {parts.map((part, j) => 
                part.toLowerCase() === searchTerm.toLowerCase() ? (
                  <span key={j} className="bg-yellow-500/50 text-black px-0.5 rounded">
                    {part}
                  </span>
                ) : (
                  part
                )
              )}
            </div>
          );
        }
        
        return <div key={i} className={lineClass}>{line}</div>;
      })}
    </>
  );
}

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
  
  // New filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [logLevel, setLogLevel] = useState<LogLevel>('all');
  const [timeRange, setTimeRange] = useState('604800'); // Default 7 days (shows more logs)
  const [copied, setCopied] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  
  const logsEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const streamLogsRef = useRef<string[]>([]);

  // Filter logs based on search term and log level
  const filteredLogs = useMemo(() => {
    return logs.map(instanceLog => {
      let filteredLogText = instanceLog.logs;
      
      // Apply log level filter
      if (logLevel !== 'all' && filteredLogText) {
        const lines = filteredLogText.split('\n');
        filteredLogText = lines.filter(line => {
          const lowerLine = line.toLowerCase();
          switch (logLevel) {
            case 'error':
              return lowerLine.includes('error') || lowerLine.includes('err') || 
                     lowerLine.includes('fatal') || lowerLine.includes('panic') ||
                     lowerLine.includes('exception') || lowerLine.includes('fail');
            case 'warn':
              return lowerLine.includes('warn') || lowerLine.includes('warning');
            case 'info':
              return lowerLine.includes('info') || lowerLine.includes('log') ||
                     lowerLine.includes('debug');
            default:
              return true;
          }
        }).join('\n');
      }
      
      // Apply search filter
      if (searchTerm && filteredLogText) {
        const lines = filteredLogText.split('\n');
        filteredLogText = lines.filter(line => 
          line.toLowerCase().includes(searchTerm.toLowerCase())
        ).join('\n');
      }
      
      return {
        ...instanceLog,
        logs: filteredLogText,
        matchCount: searchTerm ? (filteredLogText.match(new RegExp(searchTerm, 'gi')) || []).length : 0,
      };
    });
  }, [logs, searchTerm, logLevel]);

  // Count total matches
  const totalMatches = useMemo(() => {
    if (!searchTerm) return 0;
    return filteredLogs.reduce((sum, log) => sum + (log.matchCount || 0), 0);
  }, [filteredLogs, searchTerm]);

  // Copy logs to clipboard
  const copyLogs = useCallback(() => {
    const allLogs = filteredLogs.map(instanceLog => 
      `=== ${instanceLog.displayName} ===\n${instanceLog.logs}`
    ).join('\n\n');
    
    navigator.clipboard.writeText(allLogs);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [filteredLogs]);

  // Fetch instances list (masked pod names)
  const fetchInstances = useCallback(async () => {
    // Allow fetching instances for any deployed state - users need to see logs to debug
    if (appStatus === 'pending') return;
    
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
    // Allow logs for any deployed state - users need to see logs to debug issues
    if (appStatus === 'pending') {
      setError('App not deployed yet. Logs will be available after deployment starts.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const instanceParam = selectedInstance !== 'all' ? `&instance=${selectedInstance}` : '';
      const url = `/api/services/platform-apps/runtime-logs?app_id=${appId}${instanceParam}&tail=500&since=${timeRange}`;
      
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
          status: data.status || 'Running',
          restartCount: data.restartCount || 0,
          logs: data.logs || '',
          previousLogs: null,
        }]);
        setError(''); // Clear any previous errors on successful fetch
      } else {
        // Multi-instance response
        setLogs(data.instances || []);
        setError(''); // Clear any previous errors on successful fetch
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch logs';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [appId, appStatus, selectedInstance, timeRange]);

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

  // Only block logs for 'pending' state (never deployed)
  // Users need to see logs for 'failed', 'stopped', 'building' etc. to debug issues
  if (appStatus === 'pending') {
    return (
      <Card className="bg-white/5 border-white/10">
        <CardContent className="py-8">
          <div className="text-center text-white/50">
            <Terminal className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>Runtime logs will be available after deployment starts.</p>
            <p className="text-sm mt-1">Current status: {appStatus}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white/5 border-white/10">
      <CardHeader className="pb-2">
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
            {!loading && instances.length > 0 && (
              <Badge variant="outline" className="text-xs text-white/50">
                {instances.length} instance{instances.length !== 1 ? 's' : ''}
              </Badge>
            )}
          </CardTitle>
          
          <div className="flex items-center gap-2">
            {/* Time Range Selector */}
            <Select value={timeRange} onValueChange={(v) => { setTimeRange(v); }}>
              <SelectTrigger className="w-[140px] bg-black/30 border-white/20 h-8 text-xs">
                <Clock className="w-3 h-3 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIME_RANGES.map(range => (
                  <SelectItem key={range.value} value={range.value}>
                    {range.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Instance Selector */}
            {instances.length > 1 && (
              <Select value={selectedInstance} onValueChange={setSelectedInstance}>
                <SelectTrigger className="w-[160px] bg-black/30 border-white/20 h-8 text-xs">
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

            {/* Toggle Filters */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className={`border-white/20 h-8 ${showFilters ? 'bg-blue-500/20 text-blue-400' : ''}`}
            >
              <Filter className="w-4 h-4" />
            </Button>

            {/* Show Previous Logs Toggle */}
            {hasRestartedInstances && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPrevious(!showPrevious)}
                className={`border-white/20 h-8 ${showPrevious ? 'bg-yellow-500/20 text-yellow-400' : ''}`}
              >
                <AlertTriangle className="w-4 h-4" />
              </Button>
            )}

            {/* Stream Controls */}
            {!streaming ? (
              <Button
                variant="outline"
                size="sm"
                onClick={startStreaming}
                className="border-white/20 h-8"
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
                  className="border-white/20 h-8"
                >
                  {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={stopStreaming}
                  className="border-white/20 text-red-400 h-8"
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
              className="border-white/20 h-8"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={copyLogs}
              disabled={filteredLogs.length === 0}
              className="border-white/20 h-8"
            >
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={downloadLogs}
              disabled={logs.length === 0}
              className="border-white/20 h-8"
            >
              <Download className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Expandable Filter Bar */}
        {showFilters && (
          <div className="mt-3 pt-3 border-t border-white/10 flex items-center gap-3 flex-wrap">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px] max-w-[400px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <Input
                placeholder="Search logs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-8 h-8 bg-black/30 border-white/20 text-sm"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            
            {/* Log Level Filter */}
            <Select value={logLevel} onValueChange={(v) => setLogLevel(v as LogLevel)}>
              <SelectTrigger className="w-[130px] bg-black/30 border-white/20 h-8 text-xs">
                <Filter className="w-3 h-3 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOG_LEVELS.map(level => (
                  <SelectItem key={level.value} value={level.value}>
                    <span className={level.color}>{level.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Match Count */}
            {searchTerm && (
              <Badge variant="outline" className="text-xs">
                {totalMatches} match{totalMatches !== 1 ? 'es' : ''}
              </Badge>
            )}

            {/* Active Filters Clear */}
            {(searchTerm || logLevel !== 'all') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setSearchTerm(''); setLogLevel('all'); }}
                className="h-8 text-xs text-white/50 hover:text-white"
              >
                Clear filters
              </Button>
            )}
          </div>
        )}
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
        ) : filteredLogs.length === 0 ? (
          <div className="text-center py-8 text-white/50">
            <Terminal className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No running instances found</p>
            <p className="text-sm mt-1">The app may still be starting up or scaling</p>
          </div>
        ) : filteredLogs.every(l => !l.logs || l.logs.trim() === '') ? (
          <div className="text-center py-8 text-white/50">
            <Terminal className="w-8 h-8 mx-auto mb-2 opacity-50" />
            {searchTerm || logLevel !== 'all' ? (
              <>
                <p>No logs match the current filters</p>
                <p className="text-sm mt-1">Try clearing filters or expanding the time range</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setSearchTerm(''); setLogLevel('all'); }}
                  className="mt-3 border-white/20"
                >
                  Clear Filters
                </Button>
              </>
            ) : instances.some((i) => i.status === 'Pending' || !i.ready) ? (
              <>
                <p>Instance is starting up</p>
                <p className="text-sm mt-1 text-yellow-400">
                  Container is being created. Logs will appear once it&apos;s running.
                </p>
              </>
            ) : instances.some((i) => i.status === 'Failed') ? (
              <>
                <p>Instance failed to start</p>
                <p className="text-sm mt-1 text-red-400">
                  Check build logs or configuration for errors.
                </p>
              </>
            ) : (
              <>
                <p>No logs available in the selected time range</p>
                <p className="text-sm mt-1">
                  This app may not produce logs frequently, or try selecting a longer time range
                </p>
                {timeRange !== '604800' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTimeRange('604800')}
                    className="mt-3 border-white/20"
                  >
                    Show Last 7 Days
                  </Button>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredLogs.map((instanceLog, idx) => (
              <div key={idx}>
                {/* Instance header - always show for multi-instance or when viewing "all" */}
                {(selectedInstance === 'all' || filteredLogs.length > 1) && (
                  <div className="flex items-center gap-2 mb-2 text-xs text-white/60">
                    <Badge variant="outline" className="text-xs font-medium">
                      {instanceLog.displayName}
                    </Badge>
                    <Badge className={`text-xs ${
                      instanceLog.status === 'Running' ? 'bg-green-500/20 text-green-400' :
                      instanceLog.status === 'Failed' ? 'bg-red-500/20 text-red-400' :
                      'bg-yellow-500/20 text-yellow-400'
                    }`}>
                      {instanceLog.status || 'Unknown'}
                    </Badge>
                    {instanceLog.restartCount > 0 && (
                      <span className="text-yellow-400 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        {instanceLog.restartCount} restarts
                      </span>
                    )}
                    {searchTerm && instanceLog.matchCount > 0 && (
                      <Badge className="bg-yellow-500/20 text-yellow-400 text-xs">
                        {instanceLog.matchCount} match{instanceLog.matchCount !== 1 ? 'es' : ''}
                      </Badge>
                    )}
                  </div>
                )}

                {/* Current Logs */}
                <pre className="text-xs text-white/70 font-mono overflow-x-auto max-h-[400px] overflow-y-auto bg-black/50 rounded-lg p-4 whitespace-pre-wrap">
                  {instanceLog.logs && instanceLog.logs.trim() ? (
                    <LogContent content={instanceLog.logs} searchTerm={searchTerm} />
                  ) : (
                    <span className="text-white/40 italic">
                      {searchTerm || logLevel !== 'all' 
                        ? 'No logs match the current filters for this instance' 
                        : 'No logs available for this instance in the selected time range'}
                    </span>
                  )}
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
