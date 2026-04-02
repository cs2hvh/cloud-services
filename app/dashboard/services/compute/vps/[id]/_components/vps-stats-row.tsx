'use client';

import { motion } from 'motion/react';
import { ArrowUpDown, Cpu, DollarSign, HardDrive, Zap } from 'lucide-react';

import { type VMMetrics } from '@/hooks/use-vm-metrics';

import { type ServerData, formatBytes } from './types';

interface VpsStatsRowProps {
  server: ServerData;
  isRunning: boolean;
  vmMetrics: VMMetrics | null;
  memGB: number;
  monthlyCost: number;
}

export function VpsStatsRow({
  server,
  isRunning,
  vmMetrics: metrics,
  memGB,
  monthlyCost,
}: VpsStatsRowProps) {
  const liveMetrics = isRunning && metrics;

  const stats = liveMetrics
    ? [
        {
          label: 'CPU',
          value: `${metrics.cpu.toFixed(1)}%`,
          meta: 'Processor usage',
          pct: metrics.cpu,
          icon: Cpu,
          tone:
            metrics.cpu > 80
              ? 'text-red-300'
              : metrics.cpu > 50
                ? 'text-amber-300'
                : 'text-cyan-300',
          bar:
            metrics.cpu > 80
              ? 'from-red-500 to-red-400'
              : metrics.cpu > 50
                ? 'from-amber-500 to-amber-400'
                : 'from-cyan-500 to-cyan-400',
        },
        {
          label: 'Memory',
          value: `${formatBytes(metrics.mem_used)}`,
          suffix: ` / ${formatBytes(metrics.mem_total)}`,
          meta: 'Allocated memory',
          pct: metrics.mem_pct,
          icon: Zap,
          tone:
            metrics.mem_pct > 85
              ? 'text-red-300'
              : metrics.mem_pct > 60
                ? 'text-amber-300'
                : 'text-blue-300',
          bar:
            metrics.mem_pct > 85
              ? 'from-red-500 to-red-400'
              : metrics.mem_pct > 60
                ? 'from-amber-500 to-amber-400'
                : 'from-blue-500 to-blue-400',
        },
        {
          label: 'Network',
          value: `${formatBytes(metrics.net_out)} out`,
          suffix: ` / ${formatBytes(metrics.net_in)} in`,
          meta: 'Traffic sample',
          pct: null,
          icon: ArrowUpDown,
          tone: 'text-violet-300',
          bar: 'from-violet-500 to-violet-400',
        },
        {
          label: 'Disk',
          value: `${formatBytes(metrics.disk_read)} read`,
          suffix: ` / ${formatBytes(metrics.disk_write)} write`,
          meta: 'Storage sample',
          pct: null,
          icon: HardDrive,
          tone: 'text-emerald-300',
          bar: 'from-emerald-500 to-emerald-400',
        },
      ]
    : [
        {
          label: 'Compute',
          value: `${server.cpu_cores} vCPU`,
          meta: 'Provisioned cores',
          pct: null,
          icon: Cpu,
          tone: 'text-cyan-300',
          bar: 'from-cyan-500 to-cyan-400',
        },
        {
          label: 'Memory',
          value: `${memGB} GB`,
          meta: 'Provisioned RAM',
          pct: null,
          icon: Zap,
          tone: 'text-blue-300',
          bar: 'from-blue-500 to-blue-400',
        },
        {
          label: 'Storage',
          value: `${server.disk_gb} GB`,
          meta: 'Attached NVMe',
          pct: null,
          icon: HardDrive,
          tone: 'text-violet-300',
          bar: 'from-violet-500 to-violet-400',
        },
        {
          label: 'Billing',
          value: `$${monthlyCost.toFixed(2)}`,
          suffix: ' / month',
          meta: 'Estimated at 730 hours',
          pct: null,
          icon: DollarSign,
          tone: 'text-emerald-300',
          bar: 'from-emerald-500 to-emerald-400',
        },
      ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.04, duration: 0.24 }}
      className="mb-6"
    >
      <div className="glass-panel overflow-hidden">
        <div className="grid grid-cols-1 divide-y divide-white/[0.06] md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-4">
          {stats.map((stat) => {
            const Icon = stat.icon;

            return (
              <div key={stat.label} className="p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/34">
                      {stat.label}
                    </p>
                    <p className="mt-3 text-2xl font-semibold tracking-tight text-white">
                      {stat.value}
                      {stat.suffix && (
                        <span className="ml-1 text-sm font-normal text-white/26">
                          {stat.suffix}
                        </span>
                      )}
                    </p>
                    <p className="mt-1 text-sm text-white/42">{stat.meta}</p>
                  </div>

                  <Icon className={`h-4.5 w-4.5 shrink-0 ${stat.tone}`} />
                </div>

                {stat.pct !== null && (
                  <div className="mt-4 h-1.5 overflow-hidden bg-white/[0.06]">
                    <motion.div
                      className={`h-full bg-gradient-to-r ${stat.bar}`}
                      animate={{ width: `${Math.min(stat.pct, 100)}%` }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
