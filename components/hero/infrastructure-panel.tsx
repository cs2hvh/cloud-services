"use client";
import { assetUrl } from "@/lib/asset-url";

// InfrastructurePanel — editorial "live infrastructure" preview for the
// hero right column. Shows a mock of the user's running workloads across
// all our services (GPU, K8s, DB, Apps, Storage). Lightweight HTML/CSS
// — no canvas, no shaders, ties to the dashboard design language.

import Image from "next/image";

import { NvidiaLogo } from "@/components/branding/nvidia-logo";

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const ACCENT = "#0095FF";

// ─── Resource model ────────────────────────────────────────────
type StatusKey = "running" | "online" | "live" | "healthy";

interface ResourceRow {
    id: string;
    iconSrc: string;
    iconAlt: string;
    name: string;
    type: string;
    meta: string;
    status: StatusKey;
    nvidia?: boolean;
}

// Service icons live in /public/dashboard-services-icons/
// (filenames contain spaces — URL-encoded here)
const ICONS = {
    compute: assetUrl("/dashboard-services-icons/da%20compute.png"),
    kubernetes: assetUrl("/dashboard-services-icons/da%20kuubernetes.png"),
    database: assetUrl("/dashboard-services-icons/da%20database.png"),
    apps: assetUrl("/dashboard-services-icons/da%20application%20deployment.png"),
    storage: assetUrl("/dashboard-services-icons/da%20object%20storage.png"),
    ddos: assetUrl("/dashboard-services-icons/da%20ddos%20preotection.png"),
    firewall: assetUrl("/dashboard-services-icons/da%20ip%20firewall.png"),
} as const;

const RESOURCES: ResourceRow[] = [
    {
        id: "gpu-h200",
        iconSrc: ICONS.compute,
        iconAlt: "GPU compute",
        name: "h200-prod-01",
        type: "8× H200 SXM",
        meta: "Frankfurt · 141 GB HBM3e",
        status: "running",
        nvidia: true,
    },
    {
        id: "k8s-prod",
        iconSrc: ICONS.kubernetes,
        iconAlt: "Kubernetes",
        name: "prod-cluster",
        type: "Kubernetes · v1.30",
        meta: "3 nodes · 24 vCPU · NYC",
        status: "running",
    },
    {
        id: "db-main",
        iconSrc: ICONS.database,
        iconAlt: "Database",
        name: "pg-main",
        type: "Postgres 16",
        meta: "2 nodes · multi-AZ",
        status: "online",
    },
    {
        id: "app-web",
        iconSrc: ICONS.apps,
        iconAlt: "Application deployment",
        name: "webapp.galaxy",
        type: "Next.js · Build #142",
        meta: "Deployed 12m ago",
        status: "live",
    },
    {
        id: "storage-cdn",
        iconSrc: ICONS.storage,
        iconAlt: "Object storage",
        name: "assets-cdn",
        type: "Object Storage",
        meta: "2.4 TB · 12 regions",
        status: "healthy",
    },
];

const STATUS_META: Record<StatusKey, { color: string; label: string }> = {
    running: { color: "#4ade80", label: "RUNNING" },
    online: { color: "#4ade80", label: "ONLINE" },
    live: { color: "#4ade80", label: "LIVE" },
    healthy: { color: "#4ade80", label: "HEALTHY" },
};

// ─── Row ───────────────────────────────────────────────────────
function Row({ r, index }: { r: ResourceRow; index: number }) {
    const status = STATUS_META[r.status];
    return (
        <div
            className="group relative flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-white/[0.02]"
            style={{ animationDelay: `${index * 0.2}s` }}
        >
            {/* Subtle shimmer band that periodically passes through this row */}
            <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 overflow-hidden"
            >
                <span
                    className="ipp-row-shimmer absolute inset-y-0 -left-1/2 w-1/3"
                    style={{
                        background:
                            "linear-gradient(90deg, transparent, rgba(255,255,255,0.03), transparent)",
                        animationDelay: `${index * 1.4}s`,
                    }}
                />
            </span>

            {/* Isometric service icon */}
            <div className="relative h-11 w-11 shrink-0">
                <Image
                    src={r.iconSrc}
                    alt={r.iconAlt}
                    width={44}
                    height={44}
                    className="object-contain"
                    unoptimized
                />
                {r.nvidia && (
                    <span
                        className="absolute -bottom-1 -right-1 inline-flex items-center justify-center h-4 w-5 rounded-[2px] bg-[#0a0c10] border border-white/15"
                        title="NVIDIA"
                    >
                        <NvidiaLogo width={11} height={8} className="opacity-95" />
                    </span>
                )}
            </div>

            {/* Name + meta */}
            <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold tracking-tight text-white">
                    {r.name}
                </p>
                <p
                    className={`${MONO} mt-0.5 truncate text-[10px] uppercase tracking-[0.12em] text-white/45`}
                >
                    {r.type} · {r.meta}
                </p>
            </div>

            {/* Status pill */}
            <span
                className={`${MONO} shrink-0 inline-flex items-center gap-1.5 px-2 py-1 text-[9px] uppercase tracking-[0.14em] font-semibold rounded-[20px] border`}
                style={{
                    color: status.color,
                    borderColor: `${status.color}33`,
                    background: `${status.color}10`,
                }}
            >
                <span className="relative flex h-1.5 w-1.5">
                    <span
                        className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
                        style={{ background: status.color }}
                    />
                    <span
                        className="relative inline-flex h-1.5 w-1.5 rounded-full"
                        style={{
                            background: status.color,
                            boxShadow: `0 0 5px ${status.color}`,
                        }}
                    />
                </span>
                {status.label}
            </span>
        </div>
    );
}

