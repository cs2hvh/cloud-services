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
import { BuildInfo } from '@/components/dashboard/apps/types';

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

function statusTextColor(status: string): string {
  switch (status) {
    case 'SUCCESS':  return 'text-emerald-400';
    case 'FAILURE':  return 'text-red-400';
    case 'BUILDING': return 'text-blue-400';
    case 'ABORTED':  return 'text-white/35';
    default:         return 'text-yellow-400';
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
    navigator.clipboard.writeText(filteredLogs || buildLogs);
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
    <Card className="bg-white/5 border-white/[0.08] rounded-none">
      <CardHeader className="border-b border-white/[0.06] py-3 px-4">

        {/* ── Toolbar ── */}
        <div className="flex items-center gap-3 flex-wrap">

          {/* Title + status */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <Terminal className="w-4 h-4 text-white/50" />
            <span className="text-sm font-semibold text-white/90">
              {isResizeRun ? 'Operation Logs' : 'Build Logs'}
            </span>
            {selectedRunLabel && (
              <span className="font-mono text-xs text-white/35">{selectedRunLabel}</span>
            )}
            {buildInfo?.building && (
              <Badge className="bg-blue-500/12 border border-blue-500/25 text-blue-400 text-[10px] px-1.5 py-0">
                <Loader2 className="w-2.5 h-2.5 mr-1 animate-spin" />
                {isResizeRun ? 'Running' : 'Building'}
              </Badge>
            )}
            {lineCount > 0 && !buildInfo?.building && (
              <span className="text-[10px] text-white/25 tabular-nums">
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
              <SelectTrigger className="h-7 w-auto min-w-[180px] max-w-[260px] text-xs border-white/[0.10] bg-white/[0.03] rounded-none focus:ring-0 focus:ring-offset-0">
                <SelectValue placeholder="Select build…" />
              </SelectTrigger>
              <SelectContent className="bg-[#111111] border-white/[0.10] rounded-none">
                {buildOptions.map((d) => (
                  <SelectItem
                    key={d.build_number}
                    value={d.build_number.toString()}
                    className="text-xs font-mono cursor-pointer"
                  >
                    <span className="flex items-center gap-2.5">
                      <span className="text-white/80">{getRunLabel(d)}</span>
                      <span className={`text-[10px] font-sans ${statusTextColor(d.status)}`}>
                        {d.status === 'BUILDING' && (
                          <span className="mr-0.5 inline-block w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse align-middle" />
                        )}
                        {formatBuildStatus(d.status)}
                      </span>
                      <span
                        className="text-[10px] text-white/25 font-sans"
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
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setWordWrap((w) => !w)}
              title={wordWrap ? 'Disable word wrap' : 'Enable word wrap'}
              className={`h-7 px-2 rounded-none border-white/[0.10] ${
                wordWrap
                  ? 'bg-blue-500/15 border-blue-500/25 text-blue-400'
                  : 'bg-white/[0.03] text-white/50 hover:text-white'
              }`}
            >
              <WrapText className="w-3.5 h-3.5" />
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowFilters((f) => !f)}
              title="Filter logs"
              className={`h-7 px-2 rounded-none border-white/[0.10] ${
                showFilters || hasActiveFilters
                  ? 'bg-blue-500/15 border-blue-500/25 text-blue-400'
                  : 'bg-white/[0.03] text-white/50 hover:text-white'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              {hasActiveFilters && (
                <span className="ml-1 text-[10px]">•</span>
              )}
            </Button>

            {buildInfo && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleRefresh}
                disabled={initialLoading}
                title="Refresh logs"
                className="h-7 px-2 rounded-none border-white/[0.10] bg-white/[0.03] text-white/50 hover:text-white"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${initialLoading ? 'animate-spin' : ''}`} />
              </Button>
            )}

            <Button
              size="sm"
              variant="outline"
              onClick={copyLogs}
              disabled={!hasContent || initialLoading}
              title="Copy logs"
              className="h-7 px-2 rounded-none border-white/[0.10] bg-white/[0.03] text-white/50 hover:text-white"
            >
              {copied
                ? <Check className="w-3.5 h-3.5 text-emerald-400" />
                : <Copy className="w-3.5 h-3.5" />}
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={downloadLogs}
              disabled={!hasContent || initialLoading}
              title="Download logs"
              className="h-7 px-2 rounded-none border-white/[0.10] bg-white/[0.03] text-white/50 hover:text-white"
            >
              <Download className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Resize notice */}
        {isResizeRun && (
          <p className="mt-2 text-[11px] text-blue-300/60 border-t border-white/[0.05] pt-2">
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
                className="pl-7 pr-7 h-7 bg-black/30 border-white/[0.10] text-xs rounded-none"
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
              {(['all', 'error', 'warn', 'success'] as const).map((level) => (
                <Button
                  key={level}
                  size="sm"
                  variant="outline"
                  onClick={() => setLogLevel(level)}
                  className={`h-7 text-xs rounded-none border-white/[0.10] ${
                    logLevel === level
                      ? level === 'error'   ? 'bg-red-500/15 text-red-400 border-red-500/20'
                      : level === 'warn'    ? 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20'
                      : level === 'success' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
                      : 'bg-white/10 text-white'
                      : 'bg-white/[0.02] text-white/40 hover:text-white/70'
                  }`}
                >
                  {level === 'all' ? 'All' : level === 'error' ? 'Errors' : level === 'warn' ? 'Warnings' : 'Success'}
                </Button>
              ))}
            </div>

            {searchTerm && (
              <span className="text-[11px] text-white/35 tabular-nums">
                {matchCount} {matchCount === 1 ? 'match' : 'matches'}
              </span>
            )}

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setSearchTerm(''); setLogLevel('all'); }}
                className="h-7 text-[11px] text-white/40 hover:text-white px-2"
              >
                Clear
              </Button>
            )}
          </div>
        )}
      </CardHeader>

      {/* ── Log area ── */}
      <CardContent className="p-0">
        <div className="relative bg-[#0b0b0b] border-t border-white/[0.04] font-mono text-xs h-[620px]">
          {initialLoading ? (
            <div className="h-full p-4 space-y-2 overflow-hidden">
              {Array.from({ length: 28 }).map((_, i) => (
                <div
                  key={i}
                  className="h-3 rounded-sm bg-white/[0.05] animate-pulse"
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
                  className="pointer-events-auto flex items-center gap-1.5
                    bg-black/70 hover:bg-black/90 border border-white/[0.12] backdrop-blur-sm
                    text-white/60 hover:text-white text-[11px] px-3 py-1 rounded-full transition-colors"
                >
                  <ArrowUp className="w-3 h-3" /> Top
                </button>
              )}
              {showJumpButton && (
                <button
                  onClick={jumpToBottom}
                  className="pointer-events-auto flex items-center gap-1.5
                    bg-black/70 hover:bg-black/90 border border-white/[0.12] backdrop-blur-sm
                    text-white/60 hover:text-white text-[11px] px-3 py-1 rounded-full transition-colors"
                >
                  <ArrowDown className="w-3 h-3" /> Latest
                </button>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
