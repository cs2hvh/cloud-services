'use client';

import { useState, useMemo } from 'react';
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
}

interface BuildLogsPanelProps {
  buildInfo: BuildInfo | null;
  buildLogs: string;
  logsLoading?: boolean;
  appName: string;
  fetchBuildLogs: (appName: string, buildNumber: number) => void;
  deployments?: DeploymentSummary[];
  onSelectBuild?: (buildNumber: number) => void;
}

export function BuildLogsPanel({
  buildInfo,
  buildLogs,
  logsLoading = false,
  appName,
  fetchBuildLogs,
  deployments = [],
  onSelectBuild,
}: BuildLogsPanelProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [copied, setCopied] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [logLevel, setLogLevel] = useState<'all' | 'error' | 'warn'>('all');

  // Filter and search logs
  const filteredLogs = useMemo(() => {
    if (!buildLogs) return '';
    
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
    const regex = new RegExp(searchTerm, 'gi');
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

  // Render log content with highlighting
  const renderLogContent = () => {
    if (logsLoading) {
      return (
        <div className="space-y-2 py-2">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="h-3 rounded bg-white/[0.06] animate-pulse"
              style={{ width: `${40 + ((i * 37) % 55)}%` }}
            />
          ))}
        </div>
      );
    }

    if (!filteredLogs) {
      return (
        <div className="flex items-center gap-2 text-white/30 italic">
          <Loader2 className="w-4 h-4 animate-spin" />
          Waiting for logs...
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
              Build Logs
            </span>
            {buildInfo?.number != null && (
              <span className="font-mono text-xs text-white/40">#{buildInfo.number}</span>
            )}
            {buildInfo?.building && (
              <Badge className="bg-blue-500/10 border border-blue-500/30 text-blue-400 text-[10px] px-1.5 py-0">
                <Loader2 className="w-2.5 h-2.5 mr-1 animate-spin" />
                Building
              </Badge>
            )}
          </div>

          {/* Build selector */}
          {deployments.length > 0 && onSelectBuild && (
            <Select
              value={buildInfo?.number?.toString() ?? ''}
              onValueChange={(val) => onSelectBuild(Number(val))}
            >
              <SelectTrigger className="h-7 w-auto min-w-[180px] max-w-[260px] text-xs border-white/[0.12] bg-white/[0.03] rounded-none focus:ring-0 focus:ring-offset-0">
                <SelectValue placeholder="Select build" />
              </SelectTrigger>
              <SelectContent className="bg-[#0f0f0f] border-white/[0.1] rounded-none">
                {deployments.map((d) => (
                  <SelectItem
                    key={d.build_number}
                    value={d.build_number.toString()}
                    className="text-xs font-mono cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-white/80">#{d.build_number}</span>
                      <span
                        className={`text-[10px] font-sans ${
                          d.status === 'SUCCESS' ? 'text-green-400' : 'text-red-400'
                        }`}
                      >
                        ● {d.status}
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
                disabled={logsLoading}
                className="h-7 px-2 rounded-none border-white/[0.12] bg-white/[0.03] text-white/60 hover:text-white"
                title="Refresh logs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${logsLoading ? 'animate-spin' : ''}`} />
              </Button>
            )}

            <Button
              size="sm"
              variant="outline"
              onClick={copyLogs}
              disabled={!filteredLogs || logsLoading}
              className="h-7 px-2 rounded-none border-white/[0.12] bg-white/[0.03] text-white/60 hover:text-white"
              title="Copy logs"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={downloadLogs}
              disabled={!buildLogs || logsLoading}
              className="h-7 px-2 rounded-none border-white/[0.12] bg-white/[0.03] text-white/60 hover:text-white"
              title="Download logs"
            >
              <Download className="w-3.5 h-3.5" />
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
                placeholder="Search build logs..."
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
            <div className="flex items-center gap-1">
              {(['all', 'error', 'warn'] as const).map((level) => (
                <Button
                  key={level}
                  size="sm"
                  variant="outline"
                  onClick={() => setLogLevel(level)}
                  className={`h-7 text-xs border-white/20 ${
                    logLevel === level
                      ? level === 'error'
                        ? 'bg-red-500/20 text-red-400'
                        : level === 'warn'
                        ? 'bg-yellow-500/20 text-yellow-400'
                        : 'bg-white/10 text-white'
                      : ''
                  }`}
                >
                  {level === 'all' ? 'All' : level === 'error' ? 'Errors' : 'Warnings'}
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
        <div className="bg-[#0c0c0c] rounded-b-lg border-t border-white/5 font-mono text-xs">
          <pre className="p-4 overflow-auto max-h-[600px] whitespace-pre [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-white/20">
            {renderLogContent()}
          </pre>
        </div>
      </CardContent>
    </Card>
  );
}