"use client";

import Image from "next/image";

import { Container } from "@/components/ui/container";

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

type Feature = {
    title: string;
    description: string;
    image: string;
};

const FEATURES: Feature[] = [
    {
        title: "Auto-scaling node pools",
        description:
            "Pools scale on pending pods and resource pressure. Mix on-demand and spot, scale to zero when idle.",
        image: "/images/kubernetes-ui/auto scaling.png",
    },
    {
        title: "Multi-region clusters",
        description:
            "Stretch one cluster across regions with topology-aware scheduling and automated failover when an AZ disappears.",
        image: "/images/kubernetes-ui/Multi region clusters png.png",
    },
    {
        title: "GitOps ready",
        description:
            "Argo CD or Flux installable from the dashboard. Wire any branch to any cluster; drift is reconciled automatically.",
        image: "/images/kubernetes-ui/gitops%20ready.png",
    },
    {
        title: "Fully managed control plane",
        description:
            "API server, scheduler, etcd, and controllers — patched, monitored, backed up. You pay only for workers.",
        image: "/images/kubernetes-ui/fully managed.png",
    },
    {
        title: "Built-in load balancing",
        description:
            "L4/L7 ingress with automatic TLS, sticky sessions, and DDoS protection. No manual cert renewals.",
        image: "/images/kubernetes-ui/Built%20in%20load%20balancing%20png.png",
    },
    {
        title: "Observability built in",
        description:
            "Cluster, node, and pod metrics plus container logs in the dashboard. Prometheus and OTel exporters for your own stack.",
        image: "/images/kubernetes-ui/auto scaling.png",
    },
];

function FeatureItem({ feature, index }: { feature: Feature; index: number }) {
    return (
        <div className="group flex flex-col items-start gap-5">
            {/* Floating icon — no card, just the image */}
            <div className="relative h-[140px] w-[140px] transition-transform duration-500 group-hover:-translate-y-1.5">
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-[18%] rounded-full bg-[#0095FF]/[0.05] opacity-0 blur-[36px] transition-opacity duration-500 group-hover:opacity-100"
                />
                <Image
                    src={feature.image}
                    alt=""
                    fill
                    sizes="140px"
                    className="relative z-10 object-contain"
                />
            </div>

            {/* Step number */}
            <span
                className={`${MONO} text-[10.5px] tabular-nums tracking-[0.18em] text-white/30`}
            >
                {String(index + 1).padStart(2, "0")}
            </span>

            {/* Title + description */}
            <div>
                <h3 className="text-[18px] font-semibold leading-[1.25] tracking-[-0.01em] text-[#0095FF]">
                    {feature.title}
                </h3>
                <p className="mt-2.5 text-[13.5px] leading-[1.65] text-white/60">
                    {feature.description}
                </p>
            </div>
        </div>
    );
}

export default function KubernetesFeaturesSection() {
    return (
        <section className="relative overflow-hidden bg-[#0D0D0F] py-20 sm:py-24 lg:py-28">
            <Container className="relative z-10">
                <div className="mx-auto max-w-[760px] text-center">
                    <p
                        className={`${MONO} mb-5 inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-white/50`}
                    >
                        <span className="h-1.5 w-1.5 rounded-full bg-[#0095FF]" />
                        Features
                    </p>
                    <h2 className="text-3xl font-semibold leading-[1.05] tracking-[-0.02em] text-white sm:text-4xl lg:text-[46px]">
                        Production-ready,{" "}<span className="text-[#0095FF]">built in</span>
                    </h2>
                    <p className="mx-auto mt-5 max-w-[620px] text-[15px] leading-[1.6] text-white/60 sm:text-[16.5px]">
                        Six production capabilities included from day one. No plugins to configure. No operational drift.
                    </p>
                </div>

                {/* Grid — separated icons + text, no card boxes */}
                <div className="mx-auto mt-16 grid max-w-[1080px] grid-cols-1 gap-x-10 gap-y-14 sm:grid-cols-2 lg:grid-cols-3 lg:gap-x-12 lg:gap-y-16">
                    {FEATURES.map((f, i) => (
                        <FeatureItem key={f.title} feature={f} index={i} />
                    ))}
                </div>
            </Container>
        </section>
    );
}
