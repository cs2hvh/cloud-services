'use client';

import {
  Box,
  Loader2,
  Cpu,
  HardDrive,
  Network,
  GitBranch,
  Activity,
  AlertTriangle,
  Check,
  Copy,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AppBandwidthCard } from '@/components/dashboard/apps/app-bandwidth-card';
import { AppMetrics, AppHealth, AppDetails } from '@/hooks/use-app-metrics';

interface AppDetail {
  id: string;
  name: string;
  slug: string;
  repository_url: string;
  port: number;
  status: string;
  deployment_url?: string;
  created_at: string;
  project_id?: string | null;
  framework?: string;
  branch?: string;
  git_provider?: string;
  auto_deploy?: boolean;
  deploy_branch?: string;
  build_command?: string;
  output_directory?: string;
  env_vars?: Array<{ key: string; value: string }>;
  size?: string;
  can_rollback?: boolean;
  serving_build_number?: number | null;
  last_operation_build_number?: number | null;
  last_operation_trigger?: string | null;
  rollback_target_build_number?: number | null;
  rollback_target_commit_sha?: string | null;
  last_failure_reason?: string | null;
  healthcheck_path?: string | null;
  custom_request_body_mb?: number | null;
}

interface Props {
  app: AppDetail;
  details: AppDetails | null;
  metrics: AppMetrics | null;
  health: AppHealth | null;
  detailsLoading: boolean;
  metricsLoading: boolean;
  copiedField: string | null;
  onCopy: (text: string, field: string) => void;
  onManageBandwidth: () => void;
  servingBuildNumber: number | null;
  lastOperationLabel: string | null;
}

