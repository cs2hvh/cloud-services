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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { BuildInfo } from '@/components/dashboard/apps/types';

interface BuildLogsPanelProps {
  buildInfo: BuildInfo | null;
  buildLogs: string;
  appName: string;
  fetchBuildLogs: (appName: string, buildNumber: number) => void;
}

export function BuildLogsPanel({
  buildInfo,
  buildLogs,
  appName,
  fetchBuildLogs
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
    <Card className="bg-white/5 border-white/10">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Terminal className="w-5 h-5" />
            Build Logs
            {buildInfo && <span className="text-white/50">#{buildInfo.number}</span>}
          </CardTitle>
          <div className="flex items-center gap-2">
            {/* Toggle Filters */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className={`border-white/20 h-8 ${showFilters ? 'bg-blue-500/20 text-blue-400' : ''}`}
            >
              <Filter className="w-4 h-4" />
            </Button>

            {/* Refresh */}
            {buildInfo && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => fetchBuildLogs(appName, buildInfo.number)}
                className="border-white/20 h-8"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            )}

            {/* Copy */}
            <Button
              size="sm"
              variant="outline"
              onClick={copyLogs}
              disabled={!filteredLogs}
              className="border-white/20 h-8"
            >
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </Button>

            {/* Download */}
            <Button
              size="sm"
              variant="outline"
              onClick={downloadLogs}
              disabled={!buildLogs}
              className="border-white/20 h-8"
            >
              <Download className="w-4 h-4" />
            </Button>

            {buildInfo?.building && (
              <Badge className="bg-blue-500/20 text-blue-400">
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                Building
              </Badge>
            )}
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