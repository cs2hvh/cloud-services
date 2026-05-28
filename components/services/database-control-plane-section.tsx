"use client";

// DatabaseControlPlaneSection — "Managed clusters, not hosted VMs"
// Editorial 2x2 capability grid with per-card mini-visuals, plus a
// realistic deploy-snippet panel below. Replaces the noisy cluster
// topology diagram that read AI-generated.

import {
    Activity,
    Check,
    GitBranch,
    Lock,
    TimerReset,
    type LucideIcon,
} from "lucide-react";

import { Container } from "@/components/ui/container";

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

type Capability = {
    icon: LucideIcon;
    title: string;
    description: string;
    bullets: string[];
    /** Renders a per-card visual element inside the card. */
    visual: React.ReactNode;
};

// ─── Per-card mini-visuals ─────────────────────────────────────

function BackupsVisual() {
    // 14-day snapshot timeline with the latest 7 highlighted
    return (
        <div className="flex items-end gap-[3px] h-10">
            {Array.from({ length: 14 }).map((_, i) => {
                const recent = i >= 7;
                const heights = [12, 18, 14, 20, 16, 22, 17, 21, 19, 24, 18, 26, 22, 28];
                return (
                    <div
                        key={i}
                        className="flex-1 rounded-[1px]"
                        style={{
                            height: `${heights[i]}px`,
                            background: recent
                                ? "rgba(255,255,255,0.85)"
                                : "rgba(255,255,255,0.18)",
                        }}
                    />
                );
            })}
        </div>
    );
}

