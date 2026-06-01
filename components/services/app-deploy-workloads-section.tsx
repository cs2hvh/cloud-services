"use client";

import {
    IconDeviceDesktopFilled,
    IconSparklesFilled,
    IconShoppingCartFilled,
    IconHexagonFilled,
    IconBoltFilled,
    IconShieldCheckFilled,
} from "@tabler/icons-react";

import { Container } from "@/components/ui/container";

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

type Workload = {
    icon: React.ReactNode;
    accent: string;
    metric: string;
    title: string;
    description: string;
};

const WORKLOADS: Workload[] = [
    {
        icon: <IconDeviceDesktopFilled size={22} />,
        accent: "#0095FF",
        metric: "Web & SaaS",
        title: "Customer-facing web applications",
        description:
            "Server-rendered and static frameworks deployed to the edge, with preview environments for every pull request and zero-downtime releases.",
    },
    {
        icon: <IconSparklesFilled size={22} />,
        accent: "#8B5CF6",
        metric: "AI / ML",
        title: "Model inference services",
        description:
            "GPU-backed runtimes with request-rate autoscaling and warm pools to keep cold-start and first-token latency within target.",
    },
    {
        icon: <IconShoppingCartFilled size={22} />,
        accent: "#10B981",
        metric: "Commerce",
        title: "High-traffic storefronts",
        description:
            "Burst capacity for promotional events, integrated CDN, and signed checkout sessions — engineered for peak retail throughput.",
    },
    {
        icon: <IconHexagonFilled size={22} />,
        accent: "#06B6D4",
        metric: "APIs",
        title: "Backends and microservices",
        description:
            "REST and gRPC services with health checks, structured logging, and managed connections to Postgres, Redis, and Mongo.",
    },
    {
        icon: <IconBoltFilled size={22} />,
        accent: "#F59E0B",
        metric: "Realtime",
        title: "Realtime and WebSocket services",
        description:
            "Long-lived connections with sticky routing across regional pools, deployed through the same release pipeline as the rest of the stack.",
    },
    {
        icon: <IconShieldCheckFilled size={22} />,
        accent: "#E11D48",
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
                                <div
                                    className="relative inline-flex h-11 w-11 items-center justify-center rounded-[6px] border transition-all"
                                    style={{ background: `${w.accent}18`, borderColor: `${w.accent}40`, color: w.accent }}
                                >
                                    {w.icon}
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
