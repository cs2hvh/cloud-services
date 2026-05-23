"use client";

import { Container } from "@/components/ui/container";

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

/* ─── Custom stroke-based glyphs (24x24) ───----------------- */

function SaasGlyph() {
    return (
        <svg viewBox="0 0 24 24" fill="none" className="h-full w-full" strokeWidth={1.4} stroke="currentColor">
            <rect x="3" y="4" width="18" height="16" rx="1.5" />
            <path d="M3 8h18" />
            <circle cx="5.5" cy="6" r="0.5" fill="currentColor" />
            <circle cx="7.5" cy="6" r="0.5" fill="currentColor" />
            <circle cx="9.5" cy="6" r="0.5" fill="currentColor" />
            <path d="M6 12h6M6 15h9M6 18h4" />
            <path d="M17 14l2 2-2 2" />
        </svg>
    );
}

function AIGlyph() {
    return (
        <svg viewBox="0 0 24 24" fill="none" className="h-full w-full" strokeWidth={1.4} stroke="currentColor">
            {/* neural network */}
            <circle cx="5" cy="6" r="1.4" />
            <circle cx="5" cy="12" r="1.4" />
            <circle cx="5" cy="18" r="1.4" />
            <circle cx="12" cy="9" r="1.4" />
            <circle cx="12" cy="15" r="1.4" />
            <circle cx="19" cy="12" r="1.4" fill="currentColor" fillOpacity="0.25" />
            <path d="M6.3 6.6L10.7 8.4M6.3 11.5L10.7 9.4M6.3 12.6L10.7 14.4M6.3 17.4L10.7 15.6M13.3 9.6L17.7 11.4M13.3 14.4L17.7 12.6" />
        </svg>
    );
}

function CommerceGlyph() {
    return (
        <svg viewBox="0 0 24 24" fill="none" className="h-full w-full" strokeWidth={1.4} stroke="currentColor">
            <path d="M3 5h2.5l1.7 10.4a1 1 0 001 .85h9.4a1 1 0 001-.78L20.5 8H7" />
            <circle cx="9" cy="20" r="1.4" />
            <circle cx="17" cy="20" r="1.4" />
            <path d="M10.5 11.5l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function ApiGlyph() {
    return (
        <svg viewBox="0 0 24 24" fill="none" className="h-full w-full" strokeWidth={1.4} stroke="currentColor">
            {/* cube with sockets */}
            <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
            <path d="M12 3v9m0 0L4 7.5m8 4.5l8-4.5M12 12v9" />
            <circle cx="12" cy="12" r="1.6" fill="currentColor" />
        </svg>
    );
}

function RealtimeGlyph() {
    return (
        <svg viewBox="0 0 24 24" fill="none" className="h-full w-full" strokeWidth={1.4} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
            {/* waveform pulse */}
            <path d="M2 12h3l2-6 3 12 3-9 2 6 2-3h5" />
            <circle cx="20" cy="9" r="0.8" fill="currentColor" />
        </svg>
    );
}

function RegulatedGlyph() {
    return (
        <svg viewBox="0 0 24 24" fill="none" className="h-full w-full" strokeWidth={1.4} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l8 3v5c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-3z" />
            <path d="M9 12l2.2 2.2L15.5 10" />
        </svg>
    );
}

type Workload = {
    glyph: React.ReactNode;
    metric: string;
    title: string;
    description: string;
};

const WORKLOADS: Workload[] = [
    {
        glyph: <SaasGlyph />,
        metric: "Web & SaaS",
        title: "Customer-facing web applications",
        description:
            "Server-rendered and static frameworks deployed to the edge, with preview environments for every pull request and zero-downtime releases.",
    },
    {
        glyph: <AIGlyph />,
        metric: "AI / ML",
        title: "Model inference services",
        description:
            "GPU-backed runtimes with request-rate autoscaling and warm pools to keep cold-start and first-token latency within target.",
    },
    {
        glyph: <CommerceGlyph />,
        metric: "Commerce",
        title: "High-traffic storefronts",
        description:
            "Burst capacity for promotional events, integrated CDN, and signed checkout sessions — engineered for peak retail throughput.",
    },
    {
        glyph: <ApiGlyph />,
        metric: "APIs",
        title: "Backends and microservices",
        description:
            "REST and gRPC services with health checks, structured logging, and managed connections to Postgres, Redis, and Mongo.",
    },
    {
        glyph: <RealtimeGlyph />,
        metric: "Realtime",
        title: "Realtime and WebSocket services",
        description:
            "Long-lived connections with sticky routing across regional pools, deployed through the same release pipeline as the rest of the stack.",
    },
    {
        glyph: <RegulatedGlyph />,
        metric: "Regulated",
        title: "Compliance-bound workloads",
        description:
            "Private networking, SOC 2 controls, and bring-your-own-key encryption for environments requiring an end-to-end audit trail.",
    },
];

export default function AppDeployWorkloadsSection() {
    return (
        <section className="relative overflow-hidden bg-[#E6E4DC] py-20 text-[#1A1814] sm:py-24 lg:py-28">
            <Container>
                {/* Header */}
                <div className="mx-auto max-w-[760px] text-center">
                    <p
                        className={`${MONO} mb-5 inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-black/55`}
                    >
                        <span className="h-1.5 w-1.5 rounded-full bg-[#0095FF]" />
                        Use cases
                    </p>
                    <h2 className="text-3xl font-semibold leading-[1.05] tracking-[-0.02em] text-[#1A1814] sm:text-4xl lg:text-[46px]">
                        Built for the workloads you ship to production.
                    </h2>
                    <p className="mx-auto mt-5 max-w-[620px] text-[15px] leading-[1.6] text-black/60 sm:text-[16.5px]">
                        A single deployment pipeline, dashboard, and SLA — from
                        early-stage products through regulated enterprise services.
                    </p>
                </div>

                {/* 3x2 grid */}
                <div className="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-[8px] border border-black/[0.10] bg-black/[0.10] sm:grid-cols-2 lg:grid-cols-3">
                    {WORKLOADS.map((w, i) => (
                        <article
                            key={w.title}
                            className="group relative flex flex-col gap-4 bg-[#EEECE4] p-7 transition-colors hover:bg-[#F2EDDD]"
                        >
                            <div className="flex items-start justify-between">
                                <div className="relative inline-flex h-11 w-11 items-center justify-center rounded-[6px] border border-black/[0.12] bg-[#1A1814] text-[#EEECE4]/95">
                                    <div className="h-[22px] w-[22px]">{w.glyph}</div>
                                </div>
                                <span
                                    className={`${MONO} text-[10.5px] tabular-nums text-black/30`}
                                >
                                    {String(i + 1).padStart(2, "0")}
                                </span>
                            </div>

                            <div>
                                <p
                                    className={`${MONO} mb-2 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-black/50`}
                                >
                                    <span className="h-1 w-1 rounded-full bg-[#0095FF]" />
                                    {w.metric}
                                </p>
                                <h3 className="text-[18px] font-semibold leading-[1.25] tracking-[-0.01em] text-[#1A1814]">
                                    {w.title}
                                </h3>
                                <p className="mt-2 text-[13.5px] leading-[1.6] text-black/60">
                                    {w.description}
                                </p>
                            </div>
                        </article>
                    ))}
                </div>
            </Container>
        </section>
    );
}
