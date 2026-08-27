import Link from "next/link";
import {
    ArrowRight,
    Cpu,
    HardDrive,
    MemoryStick,
    Network,
    Shield,
    Zap,
    type LucideIcon,
} from "lucide-react";

import { Container } from "@/components/ui/container";
import { AuthAwareServiceCta } from "@/components/services/auth-aware-service-cta";
import { BARE_METAL_SKUS } from "@/lib/catalog/bare-metal";

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

type Spec = {
    icon: LucideIcon;
    label: string;
    detail?: string;
};

type Server = {
    id: string;
    badge: string;
    title: string;
    subtitle: string;
    processor: "Intel" | "AMD";
    specs: Spec[];
    price: number;
    useCase: string;
    featured?: boolean;
};

// Editorial framing only — which three machines to feature and how to pitch
// them. Specs and price come from lib/catalog/bare-metal, the same lineup the
// dashboard lists.
//
// This used to restate both, and the two had drifted apart badly: the Xeon
// E-2388G was advertised at $99 against the dashboard's $199, and the EPYC 9354
// at $549 against $1090. A visitor read one number here and found another once
// signed in.
const FEATURED: Array<{ skuId: string; badge: string; subtitle: string; useCase: string; featured?: boolean }> = [
    {
        skuId: "bm-xeon-e2388g",
        badge: "Starter",
        subtitle: "Entry-tier production",
        useCase:
            "Web and app tiers, single-instance Postgres or MySQL, CI runners, and lightweight Kubernetes nodes.",
    },
    {
        skuId: "bm-ryzen-hf",
        badge: "Most popular",
        subtitle: "High-clock production",
        featured: true,
        useCase:
            "Latency-sensitive APIs, game servers, and build farms that reward single-thread speed.",
    },
    {
        skuId: "bm-epyc-9354",
        badge: "Enterprise",
        subtitle: "Scale-out enterprise",
        useCase:
            "Dense virtualization, large in-memory datasets, and multi-tenant platforms.",
    },
];

const SERVERS: Server[] = FEATURED.flatMap((f, idx) => {
    const sku = BARE_METAL_SKUS.find((s) => s.id === f.skuId);
    if (!sku) return [];
    return [{
        id: String(idx + 1).padStart(2, "0"),
        badge: f.badge,
        title: sku.cpu.model,
        subtitle: f.subtitle,
        processor: sku.vendor === "amd" ? "AMD" : "Intel",
        specs: [
            { icon: Cpu, label: `${sku.cpu.cores} cores / ${sku.cpu.threads} threads`, detail: `Boost ${sku.cpu.boostGhz} GHz` },
            { icon: MemoryStick, label: `${sku.ramGb} GB ${sku.ramType}` },
            { icon: HardDrive, label: sku.storage },
            { icon: Network, label: `${sku.uplinkGbps} Gbps uplink`, detail: sku.bandwidth },
        ],
        price: sku.priceMonthly,
        useCase: f.useCase,
        featured: f.featured,
    }];
});

const PLATFORM_HIGHLIGHTS: Array<{ icon: LucideIcon; text: string }> = [
    { icon: Zap, text: "Provisioned in 30 minutes" },
    { icon: Shield, text: "IPMI + BMC out-of-band" },
    { icon: HardDrive, text: "Hardware RAID + custom OS" },
];

