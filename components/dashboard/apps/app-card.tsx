'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import Link from 'next/link';
import {
  Globe,
  ExternalLink,
  Loader2,
  CheckCircle2,
  XCircle,
  Trash2,
  Terminal,
  GitBranch,
  Cpu,
  Box,
  RotateCcw,
  Activity,
  Clock,
  AlertTriangle,
  TrendingUp,
  HardDrive,
  Server,
  Network,
  Container,
  Shield,
  Layers,
  RefreshCw,
  Copy,
  Check,
  X,
  Eye,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { App, BuildInfo } from './types';
import { AppMetrics, AppHealth, useAppDetails } from '@/hooks/use-app-metrics';
import { getAppOperationLabel } from '@/lib/app-operations/core/presentation';
import { AppStatusBadge } from './app-status-badge';
import { BuildLogsPanel } from './build-logs';

interface AppCardProps {
  app: App;
  build?: BuildInfo;
  logs?: string;
  logsLoading?: boolean;
  logsError?: string;
  isExpanded: boolean;
  onToggleLogs: () => void;
  onDelete: () => void;
  onFetchLogs: (buildNumber: number) => void;
  metrics?: AppMetrics | null;
  health?: AppHealth | null;
  metricsLoading?: boolean;
  onRollback: () => void;
}

export function AppCard({
  app,
  build,
  logs,
  logsLoading,
  logsError,
  isExpanded,
  onToggleLogs,
  onDelete,
  onFetchLogs,
  metrics,
  health,
  metricsLoading,
  onRollback,
}: AppCardProps) {
  const domain = app.deployment_url
    ? new URL(app.deployment_url).hostname
    : `${app.slug}.galaxyhvh.com`;
  const isAppDeleting = app.status === 'deleting';
  const [activeTab, setActiveTab] = useState<'logs' | 'metrics'>('logs');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const prevBuildNumberRef = useRef<number | null | undefined>(undefined);

  // When the card is expanded and the active build number changes (new build started),
  // fetch a fresh set of logs so the panel doesn't show stale output.
  useEffect(() => {
    const prev = prevBuildNumberRef.current;
    prevBuildNumberRef.current = build?.number;
    if (isExpanded && activeTab === 'logs' && build?.number != null && prev !== undefined && prev !== build.number) {
      onFetchLogs(build.number);
    }
  }, [build?.number, isExpanded, activeTab, onFetchLogs]);
  
  // Fetch detailed info when metrics tab is active and expanded
  const { details, loading: detailsLoading, refetch: refetchDetails } = useAppDetails({
    appId: app.id,
    enabled: isExpanded && activeTab === 'metrics' && app.status === 'running',
  });

  const handleToggleLogs = () => {
    // Always try to fetch logs when expanding IF we have a build number
    if (!isExpanded) {
      if (build?.number) {
        onFetchLogs(build.number);
      } else {
        // If no build info yet, try build #1 (most apps will have at least one build)
        onFetchLogs(1);
      }
    }
    setActiveTab('logs');
    onToggleLogs();
  };

  const handleToggleMetrics = () => {
    setActiveTab('metrics');
    if (!isExpanded) {
      onToggleLogs();
    }
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const canRollback = !!app.can_rollback;
  const isAppBuilding = app.status === 'building';
  const hasActiveBuild = isAppBuilding || !!build?.building;
  const rollbackDisabled = isAppDeleting || hasActiveBuild || !canRollback;
  const deleteDisabled = isAppDeleting || hasActiveBuild;

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
                <Link 
                  href={`/dashboard/services/apps/${app.id}`}
                  className={`text-sm font-semibold text-white truncate hover:text-blue-400 transition-colors ${
                    isAppDeleting ? 'pointer-events-none' : ''
                  }`}
                >
                  {app.name}
                </Link>
                <AppStatusBadge status={app.status} building={build?.building} size="sm" />
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
            {(app.serving_build_number !== null && app.serving_build_number !== undefined) || build ? (
              <div className="text-center">
                <p className="text-xs text-white/40 mb-0.5">Serving</p>
                <p className="text-sm text-white font-mono flex items-center gap-1">
                  #{app.serving_build_number ?? build?.number}
                  {app.serving_build_number == null && build?.building ? (
                    <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
                  ) : app.serving_build_number == null && build?.result === 'SUCCESS' ? (
                    <CheckCircle2 className="w-3 h-3 text-green-400" />
                  ) : app.serving_build_number == null && build?.result === 'FAILURE' ? (
                    <XCircle className="w-3 h-3 text-red-400" />
                  ) : null}
                </p>
              </div>
            ) : null}
            {(app.last_operation_build_number !== null && app.last_operation_build_number !== undefined) || app.last_operation_trigger ? (
              <div className="text-center">
                <p className="text-xs text-white/40 mb-0.5">Last Op</p>
                <p className="text-xs text-white/70">
                  {getAppOperationLabel({
                    buildNumber: app.last_operation_build_number ?? null,
                    trigger: app.last_operation_trigger,
                    rollbackTargetBuildNumber:
                      app.last_operation_trigger === 'rollback'
                        ? app.last_operation_build_number ?? null
                        : null,
                  })}
                </p>
              </div>
            ) : null}
            {/* Quick Metrics Summary */}
            {app.status === 'running' && (
              <div 
                className="text-center cursor-pointer hover:bg-white/5 rounded px-2 py-1 transition-colors"
                onClick={handleToggleMetrics}
              >
                <p className="text-xs text-white/40 mb-0.5 flex items-center justify-center gap-1">
                  <Activity className="w-3 h-3" /> Metrics
                </p>
                {metricsLoading ? (
                  <Loader2 className="w-3 h-3 text-white/40 animate-spin mx-auto" />
                ) : health ? (
                  <p className="text-xs text-white/70 font-mono">
                    {health.pod_count} pod{health.pod_count !== 1 ? 's' : ''}
                    {health.restart_count > 0 && (
                      <span className="text-yellow-400 ml-1">⚠</span>
                    )}
                  </p>
                ) : (
                  <p className="text-xs text-white/40">View</p>
                )}
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
            <Link href={`/dashboard/services/apps/${app.id}`}>
              <Button
                size="sm"
                variant="ghost"
                disabled={isAppDeleting}
                className="h-8 px-2 text-white/60 hover:text-white hover:bg-white/10"
                title="View Details"
              >
                <Eye className="w-4 h-4" />
              </Button>
            </Link>
            <Button
              size="sm"
              variant="ghost"
              disabled={isAppDeleting}
              onClick={handleToggleLogs}
              className="h-8 px-2 text-white/60 hover:text-white hover:bg-white/10"
              title="Build Logs"
            >
              <Terminal className="w-4 h-4" />
            </Button>

            <Button
              size="sm"
              variant="ghost"
              disabled={rollbackDisabled}
              onClick={onRollback}
              className="cursor-pointer h-8 px-2 text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-50"
              title={
                canRollback
                  ? app.rollback_target_build_number
                    ? `Rollback release to Build #${app.rollback_target_build_number}; current size stays unchanged`
                    : 'Rollback to the previous successful release'
                  : 'No previous release available. Resize-only operations do not create rollback targets.'
              }
            >
              <RotateCcw className="w-4 h-4" />
            </Button>

            <Button
              size="sm"
              variant="ghost"
              disabled={deleteDisabled}
              onClick={onDelete}
              className="cursor-pointer h-8 px-2 text-red-400/60 hover:text-red-400 hover:bg-red-500/10"
              title="Delete App"
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
        <div className="md:hidden mt-3 pt-3 border-t border-white/5 flex flex-wrap items-center gap-3 text-xs text-white/50">
          <span className="flex items-center gap-1">
            <GitBranch className="w-3 h-3" />
            Port {app.port}
          </span>
          {(app.serving_build_number !== null && app.serving_build_number !== undefined) || build ? (
            <span className="flex items-center gap-1">
              Serving #{app.serving_build_number ?? build?.number}
              {app.serving_build_number == null && build?.building ? (
                <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
              ) : app.serving_build_number == null && build?.result === 'SUCCESS' ? (
                <CheckCircle2 className="w-3 h-3 text-green-400" />
              ) : app.serving_build_number == null && build?.result === 'FAILURE' ? (
                <XCircle className="w-3 h-3 text-red-400" />
              ) : null}
            </span>
          ) : null}
          {app.status === 'running' && (
            <button
              onClick={handleToggleMetrics}
              className="flex items-center gap-1 text-blue-400 hover:text-blue-300"
            >
              <Activity className="w-3 h-3" />
              Metrics
            </button>
          )}
          <span>{new Date(app.created_at).toLocaleDateString()}</span>
        </div>
      </div>

      {/* Expandable Section with Tabs */}
      {isExpanded && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="border-t border-white/5"
        >
          {/* Tab Headers */}
          <div className="flex items-center border-b border-white/5 bg-black/30">
            <button
              onClick={() => setActiveTab('logs')}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors ${
                activeTab === 'logs'
                  ? 'text-white border-b-2 border-blue-500 -mb-px'
                  : 'text-white/50 hover:text-white/70'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              Build Logs
            </button>
            <button
              onClick={() => setActiveTab('metrics')}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors ${
                activeTab === 'metrics'
                  ? 'text-white border-b-2 border-green-500 -mb-px'
                  : 'text-white/50 hover:text-white/70'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              Metrics
              {metricsLoading && <Loader2 className="w-3 h-3 animate-spin" />}
            </button>
            {/* Close button */}
            <button
              onClick={onToggleLogs}
              className="ml-auto mr-2 p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Tab Content */}
          <div className="p-4 bg-black/50">
            {activeTab === 'logs' ? (
              /* Build Logs Tab */
              <BuildLogsPanel
                buildInfo={build ?? null}
                buildLogs={logs ?? ''}
                initialLoading={!!logsLoading}
                appName={app.name}
                fetchBuildLogs={(_, buildNumber) => {
                  onFetchLogs(buildNumber);
                  return Promise.resolve(false as boolean);
                }}
              />
            ) : (
              /* Metrics Tab */
              <div>
                {(metricsLoading || detailsLoading) && !metrics && !details ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 text-white/40 animate-spin" />
                    <span className="ml-2 text-sm text-white/50">Loading metrics...</span>
                  </div>
                ) : !metrics && !health && !details ? (
                  <div className="text-center py-8">
                    <Activity className="w-8 h-8 text-white/20 mx-auto mb-2" />
                    <p className="text-sm text-white/50">No metrics available</p>
                    <p className="text-xs text-white/30 mt-1">Metrics will appear when the app is running</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Refresh Button */}
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => refetchDetails()}
                        disabled={detailsLoading}
                        className="h-7 px-2 text-white/50 hover:text-white hover:bg-white/10"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 mr-1 ${detailsLoading ? 'animate-spin' : ''}`} />
                        Refresh
                      </Button>
                    </div>

                    {/* Health Status */}
                    {health && (
                      <div className="bg-black/30 rounded-lg p-4">
                        <h5 className="text-xs font-semibold text-white/70 mb-3 flex items-center gap-1.5">
                          <Box className="w-3.5 h-3.5" />
                          Health Status
                        </h5>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="bg-black/20 rounded-lg p-3">
                            <p className="text-xs text-white/40 mb-1">Status</p>
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${
                                health.status === 'healthy' ? 'bg-green-400' :
                                health.status === 'degraded' ? 'bg-yellow-400' :
                                health.status === 'unhealthy' ? 'bg-red-400' : 'bg-gray-400'
                              }`} />
                              <span className={`text-sm font-medium capitalize ${
                                health.status === 'healthy' ? 'text-green-400' :
                                health.status === 'degraded' ? 'text-yellow-400' :
                                health.status === 'unhealthy' ? 'text-red-400' : 'text-white/50'
                              }`}>
                                {health.status}
                              </span>
                            </div>
                          </div>
                          <div className="bg-black/20 rounded-lg p-3">
                            <p className="text-xs text-white/40 mb-1 flex items-center gap-1">
                              <Box className="w-3 h-3" /> Pods
                            </p>
                            <p className="text-lg font-bold text-white">{health.pod_count}</p>
                          </div>
                          <div className="bg-black/20 rounded-lg p-3">
                            <p className="text-xs text-white/40 mb-1 flex items-center gap-1">
                              <RotateCcw className="w-3 h-3" /> Restarts
                            </p>
                            <p className={`text-lg font-bold ${
                              health.restart_count > 5 ? 'text-red-400' :
                              health.restart_count > 0 ? 'text-yellow-400' : 'text-green-400'
                            }`}>
                              {health.restart_count}
                            </p>
                          </div>
                          <div className="bg-black/20 rounded-lg p-3">
                            <p className="text-xs text-white/40 mb-1 flex items-center gap-1">
                              <Clock className="w-3 h-3" /> Uptime
                            </p>
                            <p className="text-sm font-medium text-white">
                              {details?.pod?.uptime || '-'}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Resource Usage */}
                    {metrics && (
                      <div className="bg-black/30 rounded-lg p-4">
                        <h5 className="text-xs font-semibold text-white/70 mb-3 flex items-center gap-1.5">
                          <TrendingUp className="w-3.5 h-3.5" />
                          Resource Usage
                        </h5>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* CPU Usage */}
                          <div className="bg-black/20 rounded-lg p-4">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs text-white/40 flex items-center gap-1">
                                <Cpu className="w-3.5 h-3.5" /> CPU Usage
                              </p>
                              <span className="text-sm font-mono text-white">
                                {(metrics.cpu_usage ?? 0).toFixed(2)}%
                              </span>
                            </div>
                            <Progress 
                              value={metrics.cpu_usage ?? 0} 
                              className="h-2 bg-white/10"
                            />
                            <div className="flex justify-between mt-2 text-xs text-white/30">
                              <span>Request: {details?.container?.resources.requests.cpu || '100m'}</span>
                              <span>Limit: {details?.container?.resources.limits.cpu || '500m'}</span>
                            </div>
                          </div>

                          {/* Memory Usage */}
                          <div className="bg-black/20 rounded-lg p-4">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs text-white/40 flex items-center gap-1">
                                <HardDrive className="w-3.5 h-3.5" /> Memory Usage
                              </p>
                              <span className="text-sm font-mono text-white">
                                {(metrics.memory_mb ?? 0).toFixed(1)} Mi
                              </span>
                            </div>
                            <Progress 
                              value={metrics.memory_usage ?? 0} 
                              className="h-2 bg-white/10"
                            />
                            <div className="flex justify-between mt-2 text-xs text-white/30">
                              <span>Request: {details?.container?.resources.requests.memory || '128Mi'}</span>
                              <span>Limit: {details?.container?.resources.limits.memory || '512Mi'}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Pod & Container Info */}
                    {details?.pod && (
                      <div className="bg-black/30 rounded-lg p-4">
                        <h5 className="text-xs font-semibold text-white/70 mb-3 flex items-center gap-1.5">
                          <Container className="w-3.5 h-3.5" />
                          Pod Information
                        </h5>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          <div className="bg-black/20 rounded-lg p-3">
                            <p className="text-xs text-white/40 mb-1">Pod Name</p>
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-mono text-white truncate flex-1">
                                {details.pod.name}
                              </p>
                              <button 
                                onClick={() => copyToClipboard(details.pod!.name, 'pod')}
                                className="text-white/30 hover:text-white/70 transition-colors"
                              >
                                {copiedField === 'pod' ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                              </button>
                            </div>
                          </div>
                          <div className="bg-black/20 rounded-lg p-3">
                            <p className="text-xs text-white/40 mb-1 flex items-center gap-1">
                              <Server className="w-3 h-3" /> Node
                            </p>
                            <p className="text-xs text-white truncate" title={details.pod.nodeName}>
                              {details.pod.nodeName.split('-').slice(0, 2).join('-')}...
                            </p>
                          </div>
                          <div className="bg-black/20 rounded-lg p-3">
                            <p className="text-xs text-white/40 mb-1 flex items-center gap-1">
                              <Network className="w-3 h-3" /> Pod IP
                            </p>
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-mono text-white">{details.pod.podIP}</p>
                              <button 
                                onClick={() => copyToClipboard(details.pod!.podIP, 'podip')}
                                className="text-white/30 hover:text-white/70 transition-colors"
                              >
                                {copiedField === 'podip' ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                              </button>
                            </div>
                          </div>
                          <div className="bg-black/20 rounded-lg p-3">
                            <p className="text-xs text-white/40 mb-1 flex items-center gap-1">
                              <Server className="w-3 h-3" /> Node IP
                            </p>
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-mono text-white">{details.pod.nodeIP}</p>
                              <button 
                                onClick={() => copyToClipboard(details.pod!.nodeIP, 'nodeip')}
                                className="text-white/30 hover:text-white/70 transition-colors"
                              >
                                {copiedField === 'nodeip' ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                              </button>
                            </div>
                          </div>
                          <div className="bg-black/20 rounded-lg p-3">
                            <p className="text-xs text-white/40 mb-1">Phase</p>
                            <Badge className={`text-[10px] ${
                              details.pod.phase === 'Running' ? 'bg-green-500/20 text-green-400 border-green-500/30' :
                              details.pod.phase === 'Pending' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
                              'bg-red-500/20 text-red-400 border-red-500/30'
                            }`}>
                              {details.pod.phase}
                            </Badge>
                          </div>
                          <div className="bg-black/20 rounded-lg p-3">
                            <p className="text-xs text-white/40 mb-1">Started</p>
                            <p className="text-xs text-white">
                              {details.pod.startTime ? new Date(details.pod.startTime).toLocaleString() : '-'}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Container Info */}
                    {details?.container && (
                      <div className="bg-black/30 rounded-lg p-4">
                        <h5 className="text-xs font-semibold text-white/70 mb-3 flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5" />
                          Container
                        </h5>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="bg-black/20 rounded-lg p-3">
                            <p className="text-xs text-white/40 mb-1">Image</p>
                            <p className="text-xs font-mono text-white truncate" title={details.container.image}>
                              {details.container.image.split('/').pop()?.split('@')[0] || details.container.image}
                            </p>
                          </div>
                          <div className="bg-black/20 rounded-lg p-3">
                            <p className="text-xs text-white/40 mb-1">Tag</p>
                            <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-[10px]">
                              {details.container.imageTag}
                            </Badge>
                          </div>
                          <div className="bg-black/20 rounded-lg p-3">
                            <p className="text-xs text-white/40 mb-1">State</p>
                            <Badge className={`text-[10px] ${
                              details.container.state === 'Running' ? 'bg-green-500/20 text-green-400 border-green-500/30' :
                              details.container.state.includes('Waiting') ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
                              'bg-red-500/20 text-red-400 border-red-500/30'
                            }`}>
                              {details.container.state}
                            </Badge>
                          </div>
                          <div className="bg-black/20 rounded-lg p-3">
                            <p className="text-xs text-white/40 mb-1">Ready</p>
                            <span className={`text-sm font-medium ${details.container.ready ? 'text-green-400' : 'text-red-400'}`}>
                              {details.container.ready ? 'Yes' : 'No'}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Network Info */}
                    {details?.network && (
                      <div className="bg-black/30 rounded-lg p-4">
                        <h5 className="text-xs font-semibold text-white/70 mb-3 flex items-center gap-1.5">
                          <Network className="w-3.5 h-3.5" />
                          Network
                        </h5>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                          <div className="bg-black/20 rounded-lg p-3">
                            <p className="text-xs text-white/40 mb-1">Ingress Host</p>
                            <p className="text-xs font-mono text-white truncate">{details.network.ingressHost}</p>
                          </div>
                          <div className="bg-black/20 rounded-lg p-3">
                            <p className="text-xs text-white/40 mb-1 flex items-center gap-1">
                              <Shield className="w-3 h-3" /> TLS
                            </p>
                            <Badge className={`text-[10px] ${
                              details.network.tlsEnabled 
                                ? 'bg-green-500/20 text-green-400 border-green-500/30' 
                                : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                            }`}>
                              {details.network.tlsEnabled ? 'Enabled' : 'Disabled'}
                            </Badge>
                          </div>
                          <div className="bg-black/20 rounded-lg p-3">
                            <p className="text-xs text-white/40 mb-1">Service</p>
                            <p className="text-xs text-white">{details.network.serviceName}</p>
                          </div>
                          <div className="bg-black/20 rounded-lg p-3">
                            <p className="text-xs text-white/40 mb-1">Port</p>
                            <p className="text-xs font-mono text-white">{details.network.servicePort}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Deployment Info */}
                    {details?.deployment && (
                      <div className="bg-black/30 rounded-lg p-4">
                        <h5 className="text-xs font-semibold text-white/70 mb-3 flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5" />
                          Deployment
                        </h5>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="bg-black/20 rounded-lg p-3">
                            <p className="text-xs text-white/40 mb-1">Replicas</p>
                            <p className="text-lg font-bold text-white">
                              {details.deployment.readyReplicas}/{details.deployment.replicas}
                            </p>
                          </div>
                          <div className="bg-black/20 rounded-lg p-3">
                            <p className="text-xs text-white/40 mb-1">Strategy</p>
                            <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 text-[10px]">
                              {details.deployment.strategy}
                            </Badge>
                          </div>
                          <div className="bg-black/20 rounded-lg p-3">
                            <p className="text-xs text-white/40 mb-1">Available</p>
                            <span className={`text-sm font-medium ${
                              details.deployment.availableReplicas >= details.deployment.replicas 
                                ? 'text-green-400' : 'text-yellow-400'
                            }`}>
                              {details.deployment.availableReplicas}
                            </span>
                          </div>
                          <div className="bg-black/20 rounded-lg p-3">
                            <p className="text-xs text-white/40 mb-1">Created</p>
                            <p className="text-xs text-white">
                              {details.deployment.createdAt ? new Date(details.deployment.createdAt).toLocaleDateString() : '-'}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Events */}
                    {details?.events && details.events.length > 0 && (
                      <div className="bg-black/30 rounded-lg p-4">
                        <h5 className="text-xs font-semibold text-white/70 mb-3 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Recent Events
                        </h5>
                        <div className="space-y-2">
                          {details.events.map((event, idx) => (
                            <div 
                              key={idx} 
                              className={`bg-black/20 rounded-lg p-3 border-l-2 ${
                                event.type === 'Warning' ? 'border-yellow-500' : 'border-blue-500'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <Badge className={`text-[10px] ${
                                      event.type === 'Warning' 
                                        ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' 
                                        : 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                                    }`}>
                                      {event.reason}
                                    </Badge>
                                    {event.count > 1 && (
                                      <span className="text-xs text-white/40">×{event.count}</span>
                                    )}
                                  </div>
                                  <p className="text-xs text-white/70 truncate">{event.message}</p>
                                </div>
                                <p className="text-xs text-white/30 flex-shrink-0">
                                  {event.lastTimestamp ? new Date(event.lastTimestamp).toLocaleTimeString() : ''}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Timestamp */}
                    <p className="text-xs text-white/30 text-right">
                      Last updated: {new Date(details?.timestamp || metrics?.timestamp || new Date()).toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
