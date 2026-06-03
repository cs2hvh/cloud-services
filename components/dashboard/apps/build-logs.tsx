'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Terminal,
  Loader2,
  RefreshCw,
  Copy,
  Check,
  Download,
  Filter,
  Search,
  X,
  ArrowDown,
  ArrowUp,
  WrapText,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BuildInfo } from '@/components/dashboard/apps/types';
import { copyToClipboard } from '@/lib/utils/safe-clipboard';

// ─── Design tokens (match app-overview-tab / app-bandwidth-card) ────
const MONO = 'font-[var(--font-geist-mono),ui-monospace,monospace]';
const ACCENT = '#0095FF';

type Tone = 'green' | 'amber' | 'red' | 'blue' | 'neutral';

const TONE: Record<Tone, { color: string; bg: string; border: string }> = {
  green: { color: '#4ade80', bg: 'rgba(74,222,128,0.10)', border: 'rgba(74,222,128,0.25)' },
  amber: { color: '#fbbf24', bg: 'rgba(251,191,36,0.10)', border: 'rgba(251,191,36,0.25)' },
  red: { color: '#f87171', bg: 'rgba(248,113,113,0.10)', border: 'rgba(248,113,113,0.25)' },
  blue: { color: ACCENT, bg: 'rgba(0,149,255,0.10)', border: 'rgba(0,149,255,0.30)' },
  neutral: { color: 'rgba(255,255,255,0.6)', bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.10)' },
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface DeploymentSummary {
  build_number: number;
  status: string;
  started_at: string;
  trigger?: string | null;
}

interface BuildLogsPanelProps {
  buildInfo: BuildInfo | null;
  buildLogs: string;
  /** Show skeleton instead of logs — only for initial/build-switch fetch, not live polling */
  initialLoading?: boolean;
  logsError?: string;
  appName: string;
  fetchBuildLogs: (appName: string, buildNumber: number, raw?: boolean, append?: boolean) => Promise<boolean | void>;
  deployments?: DeploymentSummary[];
  onSelectBuild?: (buildNumber: number) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBuildStatus(status: string): string {
  switch (status) {
    case 'SUCCESS':  return 'Success';
    case 'FAILURE':  return 'Failed';
    case 'BUILDING': return 'Building';
    case 'ABORTED':  return 'Cancelled';
    case 'UNSTABLE': return 'Unstable';
    default:         return status;
  }
}

function statusTone(status: string): Tone {
  switch (status) {
    case 'SUCCESS':  return 'green';
    case 'FAILURE':  return 'red';
    case 'BUILDING': return 'blue';
    case 'ABORTED':  return 'neutral';
    default:         return 'amber';
  }
}

function formatRelative(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getRunLabel(deployment: Pick<DeploymentSummary, 'build_number' | 'trigger'>): string {
  return deployment.trigger === 'resize'
    ? `Resize #${deployment.build_number}`
    : `Build #${deployment.build_number}`;
}

// ─── Primitives ──────────────────────────────────────────────────────────────

function StatusPill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const t = TONE[tone];
  return (
    <span
      className={`${MONO} inline-flex items-center gap-1.5 rounded-[4px] border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] w-fit`}
      style={{ color: t.color, background: t.bg, borderColor: t.border }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: t.color, boxShadow: `0 0 5px ${t.color}` }} />
      {children}
    </span>
  );
}

function IconBtn({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex h-7 items-center justify-center gap-1 rounded-[5px] border px-2 text-[11px] transition-colors disabled:opacity-40 ${
        active
          ? 'text-white'
          : 'border-white/[0.08] bg-[#111216] text-white/55 hover:bg-white/[0.04] hover:text-white'
      }`}
      style={active ? { borderColor: TONE.blue.border, background: TONE.blue.bg, color: ACCENT } : undefined}
    >
      {children}
    </button>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BuildLogsPanel({
  buildInfo,
  buildLogs,
  initialLoading = false,
  logsError,
  appName,
  fetchBuildLogs,
  deployments = [],
  onSelectBuild,
}: BuildLogsPanelProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [copied, setCopied] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [logLevel, setLogLevel] = useState<'all' | 'error' | 'warn' | 'success'>('all');
  const [wordWrap, setWordWrap] = useState(false);
  const [showJumpButton, setShowJumpButton] = useState(false);
  const [showJumpTopButton, setShowJumpTopButton] = useState(false);

  const preRef = useRef<HTMLPreElement>(null);
  const wasAtBottomRef = useRef(true);

  // ── Dropdown options ──────────────────────────────────────────────────────
  // Jenkins is authoritative — two race windows to handle:
  // A) Jenkins done, Supabase still BUILDING → override (except result=null health-check window)
  // B) Jenkins active, Supabase shows stale terminal → override to BUILDING
  const buildOptions = useMemo<DeploymentSummary[]>(() => {
    const opts = deployments.map((d) => {
      if (d.build_number !== buildInfo?.number) return d;

      if (buildInfo.building === false && d.status === 'BUILDING') {
        if (buildInfo.result === null) return d;
        const RESULT_TO_STATUS: Record<string, DeploymentSummary['status']> = {
          SUCCESS: 'SUCCESS', ABORTED: 'ABORTED', UNSTABLE: 'UNSTABLE',
        };
        return { ...d, status: RESULT_TO_STATUS[buildInfo.result] ?? 'FAILURE' };
      }
      if (buildInfo.building === true && d.status !== 'BUILDING') {
        return { ...d, status: 'BUILDING' as DeploymentSummary['status'] };
      }
      return d;
    });

    if (buildInfo?.number != null && !opts.some((d) => d.build_number === buildInfo.number)) {
      opts.unshift({
        build_number: buildInfo.number,
        status: buildInfo.building ? 'BUILDING' : (buildInfo.result ?? 'SUCCESS'),
        started_at: new Date(buildInfo.timestamp || Date.now()).toISOString(),
      });
    }

    return opts;
  }, [deployments, buildInfo]);

  const selectedDeployment = useMemo(
    () => buildInfo?.number != null
      ? buildOptions.find((d) => d.build_number === buildInfo.number) ?? null
      : null,
    [buildInfo?.number, buildOptions]
  );
  const selectedRunLabel = selectedDeployment ? getRunLabel(selectedDeployment) : null;
  const isResizeRun = selectedDeployment?.trigger === 'resize';

  // ── Filtering ─────────────────────────────────────────────────────────────
  const hasContent = !!(buildLogs && buildLogs !== 'No logs available');

  const levelFilteredLines = useMemo(() => {
    if (!hasContent) return [];
    const lines = buildLogs.split('\n');
    if (logLevel === 'all') return lines;
    return lines.filter((line) => {
      const lower = line.toLowerCase();
      if (logLevel === 'error')   return lower.includes('error') || lower.includes('fail') || lower.includes('fatal');
      if (logLevel === 'warn')    return lower.includes('warn') || lower.includes('warning');
      if (logLevel === 'success') return lower.includes('success') || lower.includes('done') || lower.includes('complete');
      return true;
    });
  }, [buildLogs, logLevel, hasContent]);

  const filteredLines = useMemo(() => {
    if (!searchTerm) return levelFilteredLines;
    const lower = searchTerm.toLowerCase();
    return levelFilteredLines.filter((line) => line.toLowerCase().includes(lower));
  }, [levelFilteredLines, searchTerm]);

  const filteredLogs = useMemo(() => filteredLines.join('\n'), [filteredLines]);

  const matchCount = useMemo(() => {
    if (!searchTerm || !filteredLogs) return 0;
    const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    return (filteredLogs.match(regex) || []).length;
  }, [filteredLogs, searchTerm]);

  const lineCount = useMemo(() => {
    if (!hasContent) return 0;
    return buildLogs.split('\n').length;
  }, [buildLogs, hasContent]);

  // ── Scroll management ─────────────────────────────────────────────────────
  const handleScroll = useCallback(() => {
    const el = preRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    wasAtBottomRef.current = atBottom;
    setShowJumpButton(!atBottom && hasContent);
    setShowJumpTopButton(el.scrollTop > 80 && hasContent);
  }, [hasContent]);

  useEffect(() => {
    if (wasAtBottomRef.current && preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight;
    }
  }, [buildLogs]);

  const jumpToBottom = () => {
    if (!preRef.current) return;
    preRef.current.scrollTop = preRef.current.scrollHeight;
    wasAtBottomRef.current = true;
    setShowJumpButton(false);
  };

  const jumpToTop = () => {
    if (!preRef.current) return;
    preRef.current.scrollTop = 0;
    wasAtBottomRef.current = false;
    setShowJumpTopButton(false);
  };

  // ── Actions ───────────────────────────────────────────────────────────────
  const copyLogs = () => {
    void copyToClipboard(filteredLogs || buildLogs);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadLogs = () => {
    const content = filteredLogs || buildLogs;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${appName}-build-${buildInfo?.number ?? 'latest'}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRefresh = () => {
    if (!buildInfo) return;
    fetchBuildLogs(appName, buildInfo.number, buildInfo.building ?? false);
  };

  // ── Log rendering ─────────────────────────────────────────────────────────
  const renderLines = () => {
    if (!hasContent) {
      return (
        <span className="text-white/30 italic">
          {logsError ? (
            <span className="text-red-400/70 not-italic">{logsError}</span>
          ) : buildInfo?.building ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin inline" />
              Waiting for build output…
            </span>
          ) : buildInfo === null ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin inline" />
              Fetching build information…
            </span>
          ) : (
            'No logs available for this build.'
          )}
        </span>
      );
    }

    if (filteredLines.length === 0) {
      return <span className="text-white/30 italic">No lines match the current filter.</span>;
    }

    const searchRegex = searchTerm
      ? new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
      : null;

    return filteredLines.map((line, i) => {
      const lower = line.toLowerCase();
      let lineClass = 'text-white/65';
      if (lower.includes('error') || lower.includes('fail') || lower.includes('fatal')) {
        lineClass = 'text-red-400/90';
      } else if (lower.includes('warn')) {
        lineClass = 'text-yellow-400/80';
      } else if (lower.includes('success') || lower.includes('done') || lower.includes('complete')) {
        lineClass = 'text-emerald-400/80';
      } else if (line.startsWith('[Pipeline]') || line.startsWith('+ ')) {
        lineClass = 'text-blue-400/70';
      }

      const display = line.startsWith('[Pipeline] ')
        ? line.slice('[Pipeline] '.length)
        : line;

      if (searchRegex) {
        const parts = display.split(searchRegex);
        return (
          <div key={i} className={lineClass}>
            {parts.map((part, j) =>
              part.toLowerCase() === searchTerm.toLowerCase() ? (
                <mark key={j} className="bg-yellow-400/40 text-yellow-100 rounded-sm px-0.5">
                  {part}
                </mark>
              ) : part
            )}
          </div>
        );
      }

      return <div key={i} className={lineClass}>{display}</div>;
    });
  };

  const hasActiveFilters = logLevel !== 'all' || !!searchTerm;

  return (
    <section className="rounded-[8px] border border-white/[0.06] bg-[#111216] overflow-hidden">
      {/* ── Header / toolbar ── */}
      <header className="border-b border-white/[0.06] px-5 py-3.5">
        <div className="flex items-center gap-2.5 flex-wrap">

          {/* Title + status */}
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] border border-white/[0.08] bg-[#0d0e11]" style={{ color: ACCENT }}>
            <Terminal className="h-3.5 w-3.5" />
          </span>
          <div className="flex items-center gap-2.5 min-w-0">
            <h3 className="text-[13px] font-semibold tracking-[-0.01em] text-white">
              {isResizeRun ? 'Operation Logs' : 'Build Logs'}
            </h3>
            {selectedRunLabel && (
              <span className={`${MONO} text-[11px] text-white/35`}>{selectedRunLabel}</span>
            )}
            {buildInfo?.building && (
              <StatusPill tone="amber">
                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                {isResizeRun ? 'Running' : 'Building'}
              </StatusPill>
            )}
            {lineCount > 0 && !buildInfo?.building && (
              <span className={`${MONO} text-[10px] text-white/25 tabular-nums`}>
                {lineCount.toLocaleString()} lines
              </span>
            )}
          </div>

          {/* Build dropdown */}
          {buildOptions.length > 0 && onSelectBuild && (
            <Select
              value={buildInfo?.number?.toString() ?? ''}
              onValueChange={(val) => onSelectBuild(Number(val))}
            >
              <SelectTrigger className={`${MONO} h-7 w-auto min-w-[180px] max-w-[260px] text-[11px] border-white/[0.08] bg-[#0d0e11] rounded-[5px] focus:ring-0 focus:ring-offset-0`}>
                <SelectValue placeholder="Select build…" />
              </SelectTrigger>
              <SelectContent className="bg-[#111216] border-white/[0.08] rounded-[6px]">
                {buildOptions.map((d) => (
                  <SelectItem
                    key={d.build_number}
                    value={d.build_number.toString()}
                    className={`${MONO} text-[11px] cursor-pointer`}
                  >
                    <span className="flex items-center gap-2.5">
                      <span className="text-white/80">{getRunLabel(d)}</span>
                      <StatusPill tone={statusTone(d.status)}>{formatBuildStatus(d.status)}</StatusPill>
                      <span
                        className={`${MONO} text-[10px] text-white/25`}
                        title={new Date(d.started_at).toLocaleString()}
                      >
                        {formatRelative(d.started_at)}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <div className="flex-1" />

          {/* Actions */}
          <div className="flex items-center gap-1.5">
            <IconBtn
              onClick={() => setWordWrap((w) => !w)}
              active={wordWrap}
              title={wordWrap ? 'Disable word wrap' : 'Enable word wrap'}
            >
              <WrapText className="w-3.5 h-3.5" />
            </IconBtn>

            <IconBtn
              onClick={() => setShowFilters((f) => !f)}
              active={showFilters || hasActiveFilters}
              title="Filter logs"
            >
              <Filter className="w-3.5 h-3.5" />
              {hasActiveFilters && <span className="text-[10px]">•</span>}
            </IconBtn>

            {buildInfo && (
              <IconBtn
                onClick={handleRefresh}
                disabled={initialLoading}
                title="Refresh logs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${initialLoading ? 'animate-spin' : ''}`} />
              </IconBtn>
            )}

            <IconBtn
              onClick={copyLogs}
              disabled={!hasContent || initialLoading}
              title="Copy logs"
            >
              {copied
                ? <Check className="w-3.5 h-3.5 text-emerald-400" />
                : <Copy className="w-3.5 h-3.5" />}
            </IconBtn>

            <IconBtn
              onClick={downloadLogs}
              disabled={!hasContent || initialLoading}
              title="Download logs"
            >
              <Download className="w-3.5 h-3.5" />
            </IconBtn>
          </div>
        </div>

        {/* Resize notice */}
        {isResizeRun && (
          <p className={`${MONO} mt-2.5 text-[11px] text-white/45 border-t border-white/[0.06] pt-2.5`} style={{ color: ACCENT, opacity: 0.7 }}>
            Resize runs reuse the serving image — these logs show the resize operation, not a new build.
          </p>
        )}

        {/* ── Filter bar ── */}
        {showFilters && (
          <div className="mt-3 pt-3 border-t border-white/[0.06] flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[180px] max-w-[360px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-white/35" />
              <Input
                placeholder="Search logs…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`${MONO} pl-7 pr-7 h-7 bg-[#0d0e11] border-white/[0.08] text-[11px] rounded-[5px]`}
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/35 hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1">
              {(['all', 'error', 'warn', 'success'] as const).map((level) => {
                const levelTone: Tone =
                  level === 'error' ? 'red'
                  : level === 'warn' ? 'amber'
                  : level === 'success' ? 'green'
                  : 'blue';
                const t = TONE[levelTone];
                const isActive = logLevel === level;
                return (
                  <button
                    key={level}
                    onClick={() => setLogLevel(level)}
                    className={`${MONO} inline-flex h-7 items-center rounded-[5px] border px-2.5 text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors ${
                      isActive
                        ? ''
                        : 'border-white/[0.08] bg-[#0d0e11] text-white/40 hover:text-white/70'
                    }`}
                    style={isActive ? { color: t.color, background: t.bg, borderColor: t.border } : undefined}
                  >
                    {level === 'all' ? 'All' : level === 'error' ? 'Errors' : level === 'warn' ? 'Warnings' : 'Success'}
                  </button>
                );
              })}
            </div>

            {searchTerm && (
              <span className={`${MONO} text-[10px] text-white/35 tabular-nums uppercase tracking-[0.1em]`}>
                {matchCount} {matchCount === 1 ? 'match' : 'matches'}
              </span>
            )}

            {hasActiveFilters && (
              <button
                onClick={() => { setSearchTerm(''); setLogLevel('all'); }}
                className={`${MONO} inline-flex h-7 items-center rounded-[5px] px-2 text-[10px] uppercase tracking-[0.1em] text-white/40 hover:text-white`}
              >
                Clear
              </button>
            )}
          </div>
        )}
      </header>

      {/* ── Log area (terminal surface — kept dark) ── */}
      <div className="p-0">
        <div className="relative bg-[#0a0b0d] font-mono text-xs h-[620px]">
          {initialLoading ? (
            <div className="h-full p-4 space-y-2 overflow-hidden">
              {Array.from({ length: 28 }).map((_, i) => (
                <div
                  key={i}
                  className="h-3 rounded-[4px] bg-white/[0.05] animate-pulse"
                  style={{ width: `${38 + ((i * 41) % 52)}%` }}
                />
              ))}
            </div>
          ) : (
            <pre
              ref={preRef}
              onScroll={handleScroll}
              className={`h-full overflow-auto p-4 leading-relaxed
                ${wordWrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'}
                [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:h-1.5
                [&::-webkit-scrollbar-track]:bg-transparent
                [&::-webkit-scrollbar-thumb]:bg-white/[0.08]
                hover:[&::-webkit-scrollbar-thumb]:bg-white/[0.18]`}
            >
              {renderLines()}
            </pre>
          )}

          {/* Jump pills */}
          {(showJumpTopButton || showJumpButton) && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 pointer-events-none">
              {showJumpTopButton && (
                <button
                  onClick={jumpToTop}
                  className={`${MONO} pointer-events-auto flex items-center gap-1.5
                    bg-black/70 hover:bg-black/90 border border-white/[0.12] backdrop-blur-sm
                    text-white/60 hover:text-white text-[10px] uppercase tracking-[0.1em] px-3 py-1 rounded-full transition-colors`}
                >
                  <ArrowUp className="w-3 h-3" /> Top
                </button>
              )}
              {showJumpButton && (
                <button
                  onClick={jumpToBottom}
                  className={`${MONO} pointer-events-auto flex items-center gap-1.5
                    bg-black/70 hover:bg-black/90 border border-white/[0.12] backdrop-blur-sm
                    text-white/60 hover:text-white text-[10px] uppercase tracking-[0.1em] px-3 py-1 rounded-full transition-colors`}
                >
                  <ArrowDown className="w-3 h-3" /> Latest
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
