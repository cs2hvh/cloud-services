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
import { AppBandwidthCard } from '@/components/dashboard/apps/app-bandwidth-card';
import { AppMetrics, AppHealth, AppDetails } from '@/hooks/use-app-metrics';

// ─── Design tokens (match compute / database / object-storage) ──────
const MONO = 'font-[var(--font-geist-mono),ui-monospace,monospace]';
const SERIF_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-nunito), system-ui, sans-serif',
};
const ACCENT = '#0095FF';

type Tone = 'green' | 'amber' | 'red' | 'blue' | 'neutral';

const TONE: Record<Tone, { color: string; bg: string; border: string }> = {
  green: { color: '#4ade80', bg: 'rgba(74,222,128,0.10)', border: 'rgba(74,222,128,0.25)' },
  amber: { color: '#fbbf24', bg: 'rgba(251,191,36,0.10)', border: 'rgba(251,191,36,0.25)' },
  red: { color: '#f87171', bg: 'rgba(248,113,113,0.10)', border: 'rgba(248,113,113,0.25)' },
  blue: { color: ACCENT, bg: 'rgba(0,149,255,0.10)', border: 'rgba(0,149,255,0.30)' },
  neutral: { color: 'rgba(255,255,255,0.6)', bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.10)' },
};

/* ─── Primitives ──────────────────────────────────────────────────── */

