'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Terminal,
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
import { Card, CardContent, CardHeader } from '@/components/ui/card';
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
import { copyToClipboard } from '@/lib/utils/safe-clipboard';

// Time range options for log filtering
const TIME_RANGES = [
  { value: '900', label: 'Last 15 min' },
  { value: '3600', label: 'Last 1 hour' },
  { value: '21600', label: 'Last 6 hours' },
  { value: '86400', label: 'Last 24 hours' },
  { value: '604800', label: 'Last 7 days' },
] as const;

// Log level filters
type LogLevel = 'all' | 'error' | 'warn' | 'info' | 'success';
const LOG_LEVELS: { value: LogLevel; label: string; color: string }[] = [
  { value: 'all', label: 'All Levels', color: 'text-white' },
  { value: 'error', label: 'Errors', color: 'text-red-400' },
  { value: 'warn', label: 'Warnings', color: 'text-yellow-400' },
  { value: 'info', label: 'Info', color: 'text-blue-400' },
  { value: 'success', label: 'Success', color: 'text-green-400' },
];

// ─── Pure helpers ───────────────────────────────────────────────────────────

/** Raw K8s timestamp prefix  : "2024-01-01T00:00:00.000Z message" */
const K8S_TS_RE     = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)\s+(.*)/;
/** Already-normalised format : "[2024-01-01T00:00:00.000Z] message" */
const BRACKET_TS_RE = /^\[(\d{4}-\d{2}-\d{2}T[^\]]+)\]/;

/**
 * Converts a raw Kubernetes log line to "[timestamp] message" format.
 * Lines already in that format are returned unchanged.
 * Returns both the formatted line and the extracted timestamp string.
 */
function normalizeLogLine(line: string): { formatted: string; timestamp: string } {
  const raw = line.match(K8S_TS_RE);
  if (raw) return { formatted: `[${raw[1]}] ${raw[2]}`, timestamp: raw[1] };
  const bracket = line.match(BRACKET_TS_RE);
  if (bracket) return { formatted: line, timestamp: bracket[1] };
  return { formatted: line, timestamp: '' };
}

/**
 * Returns true if a log line matches the given level filter.
 */
function matchesLogLevel(line: string, level: LogLevel): boolean {
  if (level === 'all') return true;
  const l = line.toLowerCase();
  switch (level) {
    case 'error':   return l.includes('error') || l.includes('err') || l.includes('fatal') || l.includes('panic') || l.includes('exception') || l.includes('fail');
    case 'warn':    return l.includes('warn') || l.includes('warning');
    case 'info':    return l.includes('info') || l.includes('log') || l.includes('debug');
    case 'success': return l.includes('success') || l.includes('done') || l.includes('complete');
    default: return true;
  }
}

/**
 * Normalises existing static log text to bracket format so it's consistent
 * with streaming events. Also returns per-line counts for safe replay
 * deduplication when the stream starts (without dropping valid same-timestamp
 * lines that happen later).
 */
function prepareStreamSeed(rawLogs: string): { lines: string[]; seedCounts: Map<string, number> } {
  if (!rawLogs.trim()) return { lines: [], seedCounts: new Map() };
  const lines = rawLogs.split('\n').map(line => {
    const { formatted } = normalizeLogLine(line);
    return formatted;
  });

  const seedCounts = new Map<string, number>();
  for (const line of lines) {
    seedCounts.set(line, (seedCounts.get(line) || 0) + 1);
  }

  return { lines, seedCounts };
}

