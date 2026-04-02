'use client';

import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';

import { Button } from '@/components/ui/button';
import {
  AlertTriangle,
  ArrowLeft,
  Loader2,
  Play,
  Power,
  RotateCw,
} from 'lucide-react';

import { type ServerData, statusColor } from './types';

interface VpsHeaderProps {
  server: ServerData;
  uptime: string;
  actingPower: boolean;
  memGB: number;
  monthlyCost: number;
  accessCmd: string;
  onPowerAction: (action: 'start' | 'stop' | 'reboot') => void;
}

export function VpsHeader({
  server,
  uptime,
  actingPower,
  memGB,
  monthlyCost,
  accessCmd,
  onPowerAction,
}: VpsHeaderProps) {
  const isRunning = server.status === 'running';
  const stopped = server.status === 'stopped';
  const isProvisioning = server.status === 'provisioning';
  const isFailed = server.status === 'failed' || server.status === 'error';
  const provisioning = server.details?.provisioning;
  const progress = provisioning?.progress || 10;

  const summaryCards = [
    {
      label: 'Compute',
      value: `${server.cpu_cores} vCPU`,
      meta: `${memGB} GB RAM`,
    },
    {
      label: 'Storage',
      value: `${server.disk_gb} GB`,
      meta: 'NVMe volume',
    },
    {
      label: 'Rate',
      value: `$${monthlyCost.toFixed(2)}/mo`,
      meta: `$${(server.hourly_cost || 0).toFixed(4)}/hr`,
    },
    {
      label: 'Placement',
      value: server.displayRegion || server.region || 'Pending',
      meta: `VMID ${server.vmid ?? 'Pending'}`,
    },
  ];

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28 }}
        className="mb-6"
      >
        <div className="mb-4 flex items-center gap-3 text-[13px] text-white/35">
          <Link
            href="/dashboard/services/compute/vps"
            className="inline-flex items-center gap-2 text-white/55 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to virtual servers
          </Link>
          <span className="text-white/12">/</span>
          <Link
            href="/dashboard/services/compute"
            className="hover:text-white/60 transition-colors"
          >
            Compute
          </Link>
          <span className="text-white/12">/</span>
          <span className="text-white/60">Virtual servers</span>
          <span className="text-white/12">/</span>
          <span className="font-mono text-xs text-white/55">{server.name}</span>
        </div>

        <div className="glass-panel overflow-hidden">
          <div className="h-px w-full bg-gradient-to-r from-cyan-400/45 via-cyan-300/10 to-transparent" />
          <div className="px-5 py-5 sm:px-6 sm:py-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0 max-w-3xl">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-300/70">
                    Virtual machine
                  </span>
                  <span
                    className={`inline-flex items-center gap-1.5 border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${statusColor(server.status)}`}
                  >
                    {isProvisioning && <Loader2 className="h-3 w-3 animate-spin" />}
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        isRunning
                          ? 'bg-emerald-300'
                          : isProvisioning
                            ? 'bg-cyan-300'
                            : isFailed
                              ? 'bg-red-300'
                              : 'bg-white/40'
                      }`}
                    />
                    {server.status}
                  </span>
                </div>

                <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                  {server.name}
                </h1>

                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-white/44">
                  <span>{server.os}</span>
                  {(server.displayRegion || server.region) && (
                    <>
                      <span className="text-white/15">•</span>
                      <span>{server.displayRegion || server.region}</span>
                    </>
                  )}
                  {server.ip && (
                    <>
                      <span className="text-white/15">•</span>
                      <span className="font-mono text-white/58">{server.ip}</span>
                    </>
                  )}
                  {isRunning && (
                    <>
                      <span className="text-white/15">•</span>
                      <span className="font-mono text-emerald-300/75">{uptime}</span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {!isProvisioning && !isFailed && (
                  <>
                    {stopped ? (
                      <Button
                        onClick={() => onPowerAction('start')}
                        disabled={actingPower}
                        size="sm"
                        className="border border-emerald-500/25 bg-emerald-500/90 font-semibold text-slate-950 hover:bg-emerald-400"
                      >
                        {actingPower ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Play className="mr-2 h-4 w-4" />
                        )}
                        Start VM
                      </Button>
                    ) : (
                      <>
                        <Button
                          onClick={() => onPowerAction('reboot')}
                          disabled={actingPower}
                          size="sm"
                          variant="outline"
                          className="border-white/[0.1] bg-white/[0.03] text-white/80 hover:bg-white/[0.08] hover:text-white"
                        >
                          {actingPower ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <RotateCw className="mr-2 h-4 w-4" />
                          )}
                          Reboot
                        </Button>
                        <Button
                          onClick={() => onPowerAction('stop')}
                          disabled={actingPower}
                          size="sm"
                          variant="outline"
                          className="border-red-500/15 bg-red-500/[0.06] text-red-400 hover:border-red-500/25 hover:bg-red-500/[0.12]"
                        >
                          <Power className="mr-2 h-4 w-4" />
                          Stop
                        </Button>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="mt-5 grid gap-5 border-t border-white/[0.06] pt-5 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {summaryCards.map((card) => (
                  <div key={card.label} className="min-w-0 border-l border-white/[0.06] pl-4 first:border-l-0 first:pl-0">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/34">
                      {card.label}
                    </div>
                    <div className="mt-2 text-base font-medium text-white">{card.value}</div>
                    <div className="mt-1 text-sm text-white/42">{card.meta}</div>
                  </div>
                ))}
              </div>

              <div className="border-t border-white/[0.06] pt-5 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/34">
                  Access
                </div>
                <div className="mt-2 truncate font-mono text-sm text-white/78">
                  {accessCmd}
                </div>
                <div className="mt-1 text-sm text-white/42">
                  {isRunning ? 'Ready for direct access.' : 'Available after the instance is online.'}
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/34">
                      Placement
                    </div>
                    <div className="mt-2 text-sm font-medium text-white">
                      {server.displayRegion || server.region || 'Pending'}
                    </div>
                    <div className="mt-1 text-sm text-white/42">
                      VMID {server.vmid ?? 'Pending'} on {server.node || 'unassigned node'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {isProvisioning && (
          <motion.div
            initial={{ opacity: 0, y: 8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            className="mb-6 overflow-hidden"
          >
            <div className="glass-panel overflow-hidden border-cyan-500/10">
              <div className="h-px w-full bg-gradient-to-r from-cyan-400/45 via-cyan-300/10 to-transparent" />
              <div className="relative px-6 py-5">
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-cyan-500/[0.04] to-transparent" />
                <div className="relative">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
                      <span className="text-sm font-medium text-cyan-200">
                        Provisioning virtual machine
                      </span>
                    </div>
                    <span className="font-mono text-sm font-semibold text-cyan-200 tabular-nums">
                      {progress}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden bg-white/[0.06]">
                    <motion.div
                      className="h-full bg-gradient-to-r from-cyan-500 via-blue-500 to-cyan-300"
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                    />
                  </div>
                  <p className="mt-3 text-[13px] text-white/42">
                    {provisioning?.message || 'Allocating compute, storage, and network resources.'}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isFailed && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mb-6"
          >
            <div className="glass-panel overflow-hidden border-red-500/15">
              <div className="h-px w-full bg-gradient-to-r from-red-400/45 via-red-300/10 to-transparent" />
              <div className="relative px-6 py-5">
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-red-500/[0.04] to-transparent" />
                <div className="relative flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center border border-red-500/20 bg-red-500/10">
                    <AlertTriangle className="h-5 w-5 text-red-300" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-red-300">Provisioning failed</p>
                    <p className="mt-1 text-[13px] leading-relaxed text-white/45">
                      {provisioning?.message || 'The instance could not be provisioned. Review the error state or retry the deployment.'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
