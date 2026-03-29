'use client';

import {
  Copy,
  Cpu,
  HardDrive,
  MapPin,
  ShieldCheck,
  Terminal,
  Zap,
} from 'lucide-react';

import { type ServerActions, type ServerData } from './types';

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

function SectionTitle({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">
        {eyebrow}
      </p>
      <h3 className="mt-2 text-base font-semibold text-white">{title}</h3>
      <p className="mt-1 text-sm text-white/42">{description}</p>
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono,
  onCopy,
}: {
  label: string;
  value: string;
  mono?: boolean;
  onCopy?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-white/[0.04] py-3 first:border-0">
      <span className="text-[12px] text-white/32">{label}</span>
      <div className="flex items-center gap-2">
        <span className={`text-[13px] text-white/78 ${mono ? 'font-mono' : ''}`}>{value}</span>
        {onCopy && (
          <button
            type="button"
            onClick={onCopy}
            className="text-white/18 transition-colors hover:text-white/55"
          >
            <Copy className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

export function VpsOverviewTab({
  server,
  isRunning,
  isProvisioning,
  isFailed,
  isRDP,
  accessCmd,
  memGB,
  monthlyCost,
  dailyCost,
  copyToClipboard,
}: VpsOverviewTabProps) {
  const quickConnectState = isProvisioning
    ? 'Available after provisioning finishes.'
    : isFailed
      ? 'Unavailable until deployment is recovered.'
      : isRDP
        ? 'Use Remote Desktop.'
        : 'Use SSH directly.';

  return (
    <div className="space-y-5">
      <div className="glass-panel overflow-hidden">
        <div className="grid gap-0 xl:grid-cols-[minmax(0,1.2fr)_380px]">
          <div className="px-6 py-6 sm:px-7">
            <SectionTitle
              eyebrow="Access"
              title="Quick access"
              description={quickConnectState}
            />

            <div className="mt-5 flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center border border-white/[0.08] bg-white/[0.03]">
                <Terminal className={`h-4 w-4 ${isRunning ? 'text-cyan-300' : 'text-white/35'}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                  {isRDP ? 'RDP endpoint' : 'SSH command'}
                </p>
                <code className="mt-2 block truncate font-mono text-sm text-white/78">
                  {accessCmd}
                </code>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      copyToClipboard(accessCmd, isRDP ? 'RDP address' : 'SSH command')
                    }
                    className="inline-flex items-center gap-1.5 border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-medium text-white/72 transition-colors hover:bg-white/[0.08]"
                  >
                    <Copy className="h-3 w-3" />
                    Copy
                  </button>
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-300">
                    <ShieldCheck className="h-3 w-3" />
                    {isRunning ? 'Ready' : 'Waiting'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-white/[0.06] px-6 py-6 xl:border-l xl:border-t-0 sm:px-7">
            <SectionTitle
              eyebrow="Profile"
              title="Instance profile"
              description="Provisioned capacity and placement."
            />

            <div className="mt-5 grid gap-y-4">
              {[
                {
                  label: 'Compute',
                  value: `${server.cpu_cores} vCPU`,
                  meta: 'Dedicated virtual cores',
                  icon: Cpu,
                  tone: 'text-cyan-300',
                },
                {
                  label: 'Memory',
                  value: `${memGB} GB`,
                  meta: 'Provisioned RAM',
                  icon: Zap,
                  tone: 'text-blue-300',
                },
                {
                  label: 'Storage',
                  value: `${server.disk_gb} GB`,
                  meta: 'Attached NVMe',
                  icon: HardDrive,
                  tone: 'text-violet-300',
                },
                {
                  label: 'Placement',
                  value: server.displayRegion || server.region || 'Pending',
                  meta: `VMID ${server.vmid ?? 'pending'}`,
                  icon: MapPin,
                  tone: 'text-emerald-300',
                },
              ].map((item) => {
                const Icon = item.icon;

                return (
                  <div key={item.label}>
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                      <Icon className={`h-3.5 w-3.5 ${item.tone}`} />
                      {item.label}
                    </div>
                    <div className="mt-2 text-sm font-medium text-white">{item.value}</div>
                    <div className="mt-1 text-sm text-white/42">{item.meta}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="glass-panel overflow-hidden">
        <div className="grid gap-0 xl:grid-cols-2">
          <div className="px-6 py-6 sm:px-7">
            <SectionTitle
              eyebrow="Instance"
              title="Machine details"
              description="Identity and system metadata."
            />

            <div className="mt-5">
              <InfoRow
                label="Hostname"
                value={server.name}
                mono
                onCopy={() => copyToClipboard(server.name, 'Hostname')}
              />
              <InfoRow
                label="Public IP"
                value={server.ip}
                mono
                onCopy={() => copyToClipboard(server.ip, 'IP address')}
              />
              <InfoRow label="Operating system" value={server.os} />
              <InfoRow
                label="Region"
                value={server.displayRegion || server.region || 'Unavailable'}
              />
              <InfoRow
                label="Created"
                value={new Date(server.created_at).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              />
            </div>
          </div>

          <div className="border-t border-white/[0.06] px-6 py-6 xl:border-l xl:border-t-0 sm:px-7">
            <SectionTitle
              eyebrow="Billing"
              title="Billing"
              description="Rate and estimate."
            />

            <div className="mt-5">
              <InfoRow label="Monthly estimate" value={`$${monthlyCost.toFixed(2)} / mo`} />
              <InfoRow
                label="Hourly rate"
                value={`$${server.hourly_cost?.toFixed(4) || '0.0000'} / hr`}
                mono
              />
              <InfoRow label="Daily estimate" value={`$${dailyCost.toFixed(2)} / day`} />
              {server.billing_start && (
                <InfoRow
                  label="Billing since"
                  value={new Date(server.billing_start).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                />
              )}
            </div>

            <p className="mt-4 border-t border-white/[0.04] pt-3 text-sm text-white/40">
              Usage-based add-ons may bill separately.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
