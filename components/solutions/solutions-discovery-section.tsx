"use client";
import { assetUrl } from "@/lib/asset-url";

import Image from "next/image";
import Link from "next/link";
import { ChevronUp, ArrowRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Container } from "@/components/ui/container";
import { PaperGrain } from "@/components/brand/atmosphere";

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

/* ─── data ─────────────────────────────────────────────────────── */

type SolutionCardData = {
    title: string;
    description: string;
    icon: string;
    outcomes: string[];
    products: string[];
    href: string;
};

const PRODUCT_FILTERS = [
    "Compute",
    "GPU Instances",
    "Database",
    "Security",
    "Kubernetes",
    "Object Storage",
    "AI Agents",
    "Application Deployment",
];

const SOLUTION_CARDS: SolutionCardData[] = [
    {
        title: "AI & Machine Learning",
        description: "Train, fine-tune, and serve models with accelerated compute and managed orchestration.",
        icon: assetUrl("/solution/secondsection/AI.svg"),
        outcomes: ["Faster experimentation", "Low-latency inference", "Cost controls"],
        products: ["GPU Instances", "AI Agents", "Kubernetes", "Object Storage"],
        href: "/solutions/ai-ml",
    },
    {
        title: "Web Hosting & SaaS Deployment",
        description: "Launch modern web apps with reliable compute, managed services, and smooth deployments.",
        icon: assetUrl("/solution/secondsection/Monitor.svg"),
        outcomes: ["Quick launches", "Horizontal scalability", "Operational simplicity"],
        products: ["Compute", "Application Deployment", "Database", "Security"],
        href: "/solutions/web-hosting",
    },
    {
        title: "Ecommerce Infrastructure",
        description: "Deliver fast storefronts and resilient checkout flows with secure, scalable building blocks.",
        icon: assetUrl("/solution/secondsection/Shopping%20Bag.svg"),
        outcomes: ["High uptime", "Performance under load", "Secure transactions"],
        products: ["Compute", "Database", "Security", "Object Storage"],
        href: "/solutions/ecommerce",
    },
    {
        title: "Game Development",
        description: "Low-latency servers, scalable backends, and storage for assets and telemetry.",
        icon: assetUrl("/solution/secondsection/Game%20Controller.svg"),
        outcomes: ["Low ping", "Burst scale", "Operational visibility"],
        products: ["Compute", "Kubernetes", "Object Storage", "Security"],
        href: "/solutions/game-dev",
    },
    {
        title: "Database-Driven Applications",
        description: "Build data-heavy apps with managed databases and secure networking.",
        icon: assetUrl("/solution/secondsection/Database.svg"),
        outcomes: ["Reliability", "High availability", "Easy scaling"],
        products: ["Database", "Compute", "Security", "Object Storage"],
        href: "/solutions/database",
    },
    {
        title: "Secure Enterprise Cloud",
        description: "Harden workloads with identity controls, network segmentation, and governance.",
        icon: assetUrl("/solution/secondsection/Protect.svg"),
        outcomes: ["Least-privilege access", "Audit readiness", "Defense in depth"],
        products: ["Security", "Kubernetes", "Database", "Object Storage"],
        href: "/solutions/security",
    },
    {
        title: "Cloud-Native Kubernetes Platforms",
        description: "Run microservices with managed Kubernetes and modern delivery practices.",
        icon: assetUrl("/solution/secondsection/Kubernetes.svg"),
        outcomes: ["Faster releases", "Safer rollouts", "Consistent environments"],
        products: ["Kubernetes", "Application Deployment", "Security", "Database"],
        href: "/solutions/kubernetes",
    },
    {
        title: "Storage & Backup Solutions",
        description: "Store and protect critical data, backups, media, and build artifacts at scale.",
        icon: assetUrl("/solution/secondsection/Stack.svg"),
        outcomes: ["Durability", "Simpler backups", "Lower storage costs"],
        products: ["Object Storage", "Security", "Database", "Compute"],
        href: "/solutions/storage",
    },
];

