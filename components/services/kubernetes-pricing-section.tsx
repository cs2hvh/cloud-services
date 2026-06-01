"use client";

import { ArrowRight, Cpu, Gauge, Layers, Server } from "lucide-react";

import { Container } from "@/components/ui/container";
import { AuthAwareServiceCta } from "@/components/services/auth-aware-service-cta";

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

interface Plan {
    nodes: number;
    vcpu: number;
    ram: string;
    storage: string;
    price: number;
    gpu?: string;
}

interface KubernetesCategory {
    key: string;
    label: string;
    icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
    tagline: string;
    description: string;
    features: string[];
    plans: Plan[];
}

const FALLBACK_CATEGORIES: KubernetesCategory[] = [
    {
        key: "dev",
        label: "Dev / Test",
        icon: Cpu,
        tagline: "From $15/mo",
        description:
            "Lightweight clusters for development, staging, and CI pipelines.",
        features: [
            "Shared control plane",
            "Auto-healing workers",
            "kubectl + Helm ready",
            "Cluster metrics included",
        ],
        plans: [{ nodes: 3, vcpu: 2, ram: "2 GB", storage: "60 GB", price: 15 }],
    },
    {
        key: "standard",
        label: "Standard",
        icon: Server,
        tagline: "From $75/mo",
        description:
            "Production clusters with dedicated control plane and autoscaling.",
        features: [
            "Dedicated control plane",
            "HPA / VPA autoscaling",
            "Ingress controller",
            "Rolling updates",
        ],
        plans: [{ nodes: 3, vcpu: 2, ram: "8 GB", storage: "100 GB", price: 75 }],
    },
    {
        key: "production",
        label: "Production HA",
        icon: Layers,
        tagline: "From $200/mo",
        description:
            "Multi-zone HA, automatic failover, and 99.95% production SLA.",
        features: [
            "3-zone HA control plane",
            "99.95% uptime SLA",
            "Priority support",
            "Pod disruption budgets",
        ],
        plans: [{ nodes: 3, vcpu: 4, ram: "16 GB", storage: "200 GB", price: 200 }],
    },
    {
        key: "gpu",
        label: "GPU Clusters",
        icon: Gauge,
        tagline: "From $350/mo",
        description:
            "GPU-accelerated pools for AI training, inference, and rendering.",
        features: [
            "NVIDIA A100 / H100",
            "CUDA + cuDNN preinstalled",
            "GPU operator auto-config",
            "Spot GPU pools",
        ],
        plans: [
            { nodes: 1, vcpu: 8, ram: "32 GB", storage: "200 GB", gpu: "1× A100 40GB", price: 350 },
        ],
    },
];

interface KubernetesPricingSectionProps {
    categories?: KubernetesCategory[];
}

export default function KubernetesPricingSection({
    categories = FALLBACK_CATEGORIES,
}: KubernetesPricingSectionProps) {
    return (
        <section className="relative overflow-hidden bg-[#E6E4DC] py-20 text-[#1A1814] sm:py-24 lg:py-28">
            <Container>
                {/* Header */}
                <div className="mx-auto max-w-[760px] text-center">
                    <p
                        className={`${MONO} mb-5 inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-black/55`}
                    >
                        <span className="h-1.5 w-1.5 rounded-full bg-[#0095FF]" />
                        Pricing
                    </p>
                    <h2 className="text-3xl font-semibold leading-[1.05] tracking-[-0.02em] text-[#1A1814] sm:text-4xl lg:text-[46px]">
                        Workers only.{" "}<span className="text-[#0095FF]">Control plane free.</span>
                    </h2>
                    <p className="mx-auto mt-5 max-w-[560px] text-[15px] leading-[1.6] text-black/60 sm:text-[16px]">
                        Four cluster tiers. Control plane always included — pay only for worker nodes.
                    </p>
                </div>

                {/* 4 tier cards */}
                <div className="mx-auto mt-12 grid max-w-[1120px] gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
                    {categories.map((cat) => {
                        const Icon = cat.icon;
                        const plan = cat.plans[0];
                        return (
                            <article
                                key={cat.key}
                                className="flex flex-col rounded-[10px] border border-black/10 bg-[#EEECE4] p-6 transition-all duration-300 hover:-translate-y-1 hover:border-[#0095FF] hover:shadow-[0_8px_20px_rgba(0,0,0,0.12)]"
                            >
                                {/* Icon + label */}
                                <div className="flex items-start justify-between">
                                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-[6px] border border-black/10 bg-black/[0.03] text-[#1A1814]">
                                        <Icon className="h-[18px] w-[18px]" strokeWidth={1.7} />
                                    </div>
                                </div>

                                <h3 className="mt-5 text-[17px] font-semibold leading-tight tracking-[-0.01em] text-[#1A1814]">
                                    {cat.label}
                                </h3>
                                <p className="mt-1.5 text-[12.5px] leading-[1.5] text-black/60">
                                    {cat.description}
                                </p>

                                {/* Price */}
                                <div className="mt-5 border-t border-black/10 pt-4">
                                    <div className="flex items-end gap-1">
                                        <span
                                            className={`${MONO} text-[28px] font-bold leading-none tabular-nums text-[#1A1814]`}
                                        >
                                            ${plan.price}
                                        </span>
                                        <span className="mb-1 text-[11px] text-black/55">
                                            / mo
                                        </span>
                                    </div>
                                    <p
                                        className={`${MONO} mt-2 text-[10.5px] uppercase tracking-[0.12em] text-black/45`}
                                    >
                                        {plan.nodes} {plan.nodes === 1 ? "node" : "nodes"} · {plan.vcpu} vCPU · {plan.ram}
                                        {plan.gpu ? ` · ${plan.gpu}` : ""}
                                    </p>
                                </div>

                                {/* Features */}
                                <ul className="mt-5 flex-1 space-y-2">
                                    {cat.features.map((f) => (
                                        <li
                                            key={f}
                                            className="flex items-start gap-2 text-[12.5px] leading-[1.5] text-black/70"
                                        >
                                            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-black/45" />
                                            {f}
                                        </li>
                                    ))}
                                </ul>

                                {/* CTA */}
                                <AuthAwareServiceCta
                                    service="kubernetes"
                                    intent="new"
                                    className={`${MONO} mt-6 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-[5px] border border-black/15 bg-transparent text-[11px] font-semibold uppercase tracking-[0.14em] text-black/80 transition-colors hover:border-[#0095FF] hover:bg-[#0095FF]/[0.08] hover:text-[#0095FF]`}
                                >
                                    <span className="flex items-center gap-1.5">
                                        Deploy
                                        <ArrowRight className="h-3.5 w-3.5" />
                                    </span>
                                </AuthAwareServiceCta>
                            </article>
                        );
                    })}
                </div>

                {/* Footnote */}
                <p
                    className={`${MONO} mx-auto mt-10 max-w-[640px] text-center text-[10.5px] uppercase tracking-[0.16em] text-black/45`}
                >
                    Free control plane · 99.95% SLA on production tiers · Pay-as-you-go workers
                </p>
            </Container>
        </section>
    );
}
