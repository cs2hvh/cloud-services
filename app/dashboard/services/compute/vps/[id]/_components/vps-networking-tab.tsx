'use client';

// Networking tab — matches the dashboard's editorial design:
// numbered sections, interface cards with 4-col mini-grid, mono labels,
// brand-blue accent, throughput meters when running.

import { Copy, Plus } from 'lucide-react';

import { type VMMetrics, type VMMetricsHistoryPoint } from '@/hooks/use-vm-metrics';

import { type ServerActions, type ServerData, formatBytes, getAccessInfo } from './types';

const SERIF_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-nunito), system-ui, sans-serif',
};
const MONO = 'font-[var(--font-geist-mono),ui-monospace,monospace]';
const ACCENT = '#0095FF';

interface VpsNetworkingTabProps extends ServerActions {
  server: ServerData;
  isRunning: boolean;
  isRDP: boolean;
  metrics: VMMetrics | null;
  history: VMMetricsHistoryPoint[];
}

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

export function VpsNetworkingTab({
  server,
  isRunning,
  isRDP,
  copyToClipboard,
  metrics,
  history,
}: VpsNetworkingTabProps) {
  const { user: defaultUser } = getAccessInfo(server.os);
  const sshCmd = `ssh ${defaultUser}@${server.ip}`;
  const rdpCmd = `mstsc /v:${server.ip}`;
  const connectCmd = isRDP ? rdpCmd : sshCmd;

  // Throughput meters
  const netInHistory = history.map((p) => p.net_in);
  const netOutHistory = history.map((p) => p.net_out);
  const peakIn = Math.max(...netInHistory, metrics?.net_in || 1, 1);
  const peakOut = Math.max(...netOutHistory, metrics?.net_out || 1, 1);
  const inPct = metrics ? Math.min((metrics.net_in / peakIn) * 100, 100) : 0;
  const outPct = metrics ? Math.min((metrics.net_out / peakOut) * 100, 100) : 0;

  // Pseudo-private IP derived from the public for display (real values
  // come from infra wiring not currently exposed).
  const privIp = server.ip ? `10.0.${(server.id ?? 0) % 256}.${(server.vmid ?? 1) % 256}` : '—';

  return (
    <div className="space-y-7">
      {/* ── 01 · Network interfaces ──────────────────────── */}
      <section>
        <SectionHead
          num="01"
          title="Network interfaces"
          description="Public and private network adapters attached to this server."
          action={{ label: 'Add interface', icon: <Plus className="h-3 w-3" /> }}
        />

        {/* eth0 — public */}
        <InterfaceCard
          name="eth0"
          type="Public"
          isActive={isRunning}
          items={[
            { k: 'IPv4', v: server.ip || '—', copy: server.ip ? () => copyToClipboard(server.ip, 'Public IPv4') : undefined },
            { k: 'Gateway', v: server.ip ? `${server.ip.split('.').slice(0, 3).join('.')}.1` : '—' },
            { k: 'Netmask', v: '/24' },
            { k: 'MTU', v: '1500' },
          ]}
        />

        {/* eth1 — private */}
        <InterfaceCard
          name="eth1"
          type="Private"
          isActive={isRunning}
          items={[
            { k: 'IPv4', v: privIp, copy: () => copyToClipboard(privIp, 'Private IPv4') },
            { k: 'VLAN', v: 'vmbr1' },
            { k: 'Netmask', v: '/24' },
            { k: 'MTU', v: '1500' },
          ]}
        />
      </section>

      {/* ── 02 · Connection ─────────────────────────────── */}
      <section>
        <SectionHead
          num="02"
          title={isRDP ? 'RDP connection' : 'SSH connection'}
          description="Active protocol, port, and ready-to-paste connect command."
        />

        <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] overflow-hidden">
          {/* Header strip */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-[#08090b] border-b border-white/[0.06]">
            <div className={`${MONO} flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] font-semibold text-white/55`}>
              <span
                className={`h-2 w-2 rounded-full ${isRunning ? 'animate-pulse' : ''}`}
                style={{
                  background: isRunning ? '#4ade80' : '#52525b',
                  boxShadow: isRunning ? '0 0 6px #4ade80' : 'none',
                }}
              />
              {isRDP ? 'Remote Desktop' : 'Secure Shell'}
              <span className="text-white/15 mx-1">·</span>
              <span className="text-white/75">Port {isRDP ? '3389' : '22'}</span>
              <span className="text-white/15 mx-1">·</span>
              <span className="text-white/55">TCP</span>
            </div>
            <button
              type="button"
              onClick={() => copyToClipboard(connectCmd, isRDP ? 'RDP command' : 'SSH command')}
              className={`${MONO} text-[10px] uppercase tracking-[0.06em] font-medium px-2.5 py-1 rounded-[4px] transition-colors`}
              style={{ color: ACCENT }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,149,255,0.08)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              Copy
            </button>
          </div>

          {/* Command line */}
          <div className={`${MONO} px-5 py-4 flex items-center gap-2.5 text-[13px]`}>
            <span style={{ color: ACCENT }}>$</span>
            <span className="text-white">{isRDP ? 'mstsc' : 'ssh'}</span>
            <span className="text-white/55">{isRDP ? `/v:${server.ip}` : `${defaultUser}@${server.ip}`}</span>
          </div>

          {/* Meta row */}
          <div className={`${MONO} grid grid-cols-2 sm:grid-cols-4 gap-0 border-t border-white/[0.06]`}>
            <MetaCell k="Protocol" v={isRDP ? 'RDP' : 'SSH'} />
            <MetaCell k="Port" v={isRDP ? '3389' : '22'} divider />
            <MetaCell k="Username" v={defaultUser} mono divider copyValue={defaultUser} onCopy={() => copyToClipboard(defaultUser, 'Username')} />
            <MetaCell k="Region" v={server.displayRegion || server.region || '—'} divider />
          </div>
        </div>
      </section>

      {/* ── 03 · Throughput (only when running) ──────────── */}
      {isRunning && metrics && (
        <section>
          <SectionHead
            num="03"
            title="Live throughput"
            description="Real-time network traffic with rolling peak comparison."
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            <ThroughputCard
              label="Inbound"
              value={formatBytes(metrics.net_in)}
              peak={formatBytes(peakIn)}
              pct={inPct}
            />
            <ThroughputCard
              label="Outbound"
              value={formatBytes(metrics.net_out)}
              peak={formatBytes(peakOut)}
              pct={outPct}
            />
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────

function InterfaceCard({
  name,
  type,
  isActive,
  items,
}: {
  name: string;
  type: 'Public' | 'Private';
  isActive: boolean;
  items: Array<{ k: string; v: string; copy?: () => void }>;
}) {
  return (
    <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] px-5 py-4 mb-2">
      {/* Top row */}
      <div className="flex items-center justify-between gap-3 pb-3 mb-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <span
            className={`h-1.5 w-1.5 rounded-full ${isActive ? 'animate-pulse' : ''}`}
            style={{
              background: isActive ? '#4ade80' : '#52525b',
              boxShadow: isActive ? '0 0 6px #4ade80' : 'none',
            }}
          />
          <span className={`${MONO} text-[13px] font-semibold tracking-[-0.005em] text-white`}>
            {name}
          </span>
          <span
            className={`${MONO} text-[9px] uppercase tracking-[0.12em] font-semibold px-1.5 py-0.5 rounded-[3px] border`}
            style={
              type === 'Public'
                ? { background: 'rgba(0,149,255,0.08)', color: ACCENT, borderColor: 'rgba(0,149,255,0.25)' }
                : { background: '#1a1c23', color: 'rgba(255,255,255,0.55)', borderColor: 'rgba(255,255,255,0.08)' }
            }
          >
            {type}
          </span>
        </div>
        <span
          className={`${MONO} text-[10px] uppercase tracking-[0.08em] font-semibold text-white/45 hover:text-white px-2 py-1 rounded-[3px] hover:bg-white/[0.04] cursor-pointer transition-colors`}
        >
          Manage
        </span>
      </div>

      {/* 4-col mini grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {items.map((item) => (
          <div key={item.k} className="min-w-0">
            <div className={`${MONO} text-[9.5px] uppercase tracking-[0.14em] font-semibold text-white/40 mb-1.5`}>
              {item.k}
            </div>
            <div className={`${MONO} flex items-center gap-1.5 text-[12px] text-white truncate`}>
              <span className="truncate">{item.v}</span>
              {item.copy && (
                <button
                  type="button"
                  onClick={item.copy}
                  className="text-white/25 hover:text-[#0095FF] transition-colors shrink-0"
                  title={`Copy ${item.k}`}
                >
                  <Copy className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetaCell({
  k,
  v,
  mono,
  divider,
  copyValue,
  onCopy,
}: {
  k: string;
  v: string;
  mono?: boolean;
  divider?: boolean;
  copyValue?: string;
  onCopy?: () => void;
}) {
  return (
    <div className={`px-5 py-3 flex flex-col gap-1 ${divider ? 'sm:border-l sm:border-white/[0.06]' : ''}`}>
      <span className={`${MONO} text-[9.5px] uppercase tracking-[0.14em] font-semibold text-white/40`}>
        {k}
      </span>
      <span className={`text-[12.5px] text-white flex items-center gap-1.5 ${mono ? MONO : ''}`}>
        {v}
        {copyValue && onCopy && (
          <button
            type="button"
            onClick={onCopy}
            className="text-white/25 hover:text-[#0095FF] transition-colors"
            title="Copy"
          >
            <Copy className="h-2.5 w-2.5" />
          </button>
        )}
      </span>
    </div>
  );
}

function ThroughputCard({
  label,
  value,
  peak,
  pct,
}: {
  label: string;
  value: string;
  peak: string;
  pct: number;
}) {
  return (
    <div className="border border-white/[0.06] bg-[#111216] rounded-[5px] px-5 py-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/45`}>
          {label}
        </span>
        <span className={`${MONO} inline-flex items-center gap-1.5 text-[9.5px] uppercase tracking-[0.12em] font-semibold text-emerald-300`}>
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" style={{ boxShadow: '0 0 6px #4ade80' }} />
          Live
        </span>
      </div>
      <div className="flex items-end justify-between gap-3">
        <span
          style={SERIF_STYLE}
          className="text-[28px] leading-none font-bold tabular-nums tracking-[-0.03em] text-white"
        >
          {value}
        </span>
        <span className={`${MONO} text-[10.5px] text-white/40`}>peak {peak}</span>
      </div>
      <div className="h-[3px] overflow-hidden bg-white/[0.06] rounded-[2px]">
        <div
          className="h-full transition-all duration-500 rounded-[2px]"
          style={{
            width: `${pct}%`,
            background: ACCENT,
            boxShadow: `0 0 8px rgba(0,149,255,0.4)`,
          }}
        />
      </div>
    </div>
  );
}
