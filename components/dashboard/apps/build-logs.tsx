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
  appName: string;
  // raw: true = raw Jenkins log (used while building); false = deployment-filtered view.
  // append: true = incremental append; false = full replacement.
  // Returns Promise<boolean> (more data available) — callers may ignore the return value.
  fetchBuildLogs: (appName: string, buildNumber: number, raw?: boolean, append?: boolean) => Promise<boolean | void>;
  deployments?: DeploymentSummary[];
  onSelectBuild?: (buildNumber: number) => void;
}

export function BuildLogsPanel({
  buildInfo,
  buildLogs,
  initialLoading = false,
  appName,
  fetchBuildLogs,
  deployments = [],
  onSelectBuild,
}: BuildLogsPanelProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [copied, setCopied] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [logLevel, setLogLevel] = useState<'all' | 'error' | 'warn' | 'success'>('all');
  const [showJumpButton, setShowJumpButton] = useState(false);
  const [showJumpTopButton, setShowJumpTopButton] = useState(false);

  const formatBuildStatus = (status: string): string => {
    switch (status) {
      case 'SUCCESS':  return 'Succeeded';
      case 'FAILURE':  return 'Failed';
      case 'BUILDING': return 'In Progress';
      case 'ABORTED':  return 'Cancelled';
      case 'UNSTABLE': return 'Unstable';
      default:         return status;
    }
  };

  const getRunLabel = useCallback((deployment: Pick<DeploymentSummary, 'build_number' | 'trigger'>) => {
    if (deployment.trigger === 'resize') {
      return `Resize #${deployment.build_number}`;
    }
    return `Build #${deployment.build_number}`;
  }, []);

  // Ref on the <pre> element for imperative scroll control
  const preRef = useRef<HTMLPreElement>(null);
  // True while user is at (or near) the bottom — drives auto-scroll on new content
  const wasAtBottomRef = useRef(true);

  // Build dropdown options — the active build entry now comes from Supabase
  // (created at build start with status='building'). The only synthetic entry
  // needed is when buildInfo is set but Supabase hasn't delivered the row yet
  // (fresh page load or brief race window).
  const buildOptions = useMemo<DeploymentSummary[]>(() => {
    // Jenkins is the authoritative source for build state. Two race windows exist:
    //
    // A) Jenkins says done  → Supabase still shows BUILDING (normal completion lag).
    //    Override to the terminal status Jenkins reported.
    //    Exception: result=null during the post-build health-check phase — keep BUILDING
    //    to avoid a false FAILURE flash before Supabase finalizes.
    //
    // B) Jenkins says active → Supabase shows a stale terminal status (e.g. FAILURE
    //    from the previous run, or a webhook that fired before the new build row was
    //    written). Override to BUILDING so the dropdown reflects reality.
    const opts = deployments.map((d) => {
      if (d.build_number !== buildInfo?.number) return d;

      // Case A: Jenkins done, Supabase still BUILDING
      if (buildInfo.building === false && d.status === 'BUILDING') {
        if (buildInfo.result === null) return d; // health-check window — keep BUILDING
        const RESULT_TO_STATUS: Record<string, DeploymentSummary['status']> = {
          SUCCESS: 'SUCCESS',
          ABORTED: 'ABORTED',
          UNSTABLE: 'UNSTABLE',
        };
        const terminalStatus = RESULT_TO_STATUS[buildInfo.result] ?? 'FAILURE';
        return { ...d, status: terminalStatus };
      }

      // Case B: Jenkins active, Supabase shows stale terminal status
      if (buildInfo.building === true && d.status !== 'BUILDING') {
        return { ...d, status: 'BUILDING' as DeploymentSummary['status'] };
      }

      return d;
    });

    // Ensure the currently-loaded build is always visible in the dropdown
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
    () =>
      buildInfo?.number != null
        ? buildOptions.find((deployment) => deployment.build_number === buildInfo.number) ?? null
        : null,
    [buildInfo?.number, buildOptions]
  );
  const selectedRunLabel = selectedDeployment ? getRunLabel(selectedDeployment) : null;
  const isResizeRun = selectedDeployment?.trigger === 'resize';

  // Track whether user is near the bottom
  const handleScroll = useCallback(() => {
    const el = preRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    wasAtBottomRef.current = atBottom;
    setShowJumpButton(!atBottom && buildLogs.length > 0);
    setShowJumpTopButton(el.scrollTop > 80 && buildLogs.length > 0);
  }, [buildLogs.length]);

  // After every log update: scroll to bottom only if the user was already there
  useEffect(() => {
    if (wasAtBottomRef.current && preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight;
    }
  }, [buildLogs]);

  const jumpToBottom = () => {
    if (preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight;
      wasAtBottomRef.current = true;
      setShowJumpButton(false);
    }
  };

  const jumpToTop = () => {
    if (preRef.current) {
      preRef.current.scrollTop = 0;
      wasAtBottomRef.current = false;
      setShowJumpTopButton(false);
    }
  };

  // Filter and search logs
  const filteredLogs = useMemo(() => {
    if (!buildLogs || buildLogs === 'No logs available') return '';
    
    let lines = buildLogs.split('\n');
    
    // Filter by log level
    if (logLevel !== 'all') {
      lines = lines.filter(line => {
        const lower = line.toLowerCase();
        if (logLevel === 'error') {
          return lower.includes('error') || lower.includes('fail') || lower.includes('fatal');
        }
        if (logLevel === 'warn') {
          return lower.includes('warn') || lower.includes('warning');
        }
        if (logLevel === 'success') {
          return lower.includes('success') || lower.includes('done') || lower.includes('complete');
        }
        return true;
      });
    }
    
    // Filter by search term
    if (searchTerm) {
      lines = lines.filter(line => 
        line.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    return lines.join('\n');
  }, [buildLogs, searchTerm, logLevel]);

  // Count matches
  const matchCount = useMemo(() => {
    if (!searchTerm || !buildLogs) return 0;
    const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    return (buildLogs.match(regex) || []).length;
  }, [buildLogs, searchTerm]);

  const copyLogs = () => {
    navigator.clipboard.writeText(filteredLogs);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadLogs = () => {
    const blob = new Blob([buildLogs], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${appName}-build-${buildInfo?.number || 'latest'}-logs.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Render actual log content (skeleton handled separately as absolute overlay)
  const renderLogContent = () => {
    if (!filteredLogs) {
      return (
        <div className="flex items-center gap-2 text-white/30 italic">
          {buildInfo?.building ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" />Waiting for build output…</>
          ) : (
            'No logs available'
          )}
        </div>
      );
    }

    const lines = filteredLogs.split('\n');
    return lines.map((line, i) => {
      // Determine line color
      let lineClass = 'text-white/70';
      const lower = line.toLowerCase();
      if (lower.includes('error') || lower.includes('fail') || lower.includes('fatal')) {
        lineClass = 'text-red-400';
      } else if (lower.includes('warn')) {
        lineClass = 'text-yellow-400';
      } else if (lower.includes('success') || lower.includes('done') || lower.includes('complete')) {
        lineClass = 'text-green-400';
      } else if (line.startsWith('[Pipeline]') || line.startsWith('+ ')) {
        lineClass = 'text-blue-400';
      }

      // Strip internal build system markers from displayed text
      const displayLine = line.startsWith('[Pipeline] ')
        ? line.slice('[Pipeline] '.length)
        : line;

      // Highlight search matches
      if (searchTerm) {
        const parts = displayLine.split(new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
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

      return <div key={i} className={lineClass}>{displayLine}</div>;
    });
  };

  return (
    <Card className="bg-white/5 border-white/10 rounded-none">
      <CardHeader className="border-b border-white/[0.06] py-3 px-4">
        {/* Single toolbar row */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Title */}
          <div className="flex items-center gap-2 mr-1">
            <Terminal className="w-4 h-4 text-white/60" />
            <span className="text-sm font-semibold text-white">
              {isResizeRun ? 'Operation Logs' : 'Build Logs'}
            </span>
            {selectedRunLabel && (
              <span className="font-mono text-xs text-white/40">{selectedRunLabel}</span>
            )}
            {buildInfo?.building && (
              <Badge className="bg-blue-500/10 border border-blue-500/30 text-blue-400 text-[10px] px-1.5 py-0">
                <Loader2 className="w-2.5 h-2.5 mr-1 animate-spin" />
                {isResizeRun ? 'Running' : 'Building'}
              </Badge>
            )}
          </div>

          {/* Build selector — also shows active in-progress build via buildOptions synthetic entry */}
          {buildOptions.length > 0 && onSelectBuild && (
            <Select
              value={buildInfo?.number?.toString() ?? ''}
              onValueChange={(val) => onSelectBuild(Number(val))}
            >
              <SelectTrigger className="h-7 w-auto min-w-[200px] max-w-[280px] text-xs border-white/[0.12] bg-white/[0.03] rounded-none focus:ring-0 focus:ring-offset-0">
                <SelectValue placeholder="Select run…" />
              </SelectTrigger>
              <SelectContent className="bg-[#0f0f0f] border-white/[0.1] rounded-none">
                {buildOptions.map((d) => (
                  <SelectItem
                    key={d.build_number}
                    value={d.build_number.toString()}
                    className="text-xs font-mono cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-white/80">{getRunLabel(d)}</span>
                      <span
                        className={`text-[10px] font-sans ${
                          d.status === 'SUCCESS'
                            ? 'text-green-400'
                            : d.status === 'BUILDING'
                            ? 'text-blue-400'
                            : d.status === 'ABORTED'
                            ? 'text-orange-400'
                            : d.status === 'UNSTABLE'
                            ? 'text-yellow-400'
                            : 'text-red-400'
                        }`}
                      >
                        {d.status === 'BUILDING' ? '⟳' : '●'} {formatBuildStatus(d.status)}
                      </span>
                      <span className="text-white/30 font-sans">
                        {new Date(d.started_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </span>
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
            >
              <Filter className="w-3.5 h-3.5" />
            </Button>

            {buildInfo && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => fetchBuildLogs(appName, buildInfo.number)}
                disabled={initialLoading}
                className="h-7 px-2 rounded-none border-white/[0.12] bg-white/[0.03] text-white/60 hover:text-white"
                title="Refresh logs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${initialLoading ? 'animate-spin' : ''}`} />
              </Button>
            )}

            <Button
              size="sm"
              variant="outline"
              onClick={copyLogs}
              disabled={!filteredLogs || initialLoading}
              className="h-7 px-2 rounded-none border-white/[0.12] bg-white/[0.03] text-white/60 hover:text-white"
              title="Copy logs"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={downloadLogs}
              disabled={!buildLogs || initialLoading}
              className="h-7 px-2 rounded-none border-white/[0.12] bg-white/[0.03] text-white/60 hover:text-white"
              title="Download logs"
            >
              <Download className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {isResizeRun && (
          <div className="mt-3 border-t border-white/[0.06] pt-3 text-xs text-blue-200/80">
            Resize runs reuse the currently serving release image. These logs show the resize operation, not a new application build.
          </div>
        )}

        {/* Expandable Filter Bar */}
        {showFilters && (
          <div className="mt-3 pt-3 border-t border-white/[0.06] flex items-center gap-3 flex-wrap">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px] max-w-[400px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40" />
              <Input
                placeholder="Search build logs…"
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

            {/* Log Level Filter */}
            <div className="flex items-center gap-1">
              {(['all', 'error', 'warn', 'success'] as const).map((level) => (
                <Button
                  key={level}
                  size="sm"
                  variant="outline"
                  onClick={() => setLogLevel(level)}
                  className={`h-7 text-xs rounded-none border-white/[0.12] ${
                    logLevel === level
                      ? level === 'error'
                        ? 'bg-red-500/20 text-red-400 border-red-500/20'
                        : level === 'warn'
                        ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/20'
                        : level === 'success'
                        ? 'bg-green-500/20 text-green-400 border-green-500/20'
                        : 'bg-white/10 text-white'
                      : 'bg-white/[0.03] text-white/50'
                  }`}
                >
                  {level === 'all' ? 'All' : level === 'error' ? 'Errors' : level === 'warn' ? 'Warnings' : 'Success'}
                </Button>
              ))}
            </div>

            {/* Match Count */}
            {searchTerm && (
              <Badge variant="outline" className="text-xs">
                {matchCount} match{matchCount !== 1 ? 'es' : ''}
              </Badge>
            )}

            {/* Clear Filters */}
            {(searchTerm || logLevel !== 'all') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchTerm('');
                  setLogLevel('all');
                }}
                className="h-7 text-xs text-white/50 hover:text-white"
              >
                Clear
              </Button>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="p-0">
        <div className="relative bg-[#0c0c0c] border-t border-white/[0.05] font-mono text-xs h-[600px]">
          {initialLoading ? (
            <div className="h-full p-4 space-y-2 overflow-hidden">
              {Array.from({ length: 30 }).map((_, i) => (
                <div
                  key={i}
                  className="h-3 rounded bg-white/[0.06] animate-pulse"
                  style={{ width: `${38 + ((i * 41) % 52)}%` }}
                />
              ))}
            </div>
          ) : (
            <pre
              ref={preRef}
              onScroll={handleScroll}
              className="h-full overflow-auto p-4 whitespace-pre
                [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:h-1.5
                [&::-webkit-scrollbar-track]:bg-transparent
                [&::-webkit-scrollbar-thumb]:bg-white/10
                hover:[&::-webkit-scrollbar-thumb]:bg-white/20"
            >
              {renderLogContent()}
            </pre>
          )}

          {/* Jump pills — top and bottom */}
          {(showJumpTopButton || showJumpButton) && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
              {showJumpTopButton && (
                <button
                  onClick={jumpToTop}
                  className="flex items-center gap-1.5
                    bg-white/10 hover:bg-white/15 border border-white/[0.15] backdrop-blur
                    text-white/70 hover:text-white text-[11px] px-3 py-1 rounded-full transition-colors"
                >
                  <ArrowUp className="w-3 h-3" />
                  Jump to top
                </button>
              )}
              {showJumpButton && (
                <button
                  onClick={jumpToBottom}
                  className="flex items-center gap-1.5
                    bg-white/10 hover:bg-white/15 border border-white/[0.15] backdrop-blur
                    text-white/70 hover:text-white text-[11px] px-3 py-1 rounded-full transition-colors"
                >
                  <ArrowDown className="w-3 h-3" />
                  Jump to latest
                </button>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
