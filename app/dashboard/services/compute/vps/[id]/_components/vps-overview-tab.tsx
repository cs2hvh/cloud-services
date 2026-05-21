'use client';

import { Copy, Download, FileText, RefreshCw } from 'lucide-react';

import { type ServerActions, type ServerData } from './types';

const SERIF_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-nunito), system-ui, sans-serif',
};
const MONO = 'font-[var(--font-geist-mono),ui-monospace,monospace]';
const ACCENT = '#0095FF';

interface VpsOverviewTabProps extends ServerActions {
  server: ServerData;
  isRunning: boolean;
  isProvisioning: boolean;
  isFailed: boolean;
  isRDP: boolean;
  accessCmd: string;
  memGB: number;
  monthlyCost: number;
  dailyCost: number;
}

// ─── Section header ────────────────────────────────────────────────

function SectionHead({
  num,
  title,
  description,
  action,
}: {
  num: string;
  title: string;
  description?: string;
  action?: { label: string; icon?: React.ReactNode; onClick?: () => void };
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      <div className="flex items-start gap-3.5 min-w-0">
        <span className={`${MONO} pt-0.5 text-[11px] font-semibold tracking-[0.06em] text-white/35 min-w-[24px]`}>
          {num}
        </span>
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold tracking-[-0.015em] text-white mb-0.5">{title}</h3>
          {description && <p className="text-[12px] text-white/50">{description}</p>}
        </div>
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className={`${MONO} inline-flex items-center gap-1.5 h-7 px-2.5 text-[10px] uppercase tracking-[0.12em] text-white/55 hover:text-white border border-white/[0.08] hover:border-white/[0.14] bg-transparent hover:bg-white/[0.03] rounded-[4px] transition-colors shrink-0`}
        >
          {action.icon}
          {action.label}
        </button>
      )}
    </div>
  );
}

