'use client';

// VPS detail header — server avatar with status indicator dot + mono
// name + meta strip + monochrome action buttons. Provisioning + failed
// banners stack underneath.

import { AlertTriangle, Clock, Copy, Globe, HardDrive, Loader2, MapPin, Play, Power, RotateCw, Terminal } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

import { OsImg } from '@/components/dashboard/compute/vps/os-icons';
import { type ServerData } from './types';

const MONO = 'font-[var(--font-geist-mono),ui-monospace,monospace]';
const ACCENT = '#0095FF';
const ACCENT_BRIGHT = '#33adff';

interface VpsHeaderProps {
    server: ServerData;
    uptime: string;
    actingPower: boolean;
    memGB: number;
    monthlyCost: number;
    accessCmd: string;
    onPowerAction: (action: 'start' | 'stop' | 'reboot') => void;
}

function statusMeta(status: string) {
    switch (status) {
        case 'running':      return { dot: '#4ade80', label: 'Running',   ring: '#4ade80' };
        case 'stopped':      return { dot: '#52525b', label: 'Stopped',   ring: '#52525b' };
        case 'provisioning': return { dot: '#0095FF', label: 'Deploying', ring: '#0095FF' };
        case 'suspended':    return { dot: '#fbbf24', label: 'Suspended', ring: '#fbbf24' };
        case 'failed':       return { dot: '#f87171', label: 'Failed',    ring: '#f87171' };
        case 'error':        return { dot: '#f87171', label: 'Error',     ring: '#f87171' };
        default:             return { dot: '#52525b', label: status,      ring: '#52525b' };
    }
}

async function copy(text: string, label: string) {
    try {
        await navigator.clipboard.writeText(text);
        toast.success(`${label} copied`);
    } catch {
        toast.error(`Failed to copy ${label}`);
    }
}