function ServerCard({ server, index }: { server: Server; index: number }) {
    const isFeatured = !!server.featured;
    return (
        <article
            className={`group relative flex flex-col rounded-[8px] border p-7 transition-all duration-300 hover:-translate-y-1 hover:border-[#0095FF] hover:shadow-[0_8px_24px_rgba(0,0,0,0.5)] ${
                isFeatured
                    ? "border-white/[0.10] bg-[#13161B] hover:bg-[#161A1F]"
                    : "border-white/[0.10] bg-[#111316] hover:bg-[#161A1F]"
            }`}
            style={{
                boxShadow: isFeatured
                    ? "inset 0 1px 0 rgba(255,255,255,0.07), 0 12px 32px -12px rgba(0,0,0,0.75)"
                    : "inset 0 1px 0 rgba(255,255,255,0.05), 0 10px 28px -12px rgba(0,0,0,0.65)",
            }}
        >

            {/* Header — index + badge */}
            <div className="flex items-center gap-3">
                <span className={`${MONO} text-[10.5px] tabular-nums text-white/30`}>
                    {String(index + 1).padStart(2, "0")}
                </span>
                <span
                    className={`${MONO} inline-flex items-center rounded-[3px] border px-2 py-0.5 text-[9.5px] uppercase tracking-[0.14em] ${
                        isFeatured
                            ? "border-white/[0.18] bg-white/[0.05] text-white/80"
                            : "border-white/[0.10] bg-white/[0.03] text-white/55"
                    }`}
                >
                    {server.badge}
                </span>
            </div>

            {/* Title */}
            <div className="mt-6">
                <h3 className="text-[19px] font-semibold leading-tight tracking-[-0.005em] text-white">
                    {server.title}
                </h3>
                <p
                    className={`${MONO} mt-1.5 text-[10.5px] uppercase tracking-[0.16em] text-white/45`}
                >
                    {server.subtitle}
                </p>
            </div>

            {/* Specs */}
            <ul className="mt-6 space-y-3 flex-1">
                {server.specs.map((spec) => {
                    const Icon = spec.icon;
                    return (
                        <li key={spec.label} className="flex items-center gap-3">
                            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[5px] border border-white/[0.08] bg-white/[0.03] text-white/75">
                                <Icon className="h-3.5 w-3.5" strokeWidth={1.7} />
                            </span>
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                <span className="text-[13px] font-medium text-white/85">
                                    {spec.label}
                                </span>
                                {spec.detail && (
                                    <span
                                        className={`${MONO} text-[10.5px] uppercase tracking-[0.12em] text-white/40`}
                                    >
                                        {spec.detail}
                                    </span>
                                )}
                            </div>
                        </li>
                    );
                })}
            </ul>

            {/* Use case */}
            <p className="mt-6 border-t border-white/[0.06] pt-4 text-[12.5px] leading-[1.6] text-white/55">
                {server.useCase}
            </p>

            {/* Price + CTA */}
            <div className="mt-5 flex flex-col items-stretch gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p
                        className={`${MONO} text-[9.5px] font-semibold uppercase tracking-[0.22em] text-white/45`}
                    >
                        From
                    </p>
                    <p className={`${MONO} mt-1 text-[26px] font-bold leading-none tabular-nums text-white`}>
                        ${server.price}
                        <span className="ml-1 text-[11px] font-normal text-white/55">
                            /mo
                        </span>
                    </p>
                </div>
                <AuthAwareServiceCta
                    service="compute"
                    intent="new"
                    className={`${MONO} inline-flex h-10 items-center justify-center gap-1.5 border border-white/25 bg-transparent px-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-white transition-colors hover:border-white hover:bg-white hover:text-black active:border-white active:bg-white active:text-black`}
                >
                    Configure
                    <ArrowRight className="h-3.5 w-3.5" />
                </AuthAwareServiceCta>
            </div>
        </article>
    );
}

const ComputeReleaseSection = () => {
    return (
        <section className="relative w-full overflow-hidden bg-[#0D0D0F] py-16 lg:py-24">
            {/* Top hairline */}
            <div
                aria-hidden="true"
                className="absolute top-0 left-1/2 h-px w-[60%] -translate-x-1/2 bg-gradient-to-r from-transparent via-white/10 to-transparent"
            />

            <Container className="relative z-10">
                {/* Header */}
                <div className="mx-auto max-w-[760px] text-center">
                    <h2 className="text-3xl font-[400] leading-[1.05] tracking-tight text-white sm:text-4xl lg:text-[3.4rem]">
                        Dedicated hardware, on tap
                    </h2>
                    <p className="mx-auto mt-5 max-w-[620px] text-[15px] leading-[1.6] text-white/60 sm:text-[16px]">
                        Whole-machine performance without the hypervisor tax —
                        racked in minutes, billed monthly.
                    </p>

                    {/* Platform highlight chips */}
                    <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2.5">
                        {PLATFORM_HIGHLIGHTS.map(({ icon: Icon, text }) => (
                            <span
                                key={text}
                                className={`${MONO} inline-flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.18em] text-white/65`}
                            >
                                <Icon
                                    className="h-3.5 w-3.5 text-white/50"
                                    strokeWidth={1.7}
                                />
                                {text}
                            </span>
                        ))}
                    </div>
                </div>

                {/* Server Cards */}
                <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3 lg:gap-5">
                    {SERVERS.map((server, i) => (
                        <ServerCard key={server.id} server={server} index={i} />
                    ))}
                </div>

                {/* Footer — view all + needs-help line */}
                <div className="mt-12 flex flex-col items-center justify-center gap-3 border-t border-white/[0.08] pt-8 sm:flex-row sm:gap-5">
                    <p
                        className={`${MONO} text-[10.5px] uppercase tracking-[0.18em] text-white/45`}
                    >
                        Need a custom configuration?
                    </p>
                    <Link
                        href="/services/compute#pricing"
                        className={`${MONO} group inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:text-[#0095FF]`}
                    >
                        Browse all server SKUs
                        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                </div>
            </Container>
        </section>
    );
};

export default ComputeReleaseSection;