type ProductCardData = {
    title: string;
    subtitle: string;
    description: string;
    icon: string;
    href: string;
    features: string[];
};

const PRODUCT_CARDS: ProductCardData[] = [
    {
        icon: assetUrl("/solution/thirdsecion/icon-1.svg"),
        title: "Compute",
        subtitle: "General Purpose VMs",
        description: "Reliable VMs for everyday workloads and quick scaling.",
        href: "/services/compute",
        features: ["Instant provisioning", "Global regions", "Flexible sizing", "Root access"],
    },
    {
        icon: assetUrl("/solution/thirdsecion/icon-2.svg"),
        title: "GPU Instance",
        subtitle: "Accelerated compute",
        description: "High-performance GPUs for training, inference, rendering and HPC.",
        href: "/services/gpu",
        features: ["NVIDIA GPUs", "Bare-metal speed", "Jupyter ready", "CUDA support"],
    },
    {
        icon: assetUrl("/solution/thirdsecion/icon-3.svg"),
        title: "Database",
        subtitle: "Managed",
        description: "Fully managed databases with backups, upgrades and monitoring.",
        href: "/services/database",
        features: ["PostgreSQL", "MySQL", "Redis", "Auto-backups"],
    },
    {
        icon: assetUrl("/solution/thirdsecion/icon-4.svg"),
        title: "Security",
        subtitle: "Protect apps & data",
        description: "Identity, network and workload controls for secure-by-default cloud.",
        href: "/services/security",
        features: ["DDoS protection", "Firewall", "Encryption", "IAM controls"],
    },
    {
        icon: assetUrl("/solution/thirdsecion/icon-5.svg"),
        title: "Kubernetes",
        subtitle: "Managed",
        description: "Production Kubernetes without the operational overhead.",
        href: "/services/kubernetes",
        features: ["Auto-scaling", "Rolling updates", "Service mesh", "Monitoring"],
    },
    {
        icon: assetUrl("/solution/thirdsecion/icon-6.svg"),
        title: "Object Storage",
        subtitle: "S3 Compatible",
        description: "Durable object storage for media, backups, logs and artifacts.",
        href: "/services/object-storage",
        features: ["S3 compatible", "11 nines durability", "CDN integration", "Versioning"],
    },
    {
        icon: assetUrl("/solution/thirdsecion/icon-7.svg"),
        title: "AI Agents",
        subtitle: "API Based",
        description: "Composable AI agents that connect tools, data and workflows via APIs.",
        href: "/services/app-deployment",
        features: ["Vector databases", "Model gateways", "Observability", "Workflows"],
    },
    {
        icon: assetUrl("/solution/thirdsecion/icon-8.svg"),
        title: "Application Deployment",
        subtitle: "Ship faster",
        description: "Build, deploy and scale apps with streamlined release workflows.",
        href: "/services/app-deployment",
        features: ["Git-based", "Preview environments", "Auto SSL", "Instant rollbacks"],
    },
];

function normalizeText(v: string) { return v.toLowerCase().trim(); }

/* ─── cards ─────────────────────────────────────────────────────── */