export function AppOverviewTab({
  app,
  details,
  metrics,
  health,
  detailsLoading,
  metricsLoading,
  copiedField,
  onCopy,
  onManageBandwidth,
  servingBuildNumber,
  lastOperationLabel,
}: Props) {
  const restartCount = details?.container?.restartCount ?? health?.restart_count ?? 0;
  const hasHighRestarts = restartCount >= 5;

  return (
    <div className="space-y-4">
      {/* Health & Metrics */}
      {app.status === 'running' && (
        <Card className="border border-white/[0.06] bg-[#111216] rounded-[6px] shadow-none">
          <CardHeader className="border-b border-white/[0.06]">
            <CardTitle className="text-lg flex items-center gap-2">
              <Box className="w-5 h-5" />
              Health &amp; Metrics
              {(detailsLoading || metricsLoading) && <Loader2 className="w-4 h-4 animate-spin" />}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-5">
            {details || metrics ? (
              <>
                {/* Health Status */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="border border-white/[0.08] bg-white/[0.03] px-4 py-4">
                    <p className="text-xs text-white/40 mb-1">Status</p>
                    <Badge
                      className={`rounded-none ${
                        health?.status === 'healthy' || details?.pod?.phase === 'Running'
                          ? 'bg-green-500/20 text-green-400'
                          : health?.status === 'degraded'
                          ? 'bg-orange-500/20 text-orange-400'
                          : 'bg-yellow-500/20 text-yellow-400'
                      }`}
                    >
                      {health?.status || details?.pod?.phase || 'Unknown'}
                    </Badge>
                  </div>
                  <div className="border border-white/[0.08] bg-white/[0.03] px-4 py-4">
                    <p className="text-xs text-white/40 mb-1">Instances</p>
                    <p className="text-xl font-bold text-white">
                      {details?.deployment?.readyReplicas || health?.pod_count || 0}/
                      {details?.deployment?.replicas || 1}
                    </p>
                  </div>
                  <div
                    className={`border bg-white/[0.03] px-4 py-4 ${
                      hasHighRestarts ? 'border-yellow-500/30' : 'border-white/[0.08]'
                    }`}
                  >
                    <p className="text-xs text-white/40 mb-1">Restarts</p>
                    <p className={`text-xl font-bold ${hasHighRestarts ? 'text-yellow-400' : 'text-white'}`}>
                      {restartCount}
                    </p>
                    {hasHighRestarts && (
                      <p className="text-xs text-yellow-400/70 mt-1">Repeatedly restarting</p>
                    )}
                  </div>
                  <div className="border border-white/[0.08] bg-white/[0.03] px-4 py-4">
                    <p className="text-xs text-white/40 mb-1">Uptime</p>
                    <p className="text-sm text-white">{details?.pod?.uptime || '-'}</p>
                  </div>
                </div>

                {/* Container Info: what image is actually running */}
                {details?.container && (
                  <div className="border border-white/[0.08] bg-white/[0.03] px-4 py-4">
                    <h5 className="text-sm font-semibold text-white/70 mb-3 flex items-center gap-1.5">
                      <Box className="w-4 h-4" />
                      Running Version
                    </h5>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <p className="text-xs text-white/40 mb-1">Image Tag</p>
                        <p className="text-sm font-mono text-white">
                          {details.container.imageTag || 'latest'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-white/40 mb-1">State</p>
                        <Badge
                          className={`rounded-none text-xs ${
                            details.container.state === 'Running'
                              ? 'bg-green-500/20 text-green-400'
                              : details.container.state?.includes('CrashLoop')
                              ? 'bg-red-500/20 text-red-400'
                              : 'bg-yellow-500/20 text-yellow-400'
                          }`}
                        >
                          {details.container.state?.includes('CrashLoop')
                            ? 'Restarting'
                            : details.container.state || 'Unknown'}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-xs text-white/40 mb-1">Ready</p>
                        <Badge
                          className={`rounded-none text-xs ${
                            details.container.ready
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-red-500/20 text-red-400'
                          }`}
                        >
                          {details.container.ready ? 'Yes' : 'No'}
                        </Badge>
                      </div>
                      {servingBuildNumber !== null && (
                        <div>
                          <p className="text-xs text-white/40 mb-1">Serving Build</p>
                          <p className="text-sm font-mono text-emerald-300">#{servingBuildNumber}</p>
                        </div>
                      )}
                      {lastOperationLabel && (
                        <div>
                          <p className="text-xs text-white/40 mb-1">Last Operation</p>
                          <p className="text-sm text-white">{lastOperationLabel}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Resource Usage */}
                {metrics && details?.container?.resources && (
                  <div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="border border-white/[0.08] bg-white/[0.03] px-4 py-4">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs text-white/40 flex items-center gap-1">
                            <Cpu className="w-3.5 h-3.5" /> CPU Usage
                          </p>
                          <span className="text-sm font-mono text-white">
                            {(metrics.cpu_usage ?? 0).toFixed(2)}%
                          </span>
                        </div>
                        <Progress value={metrics.cpu_usage ?? 0} className="h-2" />
                        <div className="mt-2 space-y-1 text-[11px] text-white/40 font-mono">
                          <p>Allocated: {details.container.resources.requests?.cpu || '-'}</p>
                          <p>Max: {details.container.resources.limits?.cpu || '-'}</p>
                        </div>
                      </div>
                      <div className="border border-white/[0.08] bg-white/[0.03] px-4 py-4">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs text-white/40 flex items-center gap-1">
                            <HardDrive className="w-3.5 h-3.5" /> Memory Usage
                          </p>
                          <span className="text-sm font-mono text-white">
                            {(metrics.memory_mb ?? 0).toFixed(1)} Mi
                          </span>
                        </div>
                        <Progress value={metrics.memory_usage ?? 0} className="h-2" />
                        <div className="mt-2 space-y-1 text-[11px] text-white/40 font-mono">
                          <p>Allocated: {details.container.resources.requests?.memory || '-'}</p>
                          <p>Max: {details.container.resources.limits?.memory || '-'}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Capacity */}
                {details?.deployment && (
                  <div className="border border-white/[0.08] bg-white/[0.03] px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs text-white/40 mb-1">Running Instances</p>
                        <p className="text-2xl font-bold text-white">
                          {details.deployment.readyReplicas}/{details.deployment.replicas}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-white/40 mb-1">Status</p>
                        <Badge
                          className={`rounded-none ${
                            details.deployment.readyReplicas >= details.deployment.replicas
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-yellow-500/20 text-yellow-400'
                          }`}
                        >
                          {details.deployment.readyReplicas >= details.deployment.replicas
                            ? 'Healthy'
                            : 'Scaling'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                )}

                {/* Network Info */}
                {details?.network && (
                  <div className="border border-white/[0.08] bg-white/[0.03] px-4 py-4">
                    <h5 className="text-sm font-semibold text-white/70 mb-3 flex items-center gap-1.5">
                      <Network className="w-4 h-4" />
                      Network
                    </h5>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <p className="text-xs text-white/40 mb-1">Hostname</p>
                        <div className="flex items-center gap-1">
                          <p className="text-xs font-mono text-white truncate flex-1">
                            {details.network.ingressHost}
                          </p>
                          <button
                            onClick={() =>
                              onCopy(details.network?.ingressHost || '', 'ingress-host')
                            }
                            className="text-white/30 hover:text-white/70 transition-colors flex-shrink-0"
                            title="Copy hostname"
                          >
                            {copiedField === 'ingress-host' ? (
                              <Check className="w-3 h-3 text-green-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-white/40 mb-1">TLS</p>
                        <Badge
                          className={`rounded-none ${
                            details.network.tlsEnabled
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-yellow-500/20 text-yellow-400'
                          }`}
                        >
                          {details.network.tlsEnabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-xs text-white/40 mb-1">Service</p>
                        <div className="flex items-center gap-1">
                          <p className="text-xs text-white truncate flex-1">
                            {details.network.serviceName}
                          </p>
                          <button
                            onClick={() =>
                              onCopy(details.network?.serviceName || '', 'service-name')
                            }
                            className="text-white/30 hover:text-white/70 transition-colors flex-shrink-0"
                            title="Copy service name"
                          >
                            {copiedField === 'service-name' ? (
                              <Check className="w-3 h-3 text-green-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-white/40 mb-1">Port</p>
                        <p className="text-xs font-mono text-white">{details.network.servicePort}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Warning Events from K8s */}
                {details?.events &&
                  details.events.filter((e) => e.type === 'Warning').length > 0 && (
                    <div className="border border-yellow-500/20 bg-yellow-500/[0.04] px-4 py-4">
                      <h5 className="text-sm font-semibold text-yellow-400/80 mb-3 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4" />
                        Recent Warnings
                      </h5>
                      <div className="space-y-2">
                        {details.events
                          .filter((e) => e.type === 'Warning')
                          .map((event, idx) => (
                            <div
                              key={idx}
                              className="flex items-start gap-2 text-xs text-yellow-200/70"
                            >
                              <span className="font-mono text-yellow-400/60 shrink-0">
                                {event.reason}
                              </span>
                              <span className="text-white/50">{event.message}</span>
                              {event.count > 1 && (
                                <Badge className="rounded-none bg-yellow-500/10 text-yellow-400/60 text-[10px] ml-auto shrink-0">
                                  ×{event?.count}
                                </Badge>
                              )}
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
              </>
            ) : (
              <div className="text-center py-8 text-white/50">
                <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>Loading metrics...</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Bandwidth */}
      {app.status === 'running' && (
        <AppBandwidthCard appId={app.id} onManage={onManageBandwidth} />
      )}

      {/* Repository Info */}
      <Card className="border border-white/[0.06] bg-[#111216] rounded-[6px] shadow-none">
        <CardHeader className="border-b border-white/[0.06]">
          <CardTitle className="text-lg flex items-center gap-2">
            <GitBranch className="w-5 h-5" />
            Repository
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-white/[0.08] bg-white/[0.03] px-4 py-4">
              <p className="text-xs text-white/40 mb-1">Repository URL</p>
              <div className="flex items-center gap-2">
                <p className="text-sm font-mono text-white truncate flex-1">
                  {app.repository_url}
                </p>
                <button
                  onClick={() => onCopy(app.repository_url, 'repo')}
                  className="text-white/30 hover:text-white/70 transition-colors"
                >
                  {copiedField === 'repo' ? (
                    <Check className="w-4 h-4 text-green-400" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
            <div className="border border-white/[0.08] bg-white/[0.03] px-4 py-4">
              <p className="text-xs text-white/40 mb-1">Git Provider</p>
              <p className="text-sm text-white capitalize">{app.git_provider}</p>
            </div>
            <div className="border border-white/[0.08] bg-white/[0.03] px-4 py-4">
              <p className="text-xs text-white/40 mb-1">Auto Deploy</p>
              <Badge
                className={`rounded-none ${
                  app.auto_deploy
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-white/10 text-white/50'
                }`}
              >
                {app.auto_deploy ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
            <div className="border border-white/[0.08] bg-white/[0.03] px-4 py-4">
              <p className="text-xs text-white/40 mb-1">Deploy Branch</p>
              <p className="text-sm text-white">{app.deploy_branch || app.branch}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
