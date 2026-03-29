'use client';

import { Copy } from 'lucide-react';

import { type VMMetrics, type VMMetricsHistoryPoint } from '@/hooks/use-vm-metrics';

import { type ServerActions, type ServerData, formatBytes, getAccessInfo } from './types';

interface VpsNetworkingTabProps extends ServerActions {
  server: ServerData;
  isRunning: boolean;
  isRDP: boolean;
  metrics: VMMetrics | null;
  history: VMMetricsHistoryPoint[];
}

function InfoRow({
  label,
  value,
  mono,
  detail,
  onCopy,
}: {
  label: string;
  value: string;
  mono?: boolean;
  detail?: string;
  onCopy?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-white/[0.04] py-3 first:border-0">
      <span className="text-[12px] text-white/30">{label}</span>
      <div className="flex items-center gap-2">
        {detail && <span className="text-[11px] text-white/15">{detail}</span>}
        <span className={`text-[13px] font-semibold text-white/70 ${mono ? 'font-mono' : ''}`}>
          {value}
        </span>
        {onCopy && (
          <button
            type="button"
            onClick={onCopy}
            className="text-white/15 transition-colors hover:text-white/40"
          >
            <Copy className="h-3 w-3" />
          </button>
        )}
      </div>
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
  const sshCommand = `ssh ${defaultUser}@${server.ip}`;
  const rdpCommand = `mstsc /v:${server.ip}`;
  const connectCommand = isRDP ? rdpCommand : sshCommand;

  const netInHistory = history.map((point) => point.net_in);
  const netOutHistory = history.map((point) => point.net_out);
  const peakIn = Math.max(...netInHistory, metrics?.net_in || 1, 1);
  const peakOut = Math.max(...netOutHistory, metrics?.net_out || 1, 1);
  const inboundPct = metrics ? Math.min((metrics.net_in / peakIn) * 100, 100) : 0;
  const outboundPct = metrics ? Math.min((metrics.net_out / peakOut) * 100, 100) : 0;

  return (
    <div className="space-y-5">
      <div className="glass-panel overflow-hidden">
        <div className="grid gap-0 border-b border-white/[0.06] md:grid-cols-3">
          <div className="px-6 py-5 sm:px-7">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">
              Public IPv4
            </p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="font-mono text-2xl font-semibold tracking-tight text-white tabular-nums">
                {server.ip}
              </p>
              <button
                onClick={() => copyToClipboard(server.ip, 'IP address')}
                className="inline-flex items-center gap-1.5 border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-medium text-white/70 transition-colors hover:bg-white/[0.08]"
              >
                <Copy className="h-3 w-3" />
                Copy
              </button>
            </div>
          </div>

          <div className="border-t border-white/[0.06] px-6 py-5 md:border-l md:border-t-0 sm:px-7">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">
              Quick connect
            </p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <code className="truncate font-mono text-sm text-white/76">{connectCommand}</code>
              <button
                onClick={() =>
                  copyToClipboard(connectCommand, isRDP ? 'RDP command' : 'SSH command')
                }
                className="inline-flex items-center gap-1.5 border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-medium text-white/70 transition-colors hover:bg-white/[0.08]"
              >
                <Copy className="h-3 w-3" />
                Copy
              </button>
            </div>
          </div>

          <div className="border-t border-white/[0.06] px-6 py-5 md:border-l md:border-t-0 sm:px-7">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">
              State
            </p>
            <div className="mt-3 flex items-center justify-between">
              <div className="text-sm text-white/72">Routed public IPv4</div>
              <span
                className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                  isRunning ? 'text-emerald-300' : 'text-white/34'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isRunning ? 'bg-emerald-400' : 'bg-white/20'
                  }`}
                />
                {isRunning ? 'Active' : 'Offline'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {isRunning && metrics && (
        <div className="glass-panel overflow-hidden">
          <div className="grid gap-0 md:grid-cols-2">
            <div className="px-6 py-5 sm:px-7">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">
                Inbound
              </p>
              <div className="mt-3 flex items-end justify-between gap-3">
                <span className="text-2xl font-semibold tracking-tight text-white tabular-nums">
                  {formatBytes(metrics.net_in)}
                </span>
                <span className="text-xs text-white/34">Peak {formatBytes(peakIn)}</span>
              </div>
              <div className="mt-4 h-1.5 bg-white/[0.06]">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-sky-400"
                  style={{ width: `${inboundPct}%` }}
                />
              </div>
            </div>

            <div className="border-t border-white/[0.06] px-6 py-5 md:border-l md:border-t-0 sm:px-7">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">
                Outbound
              </p>
              <div className="mt-3 flex items-end justify-between gap-3">
                <span className="text-2xl font-semibold tracking-tight text-white tabular-nums">
                  {formatBytes(metrics.net_out)}
                </span>
                <span className="text-xs text-white/34">Peak {formatBytes(peakOut)}</span>
              </div>
              <div className="mt-4 h-1.5 bg-white/[0.06]">
                <div
                  className="h-full bg-gradient-to-r from-sky-500 to-cyan-300"
                  style={{ width: `${outboundPct}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="glass-panel overflow-hidden">
        <div className="px-6 py-5 sm:px-7">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">
            Connection details
          </p>
        </div>
        <div className="border-t border-white/[0.06] px-6 sm:px-7">
          <InfoRow label="Protocol" value={isRDP ? 'RDP' : 'SSH'} detail={isRDP ? 'Remote Desktop' : 'Secure Shell'} />
          <InfoRow label="Port" value={isRDP ? '3389' : '22'} />
          <InfoRow
            label="Username"
            value={defaultUser}
            mono
            onCopy={() => copyToClipboard(defaultUser, 'Username')}
          />
          <InfoRow label="Transport" value="TCP" />
          <InfoRow label="Region" value={server.displayRegion || server.region || 'Unavailable'} />
        </div>
      </div>
    </div>
  );
}