function SolutionCard({ card }: { card: SolutionCardData }) {
    return (
        <article className="group flex flex-col overflow-hidden rounded-[10px] border border-black/[0.10] bg-[#EEECE4] transition-colors hover:border-black/[0.20] hover:bg-[#E8E6DE]">
            <div className="flex flex-1 flex-col gap-4 p-6">
                {/* Header */}
                <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[7px] border border-black/[0.10] bg-[#1A1814]">
                        <Image src={card.icon} alt="" width={20} height={20} className="opacity-85" />
                    </div>
                    <div className="pt-0.5 min-w-0">
                        <h3 className="text-[15px] font-semibold leading-[1.25] tracking-[-0.01em] text-[#1A1814]">
                            {card.title}
                        </h3>
                        <p className="mt-1.5 text-[12px] leading-[1.55] text-black/55">
                            {card.description}
                        </p>
                    </div>
                </div>

                {/* Outcomes */}
                <div>
                    <p className={`${MONO} mb-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-black/35`}>
                        Key outcomes
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                        {card.outcomes.map((o) => (
                            <span
                                key={o}
                                className={`${MONO} inline-flex items-center rounded-[3px] border border-black/[0.10] bg-white/70 px-2 py-1 text-[9.5px] uppercase tracking-[0.10em] text-black/60`}
                            >
                                {o}
                            </span>
                        ))}
                    </div>
                </div>

                {/* Products */}
                <div className="flex flex-wrap gap-1">
                    {card.products.map((p) => (
                        <span
                            key={p}
                            className={`${MONO} inline-flex items-center gap-1 rounded-[3px] border border-black/[0.06] px-1.5 py-0.5 text-[9px] uppercase tracking-[0.08em] text-black/40`}
                        >
                            <span className="h-[3px] w-[3px] rounded-full bg-[#0095FF]" />
                            {p}
                        </span>
                    ))}
                </div>
            </div>

            {/* Footer */}
            <div className="border-t border-black/[0.06] px-6 py-4">
                <div className="flex items-center justify-between">
                    <Link
                        href={card.href}
                        className={`${MONO} inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#0066B3] transition-colors hover:text-[#004f8a]`}
                    >
                        View Solution
                        <ArrowRight className="h-3 w-3" />
                    </Link>
                    <Link
                        href="/docs"
                        className={`${MONO} text-[10px] uppercase tracking-[0.10em] text-black/35 transition-colors hover:text-black/60`}
                    >
                        Architecture guide
                    </Link>
                </div>
            </div>
        </article>
    );
}

function ProductCard({ card }: { card: ProductCardData }) {
    return (
        <article className="group flex flex-col overflow-hidden rounded-[10px] border border-black/[0.10] bg-[#EEECE4] transition-colors hover:border-black/[0.20] hover:bg-[#E8E6DE]">
            <div className="flex flex-1 flex-col gap-4 p-6">
                <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[7px] border border-black/[0.10] bg-[#1A1814]">
                        <Image src={card.icon} alt="" width={20} height={20} className="opacity-85" />
                    </div>
                    <div className="pt-0.5">
                        <h3 className="text-[15px] font-semibold leading-[1.25] tracking-[-0.01em] text-[#1A1814]">
                            {card.title}
                        </h3>
                        <p className={`${MONO} mt-0.5 text-[9.5px] uppercase tracking-[0.10em] text-black/40`}>
                            {card.subtitle}
                        </p>
                        <p className="mt-2 text-[12px] leading-[1.55] text-black/55">
                            {card.description}
                        </p>
                    </div>
                </div>

                <div>
                    <p className={`${MONO} mb-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-black/35`}>
                        Key features
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                        {card.features.map((f) => (
                            <span
                                key={f}
                                className={`${MONO} inline-flex items-center rounded-[3px] border border-black/[0.10] bg-white/70 px-2 py-1 text-[9.5px] uppercase tracking-[0.10em] text-black/60`}
                            >
                                {f}
                            </span>
                        ))}
                    </div>
                </div>
            </div>

            <div className="border-t border-black/[0.06] px-6 py-4">
                <div className="flex items-center justify-between">
                    <Link
                        href={card.href}
                        className={`${MONO} inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#0066B3] transition-colors hover:text-[#004f8a]`}
                    >
                        View Product
                        <ArrowRight className="h-3 w-3" />
                    </Link>
                    <Link
                        href="/pricing"
                        className={`${MONO} text-[10px] uppercase tracking-[0.10em] text-black/35 transition-colors hover:text-black/60`}
                    >
                        View Pricing
                    </Link>
                </div>
            </div>
        </article>
    );
}

/* ─── section ────────────────────────────────────────────────────── */

export function SolutionsDiscoverySection({
    activeTab,
    setActiveTabAction,
}: {
    activeTab: "solutions" | "products";
    setActiveTabAction: (tab: "solutions" | "products") => void;
}) {
    const [query, setQuery] = useState("");
    const [showFilters, setShowFilters] = useState(false);
    const [selectedProducts, setSelectedProducts] = useState<string[]>([]);

    const cardsBySearch = useMemo(() => {
        const q = normalizeText(query);
        if (!q) return SOLUTION_CARDS;
        return SOLUTION_CARDS.filter((card) =>
            normalizeText(`${card.title} ${card.description} ${card.outcomes.join(" ")} ${card.products.join(" ")}`).includes(q),
        );
    }, [query]);

    const filteredCards = useMemo(() => {
        if (selectedProducts.length === 0) return cardsBySearch;
        return cardsBySearch.filter((card) =>
            card.products.some((p) => selectedProducts.includes(p)),
        );
    }, [cardsBySearch, selectedProducts]);

    const toggleProduct = (product: string) => {
        setSelectedProducts((cur) =>
            cur.includes(product) ? cur.filter((p) => p !== product) : [...cur, product],
        );
    };

    return (
        <section className="relative overflow-hidden bg-[#E6E4DC] py-16 sm:py-20">
            <PaperGrain opacity={0.07} />

            <Container className="relative z-10">
                {/* Section eyebrow */}
                <div className="mb-8 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <p className={`${MONO} mb-2 inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-black/50`}>
                            <span className="h-1.5 w-1.5 rounded-full bg-[#0095FF]" />
                            {activeTab === "solutions" ? "Browse solutions" : "Browse products"}
                        </p>
                        <h2 className="text-[22px] font-semibold leading-[1.15] tracking-[-0.01em] text-[#1A1814] sm:text-[26px]">
                            {activeTab === "solutions"
                                ? "Find the right solution for your use case."
                                : "Pick the core building blocks you need."}
                        </h2>
                    </div>
                    <p className={`${MONO} shrink-0 text-[10.5px] uppercase tracking-[0.18em] text-black/35`}>
                        {activeTab === "solutions" ? `${filteredCards.length} solutions` : `${PRODUCT_CARDS.length} products`}
                    </p>
                </div>

                {/* Toolbar */}
                <div className="relative flex flex-col gap-2 sm:flex-row sm:items-center">
                    {/* Search */}
                    <div className="flex h-11 flex-1 items-center gap-3 rounded-[6px] border border-black/[0.12] bg-[#EEECE4] px-4">
                        <Search className="h-4 w-4 shrink-0 text-black/35" />
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            type="text"
                            placeholder={
                                activeTab === "solutions"
                                    ? "Search by name, use case, or outcome…"
                                    : "Search by name or features…"
                            }
                            className={`${MONO} w-full bg-transparent text-[11.5px] text-[#1A1814] outline-none placeholder:text-black/30`}
                        />
                    </div>

                    {/* Filter toggle */}
                    <button
                        type="button"
                        onClick={() => setShowFilters((v) => !v)}
                        className={cn(
                            `${MONO} flex h-11 shrink-0 items-center gap-2 rounded-[6px] border px-4 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors`,
                            showFilters
                                ? "border-[#1A1814] bg-[#1A1814] text-white"
                                : "border-black/[0.14] bg-[#EEECE4] text-black/55 hover:border-black/25 hover:text-black/75",
                        )}
                    >
                        Filters
                        {activeTab === "solutions" && selectedProducts.length > 0 && (
                            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#0095FF] text-[9px] font-bold text-white">
                                {selectedProducts.length}
                            </span>
                        )}
                        <ChevronUp className={cn("h-3.5 w-3.5 transition-transform", showFilters && "rotate-180")} />
                    </button>

                    {/* Solutions tab */}
                    <button
                        type="button"
                        onClick={() => setActiveTabAction("solutions")}
                        className={cn(
                            `${MONO} flex h-11 shrink-0 items-center gap-2 rounded-[6px] border px-5 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors`,
                            activeTab === "solutions"
                                ? "border-[#1A1814] bg-[#1A1814] text-white"
                                : "border-black/[0.14] bg-[#EEECE4] text-black/55 hover:border-black/25 hover:text-black/75",
                        )}
                    >
                        Solutions
                    </button>

                    {/* Products tab */}
                    <button
                        type="button"
                        onClick={() => setActiveTabAction("products")}
                        className={cn(
                            `${MONO} flex h-11 shrink-0 items-center gap-2 rounded-[6px] border px-5 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors`,
                            activeTab === "products"
                                ? "border-[#1A1814] bg-[#1A1814] text-white"
                                : "border-black/[0.14] bg-[#EEECE4] text-black/55 hover:border-black/25 hover:text-black/75",
                        )}
                    >
                        Products
                    </button>

                    {/* Filter dropdown */}
                    {showFilters && activeTab === "solutions" && (
                        <div className="absolute right-0 top-[52px] z-20 w-full max-w-[380px] rounded-[6px] border border-black/[0.14] bg-[#1A1814] p-4 shadow-[0_14px_40px_rgba(0,0,0,0.35)]">
                            <div className="mb-3 flex items-center justify-between">
                                <p className={`${MONO} text-[10px] font-semibold uppercase tracking-[0.16em] text-white/50`}>
                                    Filter by product
                                </p>
                                <button
                                    type="button"
                                    onClick={() => setSelectedProducts([])}
                                    className={`${MONO} text-[10px] uppercase tracking-[0.10em] text-white/40 hover:text-white/70`}
                                >
                                    Clear all
                                </button>
                            </div>
                            <div className="grid grid-cols-2 gap-1.5">
                                {PRODUCT_FILTERS.map((product) => {
                                    const selected = selectedProducts.includes(product);
                                    return (
                                        <button
                                            key={product}
                                            type="button"
                                            onClick={() => toggleProduct(product)}
                                            className={cn(
                                                `${MONO} h-8 rounded-[4px] border px-2 text-left text-[10px] uppercase tracking-[0.08em] transition-colors`,
                                                selected
                                                    ? "border-[#0095FF] bg-[#0095FF]/[0.15] text-white"
                                                    : "border-white/[0.10] text-white/50 hover:border-white/25 hover:text-white/70",
                                            )}
                                        >
                                            {product}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Active filter pills */}
                {activeTab === "solutions" && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className={`${MONO} mr-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-black/35`}>
                            Filter:
                        </span>
                        {PRODUCT_FILTERS.map((item) => {
                            const selected = selectedProducts.includes(item);
                            return (
                                <button
                                    key={item}
                                    type="button"
                                    onClick={() => toggleProduct(item)}
                                    className={cn(
                                        `${MONO} h-7 rounded-[3px] border px-2.5 text-[9px] uppercase tracking-[0.10em] transition-colors`,
                                        selected
                                            ? "border-[#0066B3] bg-[#0066B3]/[0.10] text-[#0066B3]"
                                            : "border-black/[0.10] text-black/40 hover:border-black/[0.20] hover:text-black/60",
                                    )}
                                >
                                    {item}
                                </button>
                            );
                        })}
                        {selectedProducts.length > 0 && (
                            <button
                                type="button"
                                onClick={() => setSelectedProducts([])}
                                className={`${MONO} ml-1 text-[9px] uppercase tracking-[0.10em] text-black/35 underline underline-offset-2 hover:text-black/60`}
                            >
                                Reset
                            </button>
                        )}
                    </div>
                )}

                {/* Divider */}
                <div className="my-6 h-px w-full bg-black/[0.08]" />

                {/* Cards grid */}
                {activeTab === "solutions" ? (
                    filteredCards.length > 0 ? (
                        <div className="grid gap-4 md:grid-cols-2 lg:gap-5">
                            {filteredCards.map((card) => (
                                <SolutionCard key={card.title} card={card} />
                            ))}
                        </div>
                    ) : (
                        <div className={`${MONO} rounded-[8px] border border-black/[0.08] bg-[#EEECE4] p-10 text-center text-[11px] uppercase tracking-[0.14em] text-black/35`}>
                            No matching solutions — try another keyword or reset filters.
                        </div>
                    )
                ) : (
                    <div className="grid gap-4 md:grid-cols-2 lg:gap-5">
                        {PRODUCT_CARDS.map((card) => (
                            <ProductCard key={card.title} card={card} />
                        ))}
                    </div>
                )}
            </Container>
        </section>
    );
}