export function VpsOverviewTab({
  server,
  isRunning,
  isRDP,
  accessCmd,
  memGB,
  monthlyCost,
  dailyCost,
  copyToClipboard,
}: VpsOverviewTabProps) {
  // Parse the SSH command into prompt + cmd + arg pieces
  const sshParts = (() => {
    // accessCmd is either "ssh user@ip" or "ip:3389"
    if (isRDP) return { cmd: '', user: '', host: accessCmd };
    const m = accessCmd.match(/^ssh\s+(.+)$/);
    return m ? { cmd: 'ssh', user: '', host: m[1] } : { cmd: 'ssh', user: '', host: accessCmd };
  })();

  return (
    <div className="space-y-7">
      {/* ── 01 · Quick access ─────────────────────────────── */}
      <section>
        <SectionHead
          num="01"
          title="Quick access"
          description={
            isRDP
              ? 'Connect via Remote Desktop. Use the server password set at provisioning.'
              : 'SSH into the server. Default user is shown in the command.'
          }
          action={{ label: 'Download .pem', icon: <FileText className="h-3 w-3" /> }}
        />

        <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-[#08090b] border-b border-white/[0.06]">
            <div className={`${MONO} flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] font-semibold text-white/55`}>
              <span className="h-2 w-2 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 6px #4ade80' }} />
              {isRDP ? 'RDP Endpoint' : 'SSH Command'}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className={`${MONO} text-[10px] uppercase tracking-[0.06em] font-medium text-white/55 hover:text-white px-2.5 py-1 rounded-[4px] hover:bg-white/[0.04] transition-colors`}
              >
                Open in terminal
              </button>
              <button
                type="button"
                onClick={() => copyToClipboard(accessCmd, isRDP ? 'RDP address' : 'SSH command')}
                className={`${MONO} text-[10px] uppercase tracking-[0.06em] font-medium px-2.5 py-1 rounded-[4px] transition-colors`}
                style={{ color: ACCENT }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,149,255,0.08)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                Copy
              </button>
            </div>
          </div>

          {/* Body — terminal-style line */}
          <div className={`${MONO} px-5 py-4 flex items-center gap-2.5 text-[13px]`}>
            <span style={{ color: ACCENT }}>$</span>
            {sshParts.cmd && <span className="text-white">{sshParts.cmd}</span>}
            <span className="text-white/55">{sshParts.host}</span>
          </div>
        </div>
      </section>

      {/* ── 02 · Instance profile ─────────────────────────── */}
      <section>
        <SectionHead
          num="02"
          title="Instance profile"
          description="Capacity, placement, and hardware allocation."
          action={{ label: 'Resize', icon: <RefreshCw className="h-3 w-3" /> }}
        />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <InfoCell label="Compute" value={String(server.cpu_cores)} unit="vCPU" meta="Virtual cores · shared" />
          <InfoCell label="Memory" value={String(memGB)} unit="GB" meta="Provisioned RAM" />
          <InfoCell label="Storage" value={String(server.disk_gb)} unit="GB" meta="NVMe attached" />
          <InfoCell
            label="Placement"
            value={server.displayRegion || server.region || 'Pending'}
            mono
            meta={server.vmid ? `VMID ${server.vmid}` : 'Awaiting provision'}
          />
        </div>
      </section>

      {/* ── 03 · Machine ──────────────────────────────────── */}
      <section>
        <SectionHead num="03" title="Machine" description="Identity, image, and system metadata." />

        <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] overflow-hidden">
          <DataRow label="Hostname" value={server.name} mono action="Edit" />
          <DataRow
            label="Public IPv4"
            value={server.ip || '—'}
            mono
            tag="Static"
            action="Copy"
            onAction={() => server.ip && copyToClipboard(server.ip, 'IP address')}
          />
          <DataRow
            label="Operating system"
            value={server.os}
            tag="Linux"
          />
          <DataRow
            label="Region"
            value={server.displayRegion || server.region || 'Unavailable'}
            tag={server.location ?? undefined}
          />
          {server.vmid !== null && server.vmid !== undefined && (
            <DataRow label="VMID" value={String(server.vmid)} mono action="Copy" />
          )}
          <DataRow
            label="Created"
            value={new Date(server.created_at).toLocaleString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          />
        </div>
      </section>

      {/* ── 04 · Billing ──────────────────────────────────── */}
      <section>
        <SectionHead
          num="04"
          title="Billing"
          description="Rate and estimates. Billed per second since first boot."
          action={{ label: 'Invoice history', icon: <Download className="h-3 w-3" /> }}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          {/* Big monthly */}
          <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] px-5 py-5">
            <div className="flex items-baseline gap-1 mb-2">
              <span style={SERIF_STYLE} className="text-[20px] text-white/55 font-medium">$</span>
              <span
                style={SERIF_STYLE}
                className="text-[40px] leading-none text-white font-bold tracking-[-0.035em] tabular-nums"
              >
                {monthlyCost.toFixed(2)}
              </span>
              <span className={`${MONO} ml-1.5 text-[12px] text-white/45`}>/mo</span>
            </div>
            <div className={`${MONO} flex items-center gap-2 text-[11px] text-white/55`}>
              <span>${(server.hourly_cost || 0).toFixed(3)}/hr</span>
              <span className="h-[3px] w-[3px] rounded-full bg-white/25" />
              <span>billed per second</span>
              {!isRunning && (
                <>
                  <span className="h-[3px] w-[3px] rounded-full bg-white/25" />
                  <span className="text-amber-300/85">paused</span>
                </>
              )}
            </div>
          </div>

          {/* Breakdown */}
          <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] px-5 py-4 flex flex-col justify-between">
            <BillingLine k="Hourly" v={`$${(server.hourly_cost || 0).toFixed(4)}`} />
            <BillingLine k="Daily" v={`$${dailyCost.toFixed(2)}`} />
            {server.billing_start && (
              <BillingLine
                k="Billing since"
                v={new Date(server.billing_start).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              />
            )}
            <BillingLine
              k="Next invoice"
              v={new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
              last
            />
          </div>
        </div>
      </section>
    </div>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────

function InfoCell({
  label,
  value,
  unit,
  meta,
  mono,
}: {
  label: string;
  value: string;
  unit?: string;
  meta: string;
  mono?: boolean;
}) {
  return (
    <div className="border border-white/[0.06] bg-[#111216] rounded-[5px] p-4 flex flex-col gap-1.5">
      <span className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/45`}>{label}</span>
      <div className="flex items-baseline gap-0.5">
        <span
          style={SERIF_STYLE}
          className={`text-[22px] leading-none font-bold tabular-nums tracking-[-0.02em] text-white truncate ${mono ? MONO : ''}`}
        >
          {value}
        </span>
        {unit && <span className={`${MONO} ml-1 text-[11px] text-white/55`}>{unit}</span>}
      </div>
      <span className={`${MONO} mt-auto text-[10.5px] text-white/40`}>{meta}</span>
    </div>
  );
}

function DataRow({
  label,
  value,
  mono,
  tag,
  action,
  onAction,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tag?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="grid grid-cols-[140px_minmax(0,1fr)_auto] gap-3 items-center px-5 py-3 border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.02] transition-colors">
      <span className={`${MONO} text-[10px] uppercase tracking-[0.08em] text-white/40 font-semibold`}>
        {label}
      </span>
      <span className={`text-[12.5px] text-white flex items-center gap-2 min-w-0 ${mono ? MONO : ''}`}>
        <span className="truncate">{value}</span>
        {tag && (
          <span
            className={`${MONO} shrink-0 normal-case text-[9px] tracking-[0.06em] uppercase font-semibold px-1.5 py-0.5 border border-white/[0.08] bg-[#1a1c23] text-white/55 rounded-[3px]`}
          >
            {tag}
          </span>
        )}
      </span>
      {action ? (
        <button
          type="button"
          onClick={onAction}
          className={`${MONO} text-[10px] uppercase tracking-[0.08em] font-semibold text-white/45 hover:text-[#0095FF] px-2 py-1 rounded-[3px] hover:bg-[rgba(0,149,255,0.08)] transition-colors inline-flex items-center gap-1`}
        >
          {action === 'Copy' && <Copy className="h-2.5 w-2.5" />}
          {action}
        </button>
      ) : (
        <span />
      )}
    </div>
  );
}

function BillingLine({ k, v, last }: { k: string; v: string; last?: boolean }) {
  return (
    <div
      className={`${MONO} flex items-center justify-between py-2 text-[11px] ${
        last ? '' : 'border-b border-dashed border-white/[0.06]'
      }`}
    >
      <span className="text-[10px] uppercase tracking-[0.08em] font-semibold text-white/40">{k}</span>
      <span className="text-white/85 font-medium">{v}</span>
    </div>
  );
}
