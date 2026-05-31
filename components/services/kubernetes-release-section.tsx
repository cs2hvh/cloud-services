"use client";

import {
    IconStackFilled,
    IconBoltFilled,
    IconCloudFilled,
    IconLockFilled,
} from "@tabler/icons-react";

import { Container } from "@/components/ui/container";

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

type Capability = {
    icon: React.ReactNode;
    accent: string;
    title: string;
    description: string;
    bullets: string[];
    visual: React.ReactNode;
};

/* ─── Per-card mini-visuals ────────────────────────────── */

function ControlPlaneVisual({ accent }: { accent: string }) {
    return (
        <div className="flex items-center justify-between gap-3 h-10">
            <div className="flex flex-col items-center gap-1">
                <div
                    className="h-6 w-6 rounded-[3px] border flex items-center justify-center"
                    style={{ background: `${accent}22`, borderColor: `${accent}60` }}
                >
                    <span className={`${MONO} text-[8px] font-bold`} style={{ color: accent }}>
                        CP
                    </span>
                </div>
                <span className={`${MONO} text-[7.5px] uppercase tracking-[0.1em] text-white/45`}>
                    Managed
                </span>
            </div>
            <div className="flex-1 h-px" style={{ background: `${accent}40` }} />
            <div className="flex gap-2">
                {["N1", "N2", "N3"].map((n) => (
                    <div key={n} className="flex flex-col items-center gap-1">
                        <div className="h-6 w-6 rounded-[3px] border border-white/20 bg-white/[0.03] flex items-center justify-center">
                            <span className={`${MONO} text-[8px] font-medium text-white/65`}>
                                {n}
                            </span>
                        </div>
                        <span className={`${MONO} text-[7.5px] uppercase tracking-[0.1em] text-white/35`}>
                            node
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function AutoscaleVisual({ accent }: { accent: string }) {
    const heights = [10, 12, 11, 14, 18, 22, 26, 24, 28, 22, 18, 16, 20, 24];
    return (
        <div className="flex items-end gap-[3px] h-10">
            {heights.map((h, i) => (
                <div
                    key={i}
                    className="flex-1 rounded-[1px]"
                    style={{
                        height: `${h}px`,
                        background: i >= 6 && i <= 9 ? accent : `${accent}38`,
                    }}
                />
            ))}
        </div>
    );
}

function MultiZoneVisual({ accent }: { accent: string }) {
    return (
        <div className="flex items-center justify-between gap-3 h-10">
            {["AZ-1", "AZ-2", "AZ-3"].map((z, i) => (
                <div key={z} className="flex flex-1 items-center gap-2">
                    <div
                        className="flex h-7 flex-1 items-center justify-center rounded-[3px] border"
                        style={{ background: `${accent}15`, borderColor: `${accent}45` }}
                    >
                        <span className={`${MONO} text-[9px] font-semibold`} style={{ color: accent }}>
                            {z}
                        </span>
                    </div>
                    {i < 2 && (
                        <span className="text-[10px]" style={{ color: `${accent}80` }}>↔</span>
                    )}
                </div>
            ))}
        </div>
    );
}

function GitOpsVisual({ accent }: { accent: string }) {
    return (
        <div className="flex items-center gap-2 h-10">
            <div className="flex items-center gap-1.5">
                {[0, 1, 2, 3].map((i) => (
                    <span
                        key={i}
                        className="h-2 w-2 rounded-full"
                        style={{ background: i === 3 ? accent : `${accent}50` }}
                    />
                ))}
            </div>
            <div className="flex-1 h-px" style={{ background: `${accent}35` }} />
            <div
                className="flex items-center gap-1.5 rounded-[3px] border px-2 py-1"
                style={{ background: `${accent}15`, borderColor: `${accent}40` }}
            >
                <span className={`${MONO} text-[9px] font-semibold`} style={{ color: accent }}>
                    sync
                </span>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: accent }} />
            </div>
        </div>
    );
}

const CAPABILITIES: Capability[] = [
    {
        icon: <IconStackFilled size={20} />,
        accent: "#0095FF",
        title: "Managed control plane",
        description:
            "We run the API server, etcd, scheduler, and controller-manager — patched, monitored, and backed up. You only pay for workers.",
        bullets: [
            "Free, always-on control plane",
            "Patched within 24h of upstream",
            "Encrypted etcd backups",
        ],
        visual: <ControlPlaneVisual accent="#0095FF" />,
    },
    {
        icon: <IconBoltFilled size={20} />,
        accent: "#10B981",
        title: "Cluster autoscaler, built-in",
        description:
            "Node pools scale on pending pods and CPU pressure. Surge capacity in seconds, scale-to-zero on idle pools to control spend.",
        bullets: [
            "Pending-pod + CPU triggers",
            "Spot + on-demand node pools",
            "Scale to zero on idle pools",
        ],
        visual: <AutoscaleVisual accent="#10B981" />,
    },
    {
        icon: <IconCloudFilled size={20} />,
        accent: "#06B6D4",
        title: "Multi-zone HA",
        description:
            "Stretch the cluster across 3 zones with quorum etcd and zone-aware scheduling. Survives a full AZ outage with no kubectl needed.",
        bullets: [
            "3-zone control plane quorum",
            "Topology-aware scheduling",
            "Pod disruption budgets enforced",
        ],
        visual: <MultiZoneVisual accent="#06B6D4" />,
    },
    {
        icon: <IconLockFilled size={20} />,
        accent: "#8B5CF6",
        title: "GitOps + RBAC out of the box",
        description:
            "Flux and Argo CD installable in one click. Cluster, namespace, and pod-level RBAC wired into your existing SSO from day one.",
        bullets: [
            "Argo CD / Flux native install",
            "SSO + RBAC from day one",
            "Audit log to S3 or Loki",
        ],
        visual: <GitOpsVisual accent="#8B5CF6" />,
    },
];

function CapabilityCard({ c, index }: { c: Capability; index: number }) {
    return (
        <article
            className="group relative flex flex-col gap-5 overflow-hidden rounded-[8px] border border-white/[0.10] bg-[#111316] p-7 transition-colors hover:border-white/[0.18] hover:bg-[#13161B]"
            style={{
                boxShadow:
                    "inset 0 1px 0 rgba(255,255,255,0.05), 0 12px 32px -14px rgba(0,0,0,0.7)",
            }}
        >
            {/* Accent hover glow */}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                style={{
                    background: `radial-gradient(circle at 30% 0%, ${c.accent}10, transparent 60%)`,
                }}
            />

            <div className="relative flex items-start justify-between">
                <div
                    className="relative inline-flex h-11 w-11 items-center justify-center rounded-[6px] border transition-all"
                    style={{ background: `${c.accent}18`, borderColor: `${c.accent}40`, color: c.accent }}
                >
                    {c.icon}
                    <span
                        className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full"
                        style={{ background: c.accent }}
                    />
                </div>
                <span
                    className={`${MONO} text-[10.5px] tabular-nums`}
                    style={{ color: `${c.accent}60` }}
                >
                    {String(index + 1).padStart(2, "0")}
                </span>
            </div>

            <div className="relative">
                <h3 className="text-[18px] font-semibold leading-[1.25] tracking-[-0.01em] text-white">
                    {c.title}
                </h3>
                <p className="mt-2.5 text-[13.5px] leading-[1.6] text-white/65">
                    {c.description}
                </p>
            </div>

            <div
                className="rounded-[5px] border px-4 py-3"
                style={{ borderColor: `${c.accent}18`, background: `${c.accent}08` }}
            >
                {c.visual}
            </div>

            <ul className="relative space-y-2">
                {c.bullets.map((b) => (
                    <li
                        key={b}
                        className="flex items-start gap-2.5 text-[12.5px] leading-[1.5] text-white/70"
                    >
                        <span
                            className="mt-[6px] h-1 w-1 shrink-0 rounded-full"
                            style={{ background: `${c.accent}90` }}
                        />
                        {b}
                    </li>
                ))}
            </ul>
        </article>
    );
}

export default function KubernetesReleaseSection() {
    return (
        <section className="relative overflow-hidden bg-[#0D0D0F] py-20 sm:py-24 lg:py-28">
            <div
                aria-hidden="true"
                className="absolute top-0 left-1/2 h-px w-[60%] -translate-x-1/2 bg-gradient-to-r from-transparent via-white/10 to-transparent"
            />

            <Container className="relative z-10">
                <div className="mx-auto max-w-[760px] text-center">
                    <p
                        className={`${MONO} mb-5 inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-white/50`}
                    >
                        <span className="h-1.5 w-1.5 rounded-full bg-[#0095FF]" />
                        The control plane
                    </p>
                    <h2 className="text-3xl font-semibold leading-[1.05] tracking-[-0.02em] text-white sm:text-4xl lg:text-[46px]">
                        <span className="text-[#0095FF]">Managed clusters</span>, zero overhead
                    </h2>
                    <p className="mx-auto mt-5 max-w-[620px] text-[15px] leading-[1.6] text-white/60 sm:text-[16.5px]">
                        API server, autoscaler, multi-zone HA, and GitOps — fully managed. Ship manifests; we own the infrastructure.
                    </p>
                </div>

                <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:gap-5">
                    {CAPABILITIES.map((c, i) => (
                        <CapabilityCard key={c.title} c={c} index={i} />
                    ))}
                </div>

                <div className="mx-auto mt-12 grid max-w-[920px] grid-cols-2 gap-px overflow-hidden rounded-[6px] border border-white/[0.08] bg-white/[0.08] sm:grid-cols-4">
                    {[
                        { value: "Free", label: "Control plane" },
                        { value: "<60s", label: "Node join" },
                        { value: "3 AZ", label: "HA quorum" },
                        { value: "99.95%", label: "SLA" },
                    ].map((s) => (
                        <div
                            key={s.label}
                            className="flex flex-col items-center gap-2 bg-[#0D0D0F] px-4 py-5"
                        >
                            <span
                                className={`${MONO} text-[22px] font-bold leading-none tabular-nums text-[#0095FF] sm:text-[26px]`}
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
