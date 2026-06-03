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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { copyToClipboard } from '@/lib/utils/safe-clipboard';

// ─── Design tokens (match app-overview-tab / app-bandwidth-card) ────
const MONO = 'font-[var(--font-geist-mono),ui-monospace,monospace]';
const ACCENT = '#0095FF';

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
      <section className="rounded-[8px] border border-white/[0.06] bg-[#111216] overflow-hidden">
        <div className="py-12 text-center">
          <Terminal className="mx-auto mb-3 h-7 w-7 text-white/25" />
          <p className="text-[13px] font-medium text-white">Runtime logs will be available after deployment starts.</p>
          <p className={`${MONO} mt-2 text-[10px] uppercase tracking-[0.14em] text-white/40`}>Current status: {appStatus}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-[8px] border border-white/[0.06] bg-[#111216] overflow-hidden">
      <header className="border-b border-white/[0.06] px-5 py-3.5">
        {/* Row 1: title + streaming badge + action buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Title */}
          <div className="flex items-center gap-2.5 mr-1 min-w-0">
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] border border-white/[0.08] bg-[#0d0e11]" style={{ color: ACCENT }}>
              <Terminal className="h-3.5 w-3.5" />
            </span>
            <h3 className="text-[13px] font-semibold tracking-[-0.01em] text-white">Runtime Logs</h3>
            {streaming && (
              <span
                className={`${MONO} inline-flex items-center gap-1.5 rounded-[4px] border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]`}
                style={{ color: '#4ade80', background: 'rgba(74,222,128,0.10)', borderColor: 'rgba(74,222,128,0.30)' }}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-[#4ade80] animate-pulse" style={{ boxShadow: '0 0 5px #4ade80' }} />
                Live
              </span>
            )}
            {isPaused && (
              <span
                className={`${MONO} inline-flex items-center gap-1.5 rounded-[4px] border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]`}
                style={{ color: '#fbbf24', background: 'rgba(251,191,36,0.10)', borderColor: 'rgba(251,191,36,0.30)' }}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-[#fbbf24]" />
                Paused
              </span>
            )}
            {!loading && instances.length > 0 && (
              <span className={`${MONO} text-[10px] uppercase tracking-[0.1em] text-white/30`}>{instances.length} instance{instances.length !== 1 ? 's' : ''}</span>
            )}
          </div>

          {/* Time range selector */}
          <Select value={timeRange} onValueChange={(v) => { setTimeRange(v); }}>
            <SelectTrigger className={`${MONO} h-9 w-auto min-w-[130px] text-[11px] border-white/[0.08] bg-[#0d0e11] rounded-[5px] text-white/75 focus:ring-0 focus:ring-offset-0`}>
              <Clock className="w-3.5 h-3.5 mr-1.5 text-white/40" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#0d0e11] border-white/[0.08] rounded-[6px]">
              {TIME_RANGES.map(range => (
                <SelectItem key={range.value} value={range.value} className={`${MONO} text-[11px]`}>
                  {range.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Instance selector — only visible when >1 instance */}
          {instances.length > 1 && (
            <Select value={selectedInstance} onValueChange={setSelectedInstance}>
              <SelectTrigger className={`${MONO} h-9 w-auto min-w-[140px] text-[11px] border-white/[0.08] bg-[#0d0e11] rounded-[5px] text-white/75 focus:ring-0 focus:ring-offset-0`}>
                <SelectValue placeholder="All instances" />
              </SelectTrigger>
              <SelectContent className="bg-[#0d0e11] border-white/[0.08] rounded-[6px]">
                <SelectItem value="all" className={`${MONO} text-[11px]`}>All Instances</SelectItem>
                {instances.map(inst => (
                  <SelectItem key={inst.instanceId} value={inst.instanceId} className={`${MONO} text-[11px]`}>
                    {inst.displayName}
                    {inst.restartCount > 0 && (
                      <span className="text-[#fbbf24] ml-1.5 text-[10px]">↺{inst.restartCount}</span>
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
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`inline-flex h-9 items-center justify-center rounded-[5px] border px-2.5 transition-colors ${
                showFilters
                  ? 'border-[#0095FF]/30 bg-[#0095FF]/[0.12] text-[#0095FF]'
                  : 'border-white/[0.08] bg-[#111216] text-white/65 hover:text-white hover:bg-white/[0.04]'
              }`}
              title="Filters"
            >
              <Filter className="w-3.5 h-3.5" />
            </button>

            {/* Previous logs toggle */}
            {hasRestartedInstances && (
              <button
                onClick={() => setShowPrevious(!showPrevious)}
                className={`inline-flex h-9 items-center justify-center rounded-[5px] border px-2.5 transition-colors ${
                  showPrevious
                    ? 'border-[#fbbf24]/30 bg-[#fbbf24]/[0.12] text-[#fbbf24]'
                    : 'border-white/[0.08] bg-[#111216] text-white/65 hover:text-white hover:bg-white/[0.04]'
                }`}
                title="Show logs before last restart"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Stream / Pause / Stop */}
            {!streaming ? (
              <button
                onClick={startStreaming}
                className={`${MONO} inline-flex h-9 items-center gap-1.5 rounded-[5px] border border-white/[0.08] bg-[#111216] px-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/65 transition-colors hover:text-white hover:bg-white/[0.04]`}
                title="Stream live logs"
              >
                <Play className="w-3.5 h-3.5" />
                Stream
              </button>
            ) : (
              <>
                <button
                  onClick={() => setIsPaused(!isPaused)}
                  className={`inline-flex h-9 items-center justify-center rounded-[5px] border px-2.5 transition-colors ${
                    isPaused
                      ? 'border-[#fbbf24]/30 bg-[#fbbf24]/[0.12] text-[#fbbf24]'
                      : 'border-white/[0.08] bg-[#111216] text-white/65 hover:text-white hover:bg-white/[0.04]'
                  }`}
                  title={isPaused ? 'Resume stream' : 'Pause stream'}
                >
                  {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => setAutoScroll(!autoScroll)}
                  className={`inline-flex h-9 items-center justify-center rounded-[5px] border px-2.5 text-[13px] transition-colors ${
                    autoScroll
                      ? 'border-[#0095FF]/30 bg-[#0095FF]/[0.12] text-[#0095FF]'
                      : 'border-white/[0.08] bg-[#111216] text-white/40 hover:text-white hover:bg-white/[0.04]'
                  }`}
                  title={autoScroll ? 'Auto-scroll on' : 'Auto-scroll off'}
                >
                  ↓
                </button>
                <button
                  onClick={stopStreaming}
                  className={`${MONO} inline-flex h-9 items-center justify-center rounded-[5px] border border-[#f87171]/25 bg-[#f87171]/[0.08] px-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#f87171] transition-colors hover:bg-[#f87171]/[0.16]`}
                  title="Stop streaming"
                >
                  Stop
                </button>
              </>
            )}

            <button
              onClick={fetchLogs}
              disabled={loading || streaming}
              className="inline-flex h-9 items-center justify-center rounded-[5px] border border-white/[0.08] bg-[#111216] px-2.5 text-white/65 transition-colors hover:text-white hover:bg-white/[0.04] disabled:opacity-40"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={copyLogs}
              disabled={filteredLogs.length === 0}
              className="inline-flex h-9 items-center justify-center rounded-[5px] border border-white/[0.08] bg-[#111216] px-2.5 text-white/65 transition-colors hover:text-white hover:bg-white/[0.04] disabled:opacity-40"
              title="Copy logs"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-[#4ade80]" /> : <Copy className="w-3.5 h-3.5" />}
            </button>

            <button
              onClick={downloadLogs}
              disabled={logs.length === 0}
              className="inline-flex h-9 items-center justify-center rounded-[5px] border border-white/[0.08] bg-[#111216] px-2.5 text-white/65 transition-colors hover:text-white hover:bg-white/[0.04] disabled:opacity-40"
              title="Download logs"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Expandable Filter Bar */}
        {showFilters && (
          <div className="mt-3.5 pt-3.5 border-t border-white/[0.06] flex items-center gap-2.5 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-[400px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40" />
              <input
                placeholder="Search runtime logs…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`${MONO} w-full pl-9 pr-8 h-9 bg-[#0d0e11] border border-white/[0.08] text-[11px] text-white placeholder:text-white/30 rounded-[5px] outline-none focus:border-white/[0.16]`}
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
              {LOG_LEVELS.map((level) => {
                const active = logLevel === level.value;
                const tone =
                  level.value === 'error' ? '#f87171'
                  : level.value === 'warn' ? '#fbbf24'
                  : level.value === 'info' ? '#0095FF'
                  : level.value === 'success' ? '#4ade80'
                  : '#ffffff';
                return (
                  <button
                    key={level.value}
                    onClick={() => setLogLevel(level.value)}
                    className={`${MONO} inline-flex h-9 items-center rounded-[5px] border px-2.5 text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors ${
                      active ? '' : 'border-white/[0.08] bg-[#0d0e11] text-white/50 hover:text-white/80'
                    }`}
                    style={active ? { color: tone, background: `${tone}1f`, borderColor: `${tone}4d` } : undefined}
                  >
                    {level.label}
                  </button>
                );
              })}
            </div>

            {searchTerm && (
              <span
                className={`${MONO} inline-flex items-center rounded-[4px] border border-white/[0.10] bg-white/[0.05] px-2 py-1 text-[10px] uppercase tracking-[0.1em] text-white/60`}
              >
                {totalMatches} match{totalMatches !== 1 ? 'es' : ''}
              </span>
            )}

            {(searchTerm || logLevel !== 'all') && (
              <button
                onClick={() => { setSearchTerm(''); setLogLevel('all'); }}
                className={`${MONO} inline-flex h-9 items-center rounded-[5px] px-2.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/50 transition-colors hover:text-white hover:bg-white/[0.04]`}
              >
                Clear
              </button>
            )}
          </div>
        )}
      </header>

      <div className="p-0">
        <div className="bg-[#0a0b0d] h-[600px] overflow-auto
          [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent
          [&::-webkit-scrollbar-thumb]:bg-white/10 hover:[&::-webkit-scrollbar-thumb]:bg-white/20">
          {error && (
            <div className={`${MONO} mx-4 mt-3 rounded-[6px] border border-[#f87171]/25 bg-[#f87171]/[0.08] px-3 py-2 text-[11px] text-[#f87171]`}>
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
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Terminal className="w-7 h-7 mb-3 text-white/25" />
              <p className="text-[13px] font-medium text-white">No running instances found</p>
              <p className={`${MONO} mt-2 text-[10px] uppercase tracking-[0.12em] text-white/40`}>The app may still be starting or scaling</p>
            </div>
          ) : filteredLogs.every(l => !l.logs || l.logs.trim() === '') ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Terminal className="w-7 h-7 mb-3 text-white/25" />
              {searchTerm || logLevel !== 'all' ? (
                <>
                  <p className="text-[13px] font-medium text-white">No logs match current filters</p>
                  <button
                    onClick={() => { setSearchTerm(''); setLogLevel('all'); }}
                    className={`${MONO} mt-2.5 text-[10px] uppercase tracking-[0.1em] text-white/55 hover:text-white`}
                  >
                    Clear filters
                  </button>
                </>
              ) : instances.some((i) => i.status === 'Pending' || !i.ready) ? (
                <p className="text-[12px] text-[#fbbf24]/80">Instance is starting — logs will appear shortly</p>
              ) : instances.some((i) => i.status === 'Failed') ? (
                <p className="text-[12px] text-[#f87171]/80">Instance failed to start. Check build logs for errors.</p>
              ) : streaming ? (
                <p className={`${MONO} text-[10px] uppercase tracking-[0.12em] text-white/40`}>Waiting for log data…</p>
              ) : (
                <>
                  <p className="text-[13px] font-medium text-white">No logs in the selected time range</p>
                  {timeRange !== '604800' && (
                    <button
                      onClick={() => setTimeRange('604800')}
                      className={`${MONO} mt-2.5 text-[10px] uppercase tracking-[0.1em] text-white/55 hover:text-white`}
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
                    <div className="flex items-center gap-2.5 px-4 py-2 border-b border-white/[0.08] sticky top-0 z-10 backdrop-blur-md bg-[#0a0b0d]/85">
                      <span className={`${MONO} text-[11px] text-white/65`}>{instanceLog.displayName}</span>
                      <span className={`${MONO} inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.08em] ${
                        instanceLog.status === 'Running' ? 'text-[#4ade80]' :
                        instanceLog.status === 'Failed' ? 'text-[#f87171]' : 'text-[#fbbf24]'
                      }`}>● {instanceLog.status || 'Unknown'}</span>
                      {instanceLog.restartCount > 0 && (
                        <span className={`${MONO} text-[10px] text-[#fbbf24]`}>↺ {instanceLog.restartCount} restarts</span>
                      )}
                      {searchTerm && !!instanceLog.matchCount && (
                        <span className={`${MONO} text-[10px] text-[#fbbf24]`}>
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
                    <div className="border-t border-[#fbbf24]/20 bg-[#fbbf24]/[0.03]">
                      <div className={`${MONO} flex items-center gap-2 px-4 py-2 text-[10px] uppercase tracking-[0.08em] text-[#fbbf24]/75`}>
                        <Clock className="w-3 h-3" />
                        Previous instance (before restart)
                      </div>
                      <pre className="font-mono text-xs text-[#fbbf24]/60 px-4 pb-4 whitespace-pre">
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
      </div>
    </section>
  );
}