function consumeSeedLine(seedCounts: Map<string, number>, line: string): boolean {
  const remaining = seedCounts.get(line);
  if (!remaining) return false;
  if (remaining === 1) seedCounts.delete(line);
  else seedCounts.set(line, remaining - 1);
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────

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
        } else if (lowerLine.includes('success') || lowerLine.includes('done') || lowerLine.includes('complete')) {
          lineClass = 'text-green-400';
        } else if (line.startsWith('[Pipeline]') || line.startsWith('+ ') || lowerLine.includes('info')) {
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
  // Present only on filtered results (computed by filteredLogs useMemo)
  matchCount?: number;
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
  const [autoScroll, setAutoScroll] = useState(true);
  const [showPrevious, setShowPrevious] = useState(false);

  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [logLevel, setLogLevel] = useState<LogLevel>('all');
  const [timeRange, setTimeRange] = useState('604800');
  const [copied, setCopied] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const streamLogsRef = useRef<string[]>([]);
  // Refs so streaming callbacks always read latest values without stale closures
  const isPausedRef = useRef(false);
  const autoScrollRef = useRef(true);
  // Keeps a readable copy of `logs` state for use inside startStreaming without
  // needing to add `logs` to the useCallback dependency array.
  const logsRef = useRef<InstanceLogs[]>([]);

  // Keep refs in sync
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
  useEffect(() => { autoScrollRef.current = autoScroll; }, [autoScroll]);
  useEffect(() => { logsRef.current = logs; }, [logs]);


  // Filter logs based on search term and log level
  const filteredLogs = useMemo(() => {
    return logs.map(instanceLog => {
      let text = instanceLog.logs;

      if (logLevel !== 'all' && text)
        text = text.split('\n').filter(l => matchesLogLevel(l, logLevel)).join('\n');

      if (searchTerm && text)
        text = text.split('\n').filter(l => l.toLowerCase().includes(searchTerm.toLowerCase())).join('\n');

      return {
        ...instanceLog,
        logs: text,
        matchCount: searchTerm
          ? (text.match(new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length
          : 0,
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
    
    void copyToClipboard(allLogs);
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
    if (eventSourceRef.current) eventSourceRef.current.close();

    const instanceParam = selectedInstance !== 'all' ? `&instance=${selectedInstance}` : '';
    const url = `/api/services/platform-apps/runtime-logs?app_id=${appId}${instanceParam}&follow=true&tail=100&since=${timeRange}`;
    const displayName = selectedInstance === 'all'
      ? 'All Instances'
      : instances.find(i => i.instanceId === selectedInstance)?.displayName ?? selectedInstance;

    // Normalize existing static snapshot and track seeded lines so we can
    // skip only replayed duplicates from stream startup.
    const existing = logsRef.current.find(l => selectedInstance === 'all' || l.instance === selectedInstance);
    const { lines, seedCounts } = prepareStreamSeed(existing?.logs ?? '');
    streamLogsRef.current = lines;

    // Show normalized snapshot immediately, then append live events on top.
    const makeEntry = (logs: string): InstanceLogs => ({
      instance: selectedInstance, displayName, status: 'Running', restartCount: 0, logs, previousLogs: null,
    });
    setStreaming(true);
    setLogs([makeEntry(lines.join('\n'))]);

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      if (isPausedRef.current) return;
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'error') { setError(data.message); eventSource.close(); setStreaming(false); return; }
        if (data.type === 'end')   { setStreaming(false); return; }
        const logLine = `[${data.timestamp}] ${data.message}`;
        if (consumeSeedLine(seedCounts, logLine)) return;
        streamLogsRef.current.push(logLine);
        if (streamLogsRef.current.length > 1000) streamLogsRef.current = streamLogsRef.current.slice(-1000);
        setLogs([makeEntry(streamLogsRef.current.join('\n'))]);
        if (autoScrollRef.current) logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      } catch { /* malformed SSE frame — ignore */ }
    };

    eventSource.onerror = () => { setStreaming(false); eventSource.close(); };
  }, [appId, selectedInstance, instances, timeRange]);

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
      `=== ${instanceLog.displayName} ===\n${instanceLog.logs}${instanceLog.previousLogs ? `\n\n=== Previous Instance ===\n${instanceLog.previousLogs}` : ''}`
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

  // Re-fetch when instance or time range changes (stop streaming first)
  useEffect(() => {
    if (streaming) {
      stopStreaming();
    }
    // fetchLogs deps include selectedInstance + timeRange so this triggers it
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedInstance, timeRange]);

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
      <Card className="bg-white/5 border-white/10 rounded-none">
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
    <Card className="bg-white/5 border-white/10 rounded-none">
      <CardHeader className="border-b border-white/[0.06] py-3 px-4">
        {/* Row 1: title + streaming badge + action buttons */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Title */}
          <div className="flex items-center gap-2 mr-1">
            <Terminal className="w-4 h-4 text-white/60" />
            <span className="text-sm font-semibold text-white">Runtime Logs</span>
            {streaming && (
              <Badge className="bg-green-500/10 border border-green-500/30 text-green-400 text-[10px] px-1.5 py-0">
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full mr-1 animate-pulse" />
                Live
              </Badge>
            )}
            {isPaused && (
              <Badge className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-[10px] px-1.5 py-0">
                Paused
              </Badge>
            )}
            {!loading && instances.length > 0 && (
              <span className="text-[11px] text-white/30">{instances.length} instance{instances.length !== 1 ? 's' : ''}</span>
            )}
          </div>

          {/* Time range selector */}
          <Select value={timeRange} onValueChange={(v) => { setTimeRange(v); }}>
            <SelectTrigger className="h-7 w-auto min-w-[130px] text-xs border-white/[0.12] bg-white/[0.03] rounded-none focus:ring-0 focus:ring-offset-0">
              <Clock className="w-3 h-3 mr-1.5 text-white/40" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#0f0f0f] border-white/[0.1] rounded-none">
              {TIME_RANGES.map(range => (
                <SelectItem key={range.value} value={range.value} className="text-xs">
                  {range.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Instance selector — only visible when >1 instance */}
          {instances.length > 1 && (
            <Select value={selectedInstance} onValueChange={setSelectedInstance}>
              <SelectTrigger className="h-7 w-auto min-w-[140px] text-xs border-white/[0.12] bg-white/[0.03] rounded-none focus:ring-0 focus:ring-offset-0">
                <SelectValue placeholder="All instances" />
              </SelectTrigger>
              <SelectContent className="bg-[#0f0f0f] border-white/[0.1] rounded-none">
                <SelectItem value="all" className="text-xs">All Instances</SelectItem>
                {instances.map(inst => (
                  <SelectItem key={inst.instanceId} value={inst.instanceId} className="text-xs font-mono">
                    {inst.displayName}
                    {inst.restartCount > 0 && (
                      <span className="text-yellow-400 ml-1.5 text-[10px]">↺{inst.restartCount}</span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Action buttons */}
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className={`h-7 px-2 rounded-none border-white/[0.12] ${
                showFilters ? 'bg-blue-500/15 border-blue-500/30 text-blue-400' : 'bg-white/[0.03] text-white/60 hover:text-white'
              }`}
              title="Filters"
            >
              <Filter className="w-3.5 h-3.5" />
            </Button>

            {/* Previous logs toggle */}
            {hasRestartedInstances && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowPrevious(!showPrevious)}
                className={`h-7 px-2 rounded-none border-white/[0.12] ${
                  showPrevious ? 'bg-yellow-500/15 border-yellow-500/30 text-yellow-400' : 'bg-white/[0.03] text-white/60 hover:text-white'
                }`}
                title="Show logs before last restart"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
              </Button>
            )}

            {/* Stream / Pause / Stop */}
            {!streaming ? (
              <Button
                size="sm"
                variant="outline"
                onClick={startStreaming}
                className="h-7 px-2.5 rounded-none border-white/[0.12] bg-white/[0.03] text-white/60 hover:text-white text-xs gap-1.5"
                title="Stream live logs"
              >
                <Play className="w-3.5 h-3.5" />
                Stream
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsPaused(!isPaused)}
                  className={`h-7 px-2 rounded-none border-white/[0.12] ${
                    isPaused ? 'bg-yellow-500/15 border-yellow-500/30 text-yellow-400' : 'bg-white/[0.03] text-white/60 hover:text-white'
                  }`}
                  title={isPaused ? 'Resume stream' : 'Pause stream'}
                >
                  {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setAutoScroll(!autoScroll)}
                  className={`h-7 px-2 rounded-none border-white/[0.12] text-xs ${
                    autoScroll ? 'bg-blue-500/15 border-blue-500/30 text-blue-400' : 'bg-white/[0.03] text-white/40'
                  }`}
                  title={autoScroll ? 'Auto-scroll on' : 'Auto-scroll off'}
                >
                  ↓
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={stopStreaming}
                  className="h-7 px-2 rounded-none border-red-500/20 bg-red-500/5 text-red-400 hover:bg-red-500/15 text-xs"
                  title="Stop streaming"
                >
                  Stop
                </Button>
              </>
            )}

            <Button
              size="sm"
              variant="outline"
              onClick={fetchLogs}
              disabled={loading || streaming}
              className="h-7 px-2 rounded-none border-white/[0.12] bg-white/[0.03] text-white/60 hover:text-white"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={copyLogs}
              disabled={filteredLogs.length === 0}
              className="h-7 px-2 rounded-none border-white/[0.12] bg-white/[0.03] text-white/60 hover:text-white"
              title="Copy logs"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={downloadLogs}
              disabled={logs.length === 0}
              className="h-7 px-2 rounded-none border-white/[0.12] bg-white/[0.03] text-white/60 hover:text-white"
              title="Download logs"
            >
              <Download className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Expandable Filter Bar */}
        {showFilters && (
          <div className="mt-3 pt-3 border-t border-white/[0.06] flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-[400px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40" />
              <Input
                placeholder="Search runtime logs…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-8 h-7 bg-black/30 border-white/[0.12] text-xs rounded-none"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1">
              {LOG_LEVELS.map((level) => (
                <Button
                  key={level.value}
                  size="sm"
                  variant="outline"
                  onClick={() => setLogLevel(level.value)}
                  className={`h-7 text-xs rounded-none border-white/[0.12] ${
                    logLevel === level.value
                      ? level.value === 'error'
                        ? 'bg-red-500/20 text-red-400 border-red-500/20'
                        : level.value === 'warn'
                        ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/20'
                        : level.value === 'info'
                        ? 'bg-blue-500/20 text-blue-400 border-blue-500/20'
                        : level.value === 'success'
                        ? 'bg-green-500/20 text-green-400 border-green-500/20'
                        : 'bg-white/10 text-white'
                      : 'bg-white/[0.03] text-white/50'
                  }`}
                >
                  {level.label}
                </Button>
              ))}
            </div>

            {searchTerm && (
              <Badge variant="outline" className="text-xs">
                {totalMatches} match{totalMatches !== 1 ? 'es' : ''}
              </Badge>
            )}

            {(searchTerm || logLevel !== 'all') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setSearchTerm(''); setLogLevel('all'); }}
                className="h-7 text-xs text-white/50 hover:text-white"
              >
                Clear
              </Button>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent className="p-0">
        <div className="bg-[#0c0c0c] border-t border-white/[0.05] h-[600px] overflow-auto
          [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent
          [&::-webkit-scrollbar-thumb]:bg-white/10 hover:[&::-webkit-scrollbar-thumb]:bg-white/20">
          {error && (
            <div className="mx-4 mt-3 border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {error}
            </div>
          )}
          {loading ? (
            <div className="h-full p-4 space-y-2 overflow-hidden">
              {Array.from({ length: 30 }).map((_, i) => (
                <div
                  key={i}
                  className="h-3 rounded bg-white/[0.06] animate-pulse"
                  style={{ width: `${38 + ((i * 41) % 52)}%` }}
                />
              ))}
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-white/40 text-xs">
              <Terminal className="w-6 h-6 mb-2 opacity-30" />
              <p>No running instances found</p>
              <p className="mt-1 text-white/30">The app may still be starting or scaling</p>
            </div>
          ) : filteredLogs.every(l => !l.logs || l.logs.trim() === '') ? (
            <div className="flex flex-col items-center justify-center h-full text-white/40 text-xs">
              <Terminal className="w-6 h-6 mb-2 opacity-30" />
              {searchTerm || logLevel !== 'all' ? (
                <>
                  <p>No logs match current filters</p>
                  <button
                    onClick={() => { setSearchTerm(''); setLogLevel('all'); }}
                    className="mt-2 text-white/60 underline underline-offset-2 hover:text-white"
                  >
                    Clear filters
                  </button>
                </>
              ) : instances.some((i) => i.status === 'Pending' || !i.ready) ? (
                <p className="text-yellow-400/70">Instance is starting — logs will appear shortly</p>
              ) : instances.some((i) => i.status === 'Failed') ? (
                <p className="text-red-400/70">Instance failed to start. Check build logs for errors.</p>
              ) : streaming ? (
                <p className="text-white/30">Waiting for log data…</p>
              ) : (
                <>
                  <p>No logs in the selected time range</p>
                  {timeRange !== '604800' && (
                    <button
                      onClick={() => setTimeRange('604800')}
                      className="mt-2 text-white/60 underline underline-offset-2 hover:text-white"
                    >
                      Show last 7 days
                    </button>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="font-mono text-xs">
              {filteredLogs.map((instanceLog, idx) => (
                <div key={idx} className={idx > 0 ? 'border-t border-white/[0.06]' : ''}>
                  {(selectedInstance === 'all' || filteredLogs.length > 1) && (
                    <div className="flex items-center gap-2 px-4 py-2 border-b border-white/[0.10] sticky top-0 z-10 backdrop-blur-md bg-[#0c0c0c]/80">
                      <span className="text-[11px] font-mono text-white/60">{instanceLog.displayName}</span>
                      <span className={`text-[10px] ${
                        instanceLog.status === 'Running' ? 'text-green-400' :
                        instanceLog.status === 'Failed' ? 'text-red-400' : 'text-yellow-400'
                      }`}>● {instanceLog.status || 'Unknown'}</span>
                      {instanceLog.restartCount > 0 && (
                        <span className="text-[10px] text-yellow-400">↺ {instanceLog.restartCount} restarts</span>
                      )}
                      {searchTerm && !!instanceLog.matchCount && (
                        <span className="text-[10px] text-yellow-400">
                          {instanceLog.matchCount} match{instanceLog.matchCount !== 1 ? 'es' : ''}
                        </span>
                      )}
                    </div>
                  )}
                  <pre className="p-4 whitespace-pre">
                    {instanceLog.logs && instanceLog.logs.trim() ? (
                      <LogContent content={instanceLog.logs} searchTerm={searchTerm} />
                    ) : (
                      <span className="text-white/30 italic">No logs for this instance in the selected range</span>
                    )}
                  </pre>
                  {showPrevious && instanceLog.previousLogs && (
                    <div className="border-t border-yellow-500/20 bg-yellow-500/[0.03]">
                      <div className="flex items-center gap-2 px-4 py-2 text-[11px] text-yellow-400/70">
                        <Clock className="w-3 h-3" />
                        Previous instance (before restart)
                      </div>
                      <pre className="font-mono text-xs text-yellow-400/60 px-4 pb-4 whitespace-pre">
                        {instanceLog.previousLogs}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
