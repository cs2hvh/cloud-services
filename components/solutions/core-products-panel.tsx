import { assetUrl } from "@/lib/asset-url";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Container } from "@/components/ui/container";

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

const PRODUCTS = [
    {
        icon: assetUrl("/solution/thirdsecion/icon-1.svg"),
        title: "Compute",
        subtitle: "General Purpose VMs",
        description: "Reliable VMs for everyday workloads and quick scaling.",
        href: "/services/compute",
    },
    {
        icon: assetUrl("/solution/thirdsecion/icon-2.svg"),
        title: "GPU Instance",
        subtitle: "Accelerated compute",
        description: "High-performance GPUs for training, inference, rendering and HPC.",
        href: "/services/gpu",
    },
    {
        icon: assetUrl("/solution/thirdsecion/icon-3.svg"),
        title: "Database",
        subtitle: "Managed",
        description: "Fully managed databases with backups, upgrades and monitoring.",
        href: "/services/database",
    },
    {
        icon: assetUrl("/solution/thirdsecion/icon-4.svg"),
        title: "Security",
        subtitle: "Protect apps & data",
        description: "Identity, network and workload controls for secure-by-default cloud.",
        href: "/services/security",
    },
    {
        icon: assetUrl("/solution/thirdsecion/icon-5.svg"),
        title: "Kubernetes",
        subtitle: "Managed",
        description: "Production Kubernetes without the operational overhead.",
        href: "/services/kubernetes",
    },
    {
        icon: assetUrl("/solution/thirdsecion/icon-6.svg"),
        title: "Object Storage",
        subtitle: "S3 Compatible",
        description: "Durable object storage for media, backups, logs and artifacts.",
        href: "/services/object-storage",
    },
    {
        icon: assetUrl("/solution/thirdsecion/icon-7.svg"),
        title: "AI Agents",
        subtitle: "API Based",
        description: "Composable AI agents that connect tools, data and workflows via APIs.",
        href: "/services/app-deployment",
    },
    {
        icon: assetUrl("/solution/thirdsecion/icon-8.svg"),
        title: "App Deployment",
        subtitle: "Ship faster",
        description: "Build, deploy and scale apps with streamlined release workflows.",
        href: "/services/app-deployment",
    },
];

export function CoreProductsPanel() {
    return (
        <section className="relative bg-[#0D0D0F] py-16 sm:py-20">
            <div aria-hidden className="absolute top-0 left-1/2 h-px w-[60%] -translate-x-1/2 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />

            <Container>
                <div className="mb-10">
                    <p className={`${MONO} mb-4 inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-white/50`}>
                        <span className="h-1.5 w-1.5 rounded-full bg-[#0095FF]" />
                        Core products
                    </p>
                    <h2 className="text-[26px] font-semibold leading-[1.15] tracking-[-0.02em] text-white sm:text-[30px]">
                        Building blocks for every solution.
                    </h2>
                    <p className="mt-3 max-w-[540px] text-[13.5px] leading-[1.6] text-white/55">
                        Mix-and-match these primitives to assemble the right architecture for your workload.
                    </p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {PRODUCTS.map((product) => (
                        <article
                            key={product.title}
                            className="group flex flex-col rounded-[8px] border border-white/[0.10] bg-[#111316] p-5 transition-colors hover:border-white/[0.22] hover:bg-[#13161B]"
                        >
                            <div className="mb-4 flex items-center gap-3">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] border border-white/[0.10] bg-white/[0.04]">
                                    <Image src={product.icon} alt="" width={18} height={18} className="opacity-80" />
                                </div>
                                <div>
                                    <h3 className="text-[14px] font-semibold leading-[1.2] text-white">
                                        {product.title}
                                    </h3>
                                    <p className={`${MONO} text-[9px] uppercase tracking-[0.10em] text-white/40`}>
                                        {product.subtitle}
                                    </p>
                                </div>
                            </div>
                            <p className="text-[12px] leading-[1.55] text-white/55">
                                {product.description}
                            </p>
                            <Link
                                href={product.href}
                                className={`${MONO} mt-4 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#0095FF] transition-colors hover:text-[#82adfb]`}
                            >
                                Learn more
                                <ArrowRight className="h-3 w-3" />
                            </Link>
                        </article>
                    ))}
                </div>
            </Container>
        </section>
    );
}