export function VpsHeader({
    server,
    uptime,
    actingPower,
    onPowerAction,
}: VpsHeaderProps) {
    const isRunning = server.status === 'running';
    const stopped = server.status === 'stopped';
    const isProvisioning = server.status === 'provisioning';
    const isFailed = server.status === 'failed' || server.status === 'error';
    const provisioning = server.details?.provisioning;
    const progress = provisioning?.progress || 10;

    const status = statusMeta(server.status);

    return (
        <>
            {/* Breadcrumb-style back link */}
            <Link
                href="/dashboard/services/compute/vps"
                className={`${MONO} inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.14em] text-white/40 hover:text-white/75 transition-colors mb-5`}
            >
                ← All servers
            </Link>

            {/* Identity row */}
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between mb-5 pb-6 border-b border-white/[0.06]">
                <div className="flex items-center gap-4 min-w-0 flex-1">
                    {/* Server avatar with status indicator */}
                    <div className="relative shrink-0">
                        <div
                            className="h-14 w-14 rounded-[8px] border flex items-center justify-center"
                            style={{
                                background: 'linear-gradient(135deg, #16181d, #1a1c23)',
                                borderColor: 'rgba(255,255,255,0.09)',
                                color: ACCENT,
                            }}
                        >
                            <OsImg name={server.os} size={28} className="h-7 w-7" />
                        </div>
                        {/* Status indicator dot */}
                        <span
                            className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full ${isRunning ? 'animate-pulse' : ''}`}
                            style={{
                                background: status.dot,
                                border: '3px solid #08090b',
                                boxShadow: `0 0 8px ${status.ring}`,
                            }}
                        />
                    </div>

                    {/* Name + meta */}
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-3 flex-wrap mb-2">
                            <h1
                                className={`${MONO} text-[24px] sm:text-[28px] leading-none tracking-[-0.02em] text-white font-semibold truncate`}
                            >
                                {server.name}
                            </h1>
                            <span
                                className={`${MONO} inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9.5px] uppercase tracking-[0.12em] font-semibold`}
                                style={{
                                    background: isRunning ? 'rgba(74,222,128,0.08)' : `${status.dot}15`,
                                    color: status.dot,
                                    border: `1px solid ${status.dot}38`,
                                }}
                            >
                                <span
                                    className={`h-1.5 w-1.5 rounded-full ${isRunning ? 'animate-pulse' : ''}`}
                                    style={{ background: status.dot, boxShadow: `0 0 6px ${status.dot}` }}
                                />
                                {status.label}
                            </span>
                        </div>

                        <div className={`${MONO} flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[11px] text-white/45`}>
                            <span className="inline-flex items-center gap-1.5 text-white/65">
                                <OsImg name={server.os} size={13} className="h-[13px] w-[13px] opacity-90" />
                                {server.os}
                            </span>
                            {(server.displayRegion || server.region) && (
                                <>
                                    <span className="text-white/15">·</span>
                                    <span className="inline-flex items-center gap-1.5">
                                        <MapPin className="h-3 w-3 opacity-70" />
                                        {server.displayRegion || server.region}
                                    </span>
                                </>
                            )}
                            {server.ip && (
                                <>
                                    <span className="text-white/15">·</span>
                                    <span className="inline-flex items-center gap-1.5 text-white/80">
                                        <Globe className="h-3 w-3 opacity-70" />
                                        {server.ip}
                                        <button
                                            type="button"
                                            onClick={() => copy(server.ip, 'IP address')}
                                            className="text-white/25 hover:text-[#0095FF] transition-colors"
                                            title="Copy IP"
                                        >
                                            <Copy className="h-3 w-3" />
                                        </button>
                                    </span>
                                </>
                            )}
                            {server.vmid && (
                                <>
                                    <span className="text-white/15">·</span>
                                    <span className="inline-flex items-center gap-1.5 text-white/35">
                                        <HardDrive className="h-3 w-3 opacity-70" />
                                        VMID {server.vmid}
                                    </span>
                                </>
                            )}
                            {isRunning && (
                                <>
                                    <span className="text-white/15">·</span>
                                    <span className="inline-flex items-center gap-1.5 text-white/65">
                                        <Clock className="h-3 w-3 opacity-70" />
                                        Up {uptime}
                                    </span>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* Power actions */}
                {!isProvisioning && !isFailed && (
                    <div className="flex items-center gap-2 shrink-0">
                        <ActionBtn icon={<Terminal className="h-3.5 w-3.5" />} label="Console" onClick={() => undefined} />
                        {stopped ? (
                            <ActionBtn
                                icon={actingPower ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                                label="Start"
                                onClick={() => onPowerAction('start')}
                                disabled={actingPower}
                                primary
                            />
                        ) : (
                            <>
                                <ActionBtn
                                    icon={actingPower ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
                                    label="Reboot"
                                    onClick={() => onPowerAction('reboot')}
                                    disabled={actingPower}
                                />
                                <ActionBtn
                                    icon={<Power className="h-3.5 w-3.5" />}
                                    label="Stop"
                                    onClick={() => onPowerAction('stop')}
                                    disabled={actingPower}
                                    danger
                                />
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Provisioning banner */}
            {isProvisioning && (
                <div className="mb-5 border border-white/[0.06] bg-[#111216] rounded-[6px] px-5 py-4">
                    <div className="mb-2.5 flex items-center justify-between">
                        <div className={`${MONO} flex items-center gap-2 text-[11.5px] text-white/75`}>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: ACCENT }} />
                            Provisioning virtual machine
                        </div>
                        <span className={`${MONO} text-[12px] font-semibold text-white tabular-nums`}>
                            {progress}%
                        </span>
                    </div>
                    <div className="h-[2px] overflow-hidden bg-white/[0.06]">
                        <div
                            className="h-full transition-all duration-700"
                            style={{ width: `${progress}%`, background: ACCENT, boxShadow: `0 0 8px rgba(0,149,255,0.4)` }}
                        />
                    </div>
                    <p className={`${MONO} mt-2.5 text-[10.5px] text-white/45`}>
                        {provisioning?.message || 'Allocating compute, storage, and network resources.'}
                    </p>
                </div>
            )}

            {/* Failed banner */}
            {isFailed && (
                <div className="mb-5 border border-red-500/20 bg-red-500/[0.04] rounded-[6px] px-5 py-4 flex items-start gap-3">
                    <div className="h-9 w-9 shrink-0 flex items-center justify-center border border-red-500/25 bg-red-500/[0.06] rounded-[5px]">
                        <AlertTriangle className="h-4 w-4 text-red-300" />
                    </div>
                    <div>
                        <p className="text-[13px] font-semibold text-red-200">Provisioning failed</p>
                        <p className={`${MONO} mt-1 text-[11.5px] text-white/55 leading-relaxed`}>
                            {provisioning?.message || 'The instance could not be provisioned. Review the error state or retry the deployment.'}
                        </p>
                    </div>
                </div>
            )}
        </>
    );
}

// ─── Action button ──────────────────────────────────────────────

function ActionBtn({
    icon,
    label,
    onClick,
    disabled,
    primary,
    danger,
}: {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    disabled?: boolean;
    primary?: boolean;
    danger?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className="inline-flex items-center gap-2 h-9 px-3.5 text-[12px] font-medium rounded-[5px] border transition-all disabled:opacity-50"
            style={
                primary
                    ? {
                          background: ACCENT,
                          borderColor: ACCENT,
                          color: '#ffffff',
                          boxShadow: '0 6px 18px rgba(0,149,255,0.15)',
                      }
                    : {
                          background: '#111216',
                          borderColor: 'rgba(255,255,255,0.08)',
                          color: 'rgba(255,255,255,0.78)',
                      }
            }
            onMouseEnter={(e) => {
                if (disabled) return;
                if (primary) {
                    e.currentTarget.style.background = ACCENT_BRIGHT;
                    e.currentTarget.style.borderColor = ACCENT_BRIGHT;
                } else if (danger) {
                    e.currentTarget.style.borderColor = 'rgba(248,113,113,0.3)';
                    e.currentTarget.style.color = '#f87171';
                    e.currentTarget.style.background = 'rgba(248,113,113,0.05)';
                } else {
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)';
                    e.currentTarget.style.background = '#16181d';
                    e.currentTarget.style.color = '#ffffff';
                }
            }}
            onMouseLeave={(e) => {
                if (disabled) return;
                if (primary) {
                    e.currentTarget.style.background = ACCENT;
                    e.currentTarget.style.borderColor = ACCENT;
                } else {
                    e.currentTarget.style.background = '#111216';
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                    e.currentTarget.style.color = 'rgba(255,255,255,0.78)';
                }
            }}
        >
            {icon}
            {label}
        </button>
    );
}