function Panel({
  icon: Icon,
  title,
  badge,
  action,
  children,
}: {
  icon: React.ElementType;
  title: string;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[8px] border border-white/[0.06] bg-[#111216] overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-3.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] border border-white/[0.08] bg-[#0d0e11]" style={{ color: ACCENT }}>
            <Icon className="h-3.5 w-3.5" />
          </span>
          <h3 className="text-[13px] font-semibold tracking-[-0.01em] text-white truncate">{title}</h3>
          {badge}
        </div>
        {action}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

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

function Tile({
  label,
  children,
  highlight,
}: {
  label: string;
  children: React.ReactNode;
  highlight?: Tone;
}) {
  const border = highlight ? TONE[highlight].border : 'rgba(255,255,255,0.06)';
  return (
    <div className="rounded-[6px] border bg-[#0d0e11] px-4 py-3.5" style={{ borderColor: border }}>
      <p className={`${MONO} mb-2 text-[9.5px] uppercase tracking-[0.14em] text-white/40`}>{label}</p>
      {children}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className={`${MONO} mb-1.5 text-[9.5px] uppercase tracking-[0.12em] text-white/40`}>{label}</p>
      {children}
    </div>
  );
}

function CopyBtn({ active, onClick, title }: { active: boolean; onClick: () => void; title: string }) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 text-white/25 transition-colors hover:text-white/70"
      title={title}
    >
      {active ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function UsageMeter({
  icon: Icon,
  label,
  reading,
  value,
  allocated,
  max,
}: {
  icon: React.ElementType;
  label: string;
  reading: string;
  value: number;
  allocated: string;
  max: string;
}) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className="rounded-[6px] border border-white/[0.06] bg-[#0d0e11] px-4 py-3.5">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <span className={`${MONO} inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-white/45`}>
          <Icon className="h-3.5 w-3.5" /> {label}
        </span>
        <span style={SERIF_STYLE} className="text-[15px] font-bold tabular-nums tracking-[-0.02em] text-white">
          {reading}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: ACCENT, boxShadow: pct > 2 ? `0 0 8px ${ACCENT}` : 'none' }}
        />
      </div>
      <div className={`${MONO} mt-2.5 flex items-center gap-x-4 text-[10px] text-white/40`}>
        <span>Allocated: <span className="text-white/60">{allocated}</span></span>
        <span>Max: <span className="text-white/60">{max}</span></span>
      </div>
    </div>
  );
}

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

  const healthLabel = health?.status || details?.pod?.phase || 'Unknown';
  const healthTone: Tone =
    health?.status === 'healthy' || details?.pod?.phase === 'Running'
      ? 'green'
      : health?.status === 'degraded'
      ? 'amber'
      : 'amber';

  const warnings = details?.events?.filter((e) => e.type === 'Warning') ?? [];

  return (
    <div className="space-y-4">
      {/* Health & Metrics */}
      {app.status === 'running' && (
        <Panel
          icon={Box}
          title="Health & Metrics"
          badge={
            (detailsLoading || metricsLoading) ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-white/40" />
            ) : undefined
          }
        >
          {details || metrics ? (
            <div className="space-y-4">
              {/* Top stat row */}
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Tile label="Status">
                  <StatusPill tone={healthTone}>{healthLabel}</StatusPill>
                </Tile>
                <Tile label="Instances">
                  <p style={SERIF_STYLE} className="text-[24px] font-bold leading-none tabular-nums tracking-[-0.03em] text-white">
                    {details?.deployment?.readyReplicas || health?.pod_count || 0}
                    <span className="text-white/30">/{details?.deployment?.replicas || 1}</span>
                  </p>
                </Tile>
                <Tile label="Restarts" highlight={hasHighRestarts ? 'amber' : undefined}>
                  <p
                    style={SERIF_STYLE}
                    className={`text-[24px] font-bold leading-none tabular-nums tracking-[-0.03em] ${hasHighRestarts ? 'text-amber-400' : 'text-white'}`}
                  >
                    {restartCount}
                  </p>
                  {hasHighRestarts && (
                    <p className={`${MONO} mt-1.5 text-[9.5px] text-amber-400/70`}>Repeatedly restarting</p>
                  )}
                </Tile>
                <Tile label="Uptime">
                  <p className="text-[15px] font-medium text-white">{details?.pod?.uptime || '—'}</p>
                </Tile>
              </div>

              {/* Running Version */}
              {details?.container && (
                <div className="rounded-[6px] border border-white/[0.06] bg-[#0d0e11] px-4 py-4">
                  <h5 className={`${MONO} mb-4 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-white/55`}>
                    <Box className="h-3.5 w-3.5" style={{ color: ACCENT }} />
                    Running Version
                  </h5>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-4 md:grid-cols-4">
                    <Field label="Image Tag">
                      <p className={`${MONO} text-[13px] text-white`}>{details.container.imageTag || 'latest'}</p>
                    </Field>
                    <Field label="State">
                      <StatusPill
                        tone={
                          details.container.state === 'Running'
                            ? 'green'
                            : details.container.state?.includes('CrashLoop')
                            ? 'red'
                            : 'amber'
                        }
                      >
                        {details.container.state?.includes('CrashLoop')
                          ? 'Restarting'
                          : details.container.state || 'Unknown'}
                      </StatusPill>
                    </Field>
                    <Field label="Ready">
                      <StatusPill tone={details.container.ready ? 'green' : 'red'}>
                        {details.container.ready ? 'Yes' : 'No'}
                      </StatusPill>
                    </Field>
                    {servingBuildNumber !== null && (
                      <Field label="Serving Build">
                        <p className={`${MONO} text-[13px] font-semibold text-emerald-300`}>#{servingBuildNumber}</p>
                      </Field>
                    )}
                    {lastOperationLabel && (
                      <Field label="Last Operation">
                        <p className="text-[13px] text-white">{lastOperationLabel}</p>
                      </Field>
                    )}
                  </div>
                </div>
              )}

              {/* Resource Usage */}
              {metrics && details?.container?.resources && (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <UsageMeter
                    icon={Cpu}
                    label="CPU Usage"
                    reading={`${(metrics.cpu_usage ?? 0).toFixed(2)}%`}
                    value={metrics.cpu_usage ?? 0}
                    allocated={details.container.resources.requests?.cpu || '—'}
                    max={details.container.resources.limits?.cpu || '—'}
                  />
                  <UsageMeter
                    icon={HardDrive}
                    label="Memory Usage"
                    reading={`${(metrics.memory_mb ?? 0).toFixed(1)} Mi`}
                    value={metrics.memory_usage ?? 0}
                    allocated={details.container.resources.requests?.memory || '—'}
                    max={details.container.resources.limits?.memory || '—'}
                  />
                </div>
              )}

              {/* Capacity */}
              {details?.deployment && (
                <div className="flex items-center justify-between gap-3 rounded-[6px] border border-white/[0.06] bg-[#0d0e11] px-4 py-4">
                  <div>
                    <p className={`${MONO} mb-1.5 text-[9.5px] uppercase tracking-[0.14em] text-white/40`}>Running Instances</p>
                    <p style={SERIF_STYLE} className="text-[28px] font-bold leading-none tabular-nums tracking-[-0.03em] text-white">
                      {details.deployment.readyReplicas}
                      <span className="text-white/30">/{details.deployment.replicas}</span>
                    </p>
                  </div>
                  <StatusPill
                    tone={details.deployment.readyReplicas >= details.deployment.replicas ? 'green' : 'amber'}
                  >
                    {details.deployment.readyReplicas >= details.deployment.replicas ? 'Healthy' : 'Scaling'}
                  </StatusPill>
                </div>
              )}

              {/* Network */}
              {details?.network && (
                <div className="rounded-[6px] border border-white/[0.06] bg-[#0d0e11] px-4 py-4">
                  <h5 className={`${MONO} mb-4 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-white/55`}>
                    <Network className="h-3.5 w-3.5" style={{ color: ACCENT }} />
                    Network
                  </h5>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-4 md:grid-cols-4">
                    <Field label="Hostname">
                      <div className="flex items-center gap-1.5">
                        <p className={`${MONO} flex-1 truncate text-[12px] text-white`}>{details.network.ingressHost}</p>
                        <CopyBtn
                          active={copiedField === 'ingress-host'}
                          onClick={() => onCopy(details.network?.ingressHost || '', 'ingress-host')}
                          title="Copy hostname"
                        />
                      </div>
                    </Field>
                    <Field label="TLS">
                      <StatusPill tone={details.network.tlsEnabled ? 'green' : 'amber'}>
                        {details.network.tlsEnabled ? 'Enabled' : 'Disabled'}
                      </StatusPill>
                    </Field>
                    <Field label="Service">
                      <div className="flex items-center gap-1.5">
                        <p className="flex-1 truncate text-[12px] text-white">{details.network.serviceName}</p>
                        <CopyBtn
                          active={copiedField === 'service-name'}
                          onClick={() => onCopy(details.network?.serviceName || '', 'service-name')}
                          title="Copy service name"
                        />
                      </div>
                    </Field>
                    <Field label="Port">
                      <p className={`${MONO} text-[13px] text-white`}>{details.network.servicePort}</p>
                    </Field>
                  </div>
                </div>
              )}

              {/* Warning events */}
              {warnings.length > 0 && (
                <div className="rounded-[6px] border border-amber-500/20 bg-amber-500/[0.04] px-4 py-4">
                  <h5 className={`${MONO} mb-3 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-amber-400/85`}>
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Recent Warnings
                  </h5>
                  <div className="space-y-2">
                    {warnings.map((event, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-[11px]">
                        <span className={`${MONO} shrink-0 font-semibold text-amber-400/70`}>{event.reason}</span>
                        <span className="text-white/55">{event.message}</span>
                        {event.count > 1 && (
                          <span className={`${MONO} ml-auto shrink-0 rounded-[3px] bg-amber-500/10 px-1.5 py-0.5 text-[9px] text-amber-400/70`}>
                            ×{event?.count}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="py-10 text-center">
              <Activity className="mx-auto mb-2 h-7 w-7 text-white/25" />
              <p className={`${MONO} text-[11px] uppercase tracking-[0.14em] text-white/45`}>Loading metrics…</p>
            </div>
          )}
        </Panel>
      )}

      {/* Bandwidth */}
      {app.status === 'running' && (
        <AppBandwidthCard appId={app.id} onManage={onManageBandwidth} />
      )}

      {/* Repository */}
      <Panel icon={GitBranch} title="Repository">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Tile label="Repository URL">
            <div className="flex items-center gap-1.5">
              <p className={`${MONO} flex-1 truncate text-[13px] text-white`}>{app.repository_url}</p>
              <CopyBtn active={copiedField === 'repo'} onClick={() => onCopy(app.repository_url, 'repo')} title="Copy repository URL" />
            </div>
          </Tile>
          <Tile label="Git Provider">
            <p className="text-[13px] capitalize text-white">{app.git_provider || '—'}</p>
          </Tile>
          <Tile label="Auto Deploy">
            <StatusPill tone={app.auto_deploy ? 'green' : 'neutral'}>
              {app.auto_deploy ? 'Enabled' : 'Disabled'}
            </StatusPill>
          </Tile>
          <Tile label="Deploy Branch">
            <p className={`${MONO} text-[13px] text-white`}>{app.deploy_branch || app.branch || '—'}</p>
          </Tile>
        </div>
      </Panel>
    </div>
  );
}
