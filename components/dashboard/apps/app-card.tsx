'use client';

import { motion } from 'motion/react';
import {
  Globe,
  ExternalLink,
  Loader2,
  CheckCircle2,
  XCircle,
  Trash2,
  Terminal,
  GitBranch,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { App, BuildInfo } from './types';

interface AppCardProps {
  app: App;
  build?: BuildInfo;
  logs?: string;
  isExpanded: boolean;
  onToggleLogs: () => void;
  onDelete: () => void;
  onFetchLogs: (buildNumber: number) => void;
}

function getStatusBadge(status: string, build?: BuildInfo) {
  if (build?.building) {
    return (
      <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-[10px] px-1.5 py-0">
        <Loader2 className="w-2.5 h-2.5 mr-1 animate-spin" />
        Building
      </Badge>
    );
  }

  switch (status) {
    case 'running':
      return (
        <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px] px-1.5 py-0">
          <CheckCircle2 className="w-2.5 h-2.5 mr-1" />
          Running
        </Badge>
      );
    case 'failed':
      return (
        <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px] px-1.5 py-0">
          <XCircle className="w-2.5 h-2.5 mr-1" />
          Failed
        </Badge>
      );
    case 'building':
      return (
        <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-[10px] px-1.5 py-0">
          <Loader2 className="w-2.5 h-2.5 mr-1 animate-spin" />
          Building
        </Badge>
      );
    case 'deleting':
      return (
        <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px] px-1.5 py-0">
          <Loader2 className="w-2.5 h-2.5 mr-1 animate-spin" />
          Deleting
        </Badge>
      );
    default:
      return (
        <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px] px-1.5 py-0">
          Pending
        </Badge>
      );
  }
}

export function AppCard({
  app,
  build,
  logs,
  isExpanded,
  onToggleLogs,
  onDelete,
  onFetchLogs,
}: AppCardProps) {
  const domain = app.deployment_url
    ? new URL(app.deployment_url).hostname
    : `${app.slug}.galaxyhvh.com`;
  const isAppDeleting = app.status === 'deleting';

  const handleToggleLogs = () => {
    if (!isExpanded && build) {
      onFetchLogs(build.number);
    }
    onToggleLogs();
  };

  return (
    <div
      className={`rounded-lg border transition-all duration-200 ${
        isAppDeleting
          ? 'bg-yellow-500/5 border-yellow-500/20 opacity-70'
          : 'bg-black/30 border-white/5 hover:border-white/10 hover:bg-black/40'
      }`}
    >
      <div className="p-4">
        {/* Main Row */}
        <div className="flex items-center justify-between">
          {/* Left: App Info */}
          <div className="flex items-center gap-4 flex-1 min-w-0">
            {/* Status Indicator */}
            <div
              className={`w-2 h-2 rounded-full flex-shrink-0 ${
                isAppDeleting
                  ? 'bg-yellow-400 animate-pulse'
                  : app.status === 'running'
                    ? 'bg-green-400'
                    : app.status === 'failed'
                      ? 'bg-red-400'
                      : app.status === 'building'
                        ? 'bg-blue-400 animate-pulse'
                        : 'bg-yellow-400'
              }`}
            />

            {/* App Name & URL */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-sm font-semibold text-white truncate">{app.name}</h3>
                {getStatusBadge(app.status, build)}
              </div>
              <a
                href={`https://${domain}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`text-xs flex items-center gap-1 transition-colors truncate ${
                  isAppDeleting
                    ? 'text-white/40 pointer-events-none'
                    : 'text-white/50 hover:text-blue-400'
                }`}
              >
                <Globe className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{domain}</span>
                <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
              </a>
            </div>
          </div>

          {/* Center: Build Info */}
          <div className="hidden md:flex items-center gap-6 px-4">
            <div className="text-center">
              <p className="text-xs text-white/40 mb-0.5">Port</p>
              <p className="text-sm text-white font-mono">{app.port}</p>
            </div>
            {build && (
              <div className="text-center">
                <p className="text-xs text-white/40 mb-0.5">Build</p>
                <p className="text-sm text-white font-mono flex items-center gap-1">
                  #{build.number}
                  {build.building ? (
                    <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
                  ) : build.result === 'SUCCESS' ? (
                    <CheckCircle2 className="w-3 h-3 text-green-400" />
                  ) : build.result === 'FAILURE' ? (
                    <XCircle className="w-3 h-3 text-red-400" />
                  ) : null}
                </p>
              </div>
            )}
            <div className="text-center">
              <p className="text-xs text-white/40 mb-0.5">Created</p>
              <p className="text-sm text-white/70">
                {new Date(app.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2 ml-4">
            <Button
              size="sm"
              variant="ghost"
              disabled={isAppDeleting}
              onClick={handleToggleLogs}
              className="h-8 px-2 text-white/60 hover:text-white hover:bg-white/10"
            >
              <Terminal className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={isAppDeleting}
              onClick={onDelete}
              className="h-8 px-2 text-red-400/60 hover:text-red-400 hover:bg-red-500/10"
            >
              {isAppDeleting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Mobile: Additional Info */}
        <div className="md:hidden mt-3 pt-3 border-t border-white/5 flex items-center gap-4 text-xs text-white/50">
          <span className="flex items-center gap-1">
            <GitBranch className="w-3 h-3" />
            Port {app.port}
          </span>
          {build && (
            <span className="flex items-center gap-1">
              Build #{build.number}
              {build.building ? (
                <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
              ) : build.result === 'SUCCESS' ? (
                <CheckCircle2 className="w-3 h-3 text-green-400" />
              ) : build.result === 'FAILURE' ? (
                <XCircle className="w-3 h-3 text-red-400" />
              ) : null}
            </span>
          )}
          <span>{new Date(app.created_at).toLocaleDateString()}</span>
        </div>
      </div>

      {/* Build Logs (Expandable) */}
      {isExpanded && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="border-t border-white/5"
        >
          <div className="p-4 bg-black/50">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-white/70 flex items-center">
                <Terminal className="w-3 h-3 mr-1.5" />
                Build Logs {build && `#${build.number}`}
              </h4>
              {build?.building && <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />}
            </div>
            <pre className="text-[11px] text-white/70 font-mono overflow-x-auto max-h-64 overflow-y-auto bg-black/30 rounded p-3 custom-scrollbar">
              {logs || 'Loading logs...'}
            </pre>
          </div>
        </motion.div>
      )}
    </div>
  );
}