function HaVisual() {
    // Simple primary + 2 replicas topology
    return (
        <div className="flex items-center justify-between gap-3 h-10">
            <div className="flex flex-col items-center gap-1">
                <div className="h-6 w-6 rounded-[3px] border border-white/40 bg-white/[0.08] flex items-center justify-center">
                    <span className={`${MONO} text-[8px] font-bold text-white/90`}>
                        P
                    </span>
                </div>
                <span className={`${MONO} text-[7.5px] uppercase tracking-[0.1em] text-white/45`}>
                    Primary
                </span>
            </div>
            <div className="flex-1 h-px bg-white/15" />
            <div className="flex gap-2">
                {["R1", "R2"].map((r) => (
                    <div key={r} className="flex flex-col items-center gap-1">
                        <div className="h-6 w-6 rounded-[3px] border border-white/20 bg-white/[0.03] flex items-center justify-center">
                            <span className={`${MONO} text-[8px] font-medium text-white/65`}>
                                {r}
                            </span>
                        </div>
                        <span className={`${MONO} text-[7.5px] uppercase tracking-[0.1em] text-white/35`}>
                            sync
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function SecurityVisual() {
    // Concentric layers showing private network → TLS → cluster
    return (
        <div className="flex items-center gap-2 h-10">
            {[
                { label: "VPC", opacity: 0.18 },
                { label: "TLS", opacity: 0.3 },
                { label: "AES", opacity: 0.45 },
                { label: "DB", opacity: 0.85 },
            ].map((layer) => (
                <div
                    key={layer.label}
                    className="flex-1 flex items-center justify-center rounded-[3px] border border-white/15 h-8"
                    style={{ background: `rgba(255,255,255,${layer.opacity * 0.06})` }}
                >
                    <span
                        className={`${MONO} text-[9px] font-semibold uppercase tracking-[0.1em]`}
                        style={{ color: `rgba(255,255,255,${layer.opacity * 1.05})` }}
                    >
                        {layer.label}
                    </span>
                </div>
            ))}
        </div>
    );
}

function MetricsVisual() {
    // Sparkline mini-chart
    const points = [22, 28, 24, 32, 26, 36, 30, 40, 34, 38, 32, 44, 38, 42];
    const max = Math.max(...points);
    const w = 240;
    const h = 40;
    const step = w / (points.length - 1);
    const path = points
        .map((p, i) => `${i === 0 ? "M" : "L"}${i * step},${h - (p / max) * h}`)
        .join(" ");
    return (
        <svg
            viewBox={`0 0 ${w} ${h}`}
            preserveAspectRatio="none"
            className="w-full h-10"
            aria-hidden="true"
        >
            <defs>
                <linearGradient id="ctrl-spark-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
                    <stop offset="100%" stopColor="rgba(255,255,255,0)" />
                </linearGradient>
            </defs>
            <path d={`${path} L${w},${h} L0,${h} Z`} fill="url(#ctrl-spark-fill)" />
            <path d={path} stroke="rgba(255,255,255,0.85)" strokeWidth="1.4" fill="none" />
            {points.map((p, i) => (
                <circle
                    key={i}
                    cx={i * step}
                    cy={h - (p / max) * h}
                    r={i === points.length - 1 ? 2.2 : 0.8}
                    fill={i === points.length - 1 ? "#ffffff" : "rgba(255,255,255,0.5)"}
                />
            ))}
        </svg>
    );
}

const CAPABILITIES: Capability[] = [
    {
        icon: TimerReset,
        title: "Backups & point-in-time recovery",
        description:
            "Automatic daily snapshots with up to 35-day point-in-time recovery. Restore to any second within your window.",
        bullets: [
            "Daily snapshots, 7-day retention by default",
            "PITR up to 35 days on Pro / Enterprise",
            "One-click restore to a fork or in place",
        ],
        visual: <BackupsVisual />,
    },
    {
        icon: GitBranch,
        title: "Multi-AZ high availability",
        description:
            "Synchronous primary with cross-zone standbys. Automatic failover in under 60 seconds, with no data loss.",
        bullets: [
            "Synchronous replication across zones",
            "Sub-60-second automatic failover",
            "Up to 15 read replicas with load balancing",
        ],
        visual: <HaVisual />,
    },
    {
        icon: Lock,
        title: "Private by default",
        description:
            "TLS in transit, AES-256 at rest, and VPC peering on every paid cluster. Public access is opt-in, never on by default.",
        bullets: [
            "TLS 1.3 endpoints + AES-256 storage",
            "VPC peering with AWS, GCP, Azure",
            "IP allowlists + role-based access",
        ],
        visual: <SecurityVisual />,
    },
    {
        icon: Activity,
        title: "Observability built in",
        description:
            "Query stats, slow log, replication lag, and connection metrics in the dashboard — no agents, no extra cost.",
        bullets: [
            "Slow query log + query statistics",
            "Replication lag, storage, CPU, IOPS",
            "Prometheus export for your own stack",
        ],
        visual: <MetricsVisual />,
    },
];

function CapabilityCard({ c, index }: { c: Capability; index: number }) {
    const Icon = c.icon;
    return (
        <article
            className="group relative flex flex-col gap-5 overflow-hidden rounded-[8px] border border-white/[0.10] bg-[linear-gradient(180deg,rgba(0,149,255,0.08),rgba(0,149,255,0.03))] p-7 transition-colors hover:border-white/[0.22] hover:bg-[linear-gradient(180deg,rgba(0,149,255,0.12),rgba(0,149,255,0.05))]"
            style={{
                boxShadow:
                    "inset 0 1px 0 rgba(0,149,255,0.12), 0 12px 32px -14px rgba(0,149,255,0.25)",
            }}
        >
            <div className="flex items-start justify-between">
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-[6px] border border-white/[0.12] bg-white/[0.04] text-white/80">
                    <Icon className="h-5 w-5" strokeWidth={1.6} />
                </div>
                <span
                    className={`${MONO} text-[10.5px] tabular-nums text-white/30`}
                >
                    {String(index + 1).padStart(2, "0")}
                </span>
            </div>

            <div>
                <h3 className="text-[18px] font-semibold leading-[1.25] tracking-[-0.01em] text-white">
                    {c.title}
                </h3>
                <p className="mt-2.5 text-[13.5px] leading-[1.6] text-white/65">
                    {c.description}
                </p>
            </div>

            {/* Per-card mini-visual */}
            <div className="rounded-[5px] border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                {c.visual}
            </div>

            {/* Bullets */}
            <ul className="space-y-2">
                {c.bullets.map((b) => (
                    <li
                        key={b}
                        className="flex items-start gap-2.5 text-[12.5px] leading-[1.5] text-white/70"
                    >
                        <Check
                            className="mt-[3px] h-3.5 w-3.5 shrink-0 text-white/55"
                            strokeWidth={2.2}
                        />
                        {b}
                    </li>
                ))}
            </ul>
        </article>
    );
}

// ─── Section ───────────────────────────────────────────────────

export default function DatabaseControlPlaneSection() {
    return (
        <section className="relative overflow-hidden bg-[#0D0D0F] py-20 sm:py-24 lg:py-28">
            {/* Top hairline */}
            <div
                aria-hidden="true"
                className="absolute top-0 left-1/2 h-px w-[60%] -translate-x-1/2 bg-gradient-to-r from-transparent via-white/10 to-transparent"
            />

            <Container className="relative z-10">
                {/* Header */}
                <div className="mx-auto max-w-[760px] text-center">
                    <p
                        className={`${MONO} mb-5 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-white/50`}
                    >
                        The control plane
                    </p>
                    <h2 className="text-3xl font-semibold leading-[1.05] tracking-[-0.02em] text-white sm:text-4xl lg:text-[48px]">
                        Managed clusters, not hosted VMs
                    </h2>
                    <p className="mx-auto mt-5 max-w-[620px] text-[15px] leading-[1.6] text-white/60 sm:text-[16.5px]">
                        Backups, failover, encryption, and observability ship as
                        product defaults — not scripts you cobble together after
                        provisioning a server. One command, fully managed.
                    </p>
                </div>

                {/* 2x2 capability grid with mini-visuals */}
                <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:gap-5">
                    {CAPABILITIES.map((c, i) => (
                        <CapabilityCard key={c.title} c={c} index={i} />
                    ))}
                </div>

                {/* Bottom stat strip */}
                <div className="mx-auto mt-12 grid max-w-[920px] grid-cols-2 gap-px overflow-hidden rounded-[6px] border border-white/[0.08] bg-white/[0.08] sm:grid-cols-4">
                    {[
                        { value: "<60s", label: "Failover" },
                        { value: "35d", label: "PITR window" },
                        { value: "15", label: "Read replicas" },
                        { value: "6", label: "Engines" },
                    ].map((s) => (
                        <div
                            key={s.label}
                            className="flex flex-col items-center gap-2 bg-[#0D0D0F] px-4 py-5"
                        >
                            <span
                                className={`${MONO} text-[22px] font-bold leading-none tabular-nums text-white sm:text-[26px]`}
                            >
                                {s.value}
                            </span>
                            <span
                                className={`${MONO} text-[10px] font-semibold uppercase tracking-[0.18em] text-white/50`}
                            >
                                {s.label}
                            </span>
                        </div>
                    ))}
                </div>
            </Container>
        </section>
    );
}