// ─── Main panel ────────────────────────────────────────────────
export function InfrastructurePanel({ className = "" }: { className?: string }) {
    return (
        <div className={`relative h-full w-full ${className}`}>
            <style jsx global>{`
                @keyframes ippRowShimmer {
                    0%,
                    100% {
                        transform: translateX(0);
                        opacity: 0;
                    }
                    20% {
                        opacity: 1;
                    }
                    80% {
                        opacity: 1;
                    }
                    100% {
                        transform: translateX(600%);
                        opacity: 0;
                    }
                }
                @keyframes ippScan {
                    0% {
                        transform: translateX(-100%);
                    }
                    100% {
                        transform: translateX(100%);
                    }
                }
                @keyframes ippFloat {
                    0%,
                    100% {
                        transform: translateY(0);
                    }
                    50% {
                        transform: translateY(-4px);
                    }
                }
                .ipp-row-shimmer {
                    animation: ippRowShimmer 7s linear infinite;
                }
                .ipp-scan {
                    animation: ippScan 8s linear infinite;
                }
                .ipp-float {
                    animation: ippFloat 9s ease-in-out infinite;
                }
            `}</style>

            <div className="ipp-float relative h-full w-full max-w-[560px] mx-auto">
                {/* Soft brand glow behind the panel */}
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -inset-8 -z-10"
                    style={{
                        background:
                            "radial-gradient(ellipse 70% 60% at 50% 40%, rgba(0,149,255,0.10), transparent 70%)",
                        filter: "blur(40px)",
                    }}
                />

                {/* Panel */}
                <div
                    className="relative h-full overflow-hidden rounded-[8px] border border-white/15 bg-[#0a0c10]/85 backdrop-blur-sm"
                    style={{
                        boxShadow:
                            "0 30px 80px -30px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.06)",
                    }}
                >
                    {/* Top scan-line accent */}
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-x-0 top-0 h-px overflow-hidden"
                    >
                        <div
                            className="ipp-scan absolute inset-y-0 -left-1/2 w-1/3"
                            style={{
                                background: `linear-gradient(90deg, transparent, ${ACCENT}, transparent)`,
                            }}
                        />
                    </div>

                    {/* Header */}
                    <div className="border-b border-white/10 px-5 py-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="relative flex h-1.5 w-1.5">
                                    <span
                                        className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
                                        style={{ background: "#4ade80" }}
                                    />
                                    <span
                                        className="relative inline-flex h-1.5 w-1.5 rounded-full"
                                        style={{
                                            background: "#4ade80",
                                            boxShadow: "0 0 6px #4ade80",
                                        }}
                                    />
                                </span>
                                <p
                                    className={`${MONO} text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-300/90`}
                                >
                                    Live infrastructure
                                </p>
                            </div>
                            <span
                                className={`${MONO} text-[10px] uppercase tracking-[0.22em] text-white/45`}
                            >
                                {RESOURCES.length} workloads
                            </span>
                        </div>

                        <h3 className="mt-3 text-[20px] font-semibold tracking-[-0.015em] text-white">
                            Your workloads
                        </h3>
                        <p
                            className={`${MONO} mt-1 text-[10.5px] uppercase tracking-[0.14em] text-white/45`}
                        >
                            All systems operational · $234.50/hr
                        </p>
                    </div>

                    {/* Resource rows */}
                    <div className="divide-y divide-white/[0.05]">
                        {RESOURCES.map((r, i) => (
                            <Row key={r.id} r={r} index={i} />
                        ))}
                    </div>

                    {/* Footer */}
                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between border-t border-white/10 bg-black/40 px-5 py-2.5">
                        <span
                            className={`${MONO} text-[9.5px] uppercase tracking-[0.18em] text-white/50`}
                        >
                            {RESOURCES.length} of 12 resources
                        </span>
                        <span
                            className={`${MONO} inline-flex items-center gap-1.5 text-[9.5px] uppercase tracking-[0.18em]`}
                            style={{ color: ACCENT }}
                        >
                            <span
                                className="h-1 w-1 rounded-full"
                                style={{
                                    background: ACCENT,
                                    boxShadow: `0 0 5px ${ACCENT}`,
                                }}
                            />
                            View dashboard
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default InfrastructurePanel;
