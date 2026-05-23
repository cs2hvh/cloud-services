import { Container } from "@/components/ui/container";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { ACCENT_FONT, Aurora, Eclipse } from "@/components/brand/atmosphere";

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

/* ──────────────────────────────────────────────────────────────
   Custom 32×32 product glyphs — layered, blue-accent fills
   ────────────────────────────────────────────────────────────── */

function ComputeGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            <rect x="4" y="5" width="24" height="8" rx="1.5" fill="currentColor" fillOpacity="0.08" />
            <rect x="4" y="19" width="24" height="8" rx="1.5" fill="#0095FF" fillOpacity="0.18" stroke="#0095FF" />
            <circle cx="7" cy="9" r="0.9" fill="currentColor" />
            <circle cx="7" cy="23" r="0.9" fill="#0095FF" />
            <path d="M11 9h14M11 23h14" strokeOpacity="0.5" />
            <rect x="24.5" y="7" width="2" height="4" rx="0.4" fill="currentColor" fillOpacity="0.5" />
        </svg>
    );
}

function GpuGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            <rect x="3" y="9" width="13" height="14" rx="1.2" fill="#0095FF" fillOpacity="0.20" stroke="#0095FF" />
            <rect x="16" y="9" width="13" height="14" rx="1.2" fill="currentColor" fillOpacity="0.15" />
            <circle cx="6.5" cy="13" r="0.7" fill="#0095FF" />
            <circle cx="6.5" cy="16" r="0.7" fill="#0095FF" />
            <circle cx="6.5" cy="19" r="0.7" fill="#0095FF" />
            <circle cx="19.5" cy="13" r="0.7" fill="currentColor" />
            <circle cx="19.5" cy="16" r="0.7" fill="currentColor" />
            <circle cx="19.5" cy="19" r="0.7" fill="currentColor" />
            <path d="M9 9V6M22 9V6M9 23v3M22 23v3" strokeOpacity="0.4" />
        </svg>
    );
}

function DatabaseGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            <ellipse cx="16" cy="6" rx="10" ry="2.4" fill="currentColor" fillOpacity="0.10" />
            <path d="M6 6v6c0 1.4 4.5 2.5 10 2.5s10-1.1 10-2.5V6" />
            <path d="M6 12v6c0 1.4 4.5 2.5 10 2.5s10-1.1 10-2.5v-6" />
            <path d="M6 18v6c0 1.4 4.5 2.5 10 2.5s10-1.1 10-2.5v-6" />
            <circle cx="22" cy="11" r="0.9" fill="#0095FF" />
            <circle cx="22" cy="17" r="0.9" fill="#0095FF" />
            <circle cx="22" cy="23" r="0.9" fill="#0095FF" />
        </svg>
    );
}

function K8sGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3} strokeLinejoin="round">
            <path d="M16 3l11 5.5v13L16 28.5 5 21.5v-13L16 3z" fill="currentColor" fillOpacity="0.08" />
            <path d="M16 10v12M10 13l12 6M22 13l-12 6" strokeOpacity="0.55" strokeLinecap="round" />
            <circle cx="16" cy="16" r="2.2" fill="#0095FF" fillOpacity="0.30" stroke="#0095FF" />
        </svg>
    );
}

function BucketGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3} strokeLinejoin="round">
            <path d="M5 9h22l-2 18a1.3 1.3 0 0 1-1.3 1.2H8.3A1.3 1.3 0 0 1 7 27L5 9z" fill="currentColor" fillOpacity="0.08" />
            <path d="M5 9h22" />
            <path d="M11 9V6.5a5 5 0 0 1 10 0V9" />
            <circle cx="12" cy="17" r="1.5" fill="#0095FF" fillOpacity="0.30" stroke="#0095FF" />
            <circle cx="18" cy="22" r="1.3" fill="currentColor" fillOpacity="0.3" />
            <circle cx="22" cy="15" r="1.3" fill="currentColor" fillOpacity="0.3" />
        </svg>
    );
}

function AppDeployGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            <rect x="9" y="3" width="14" height="6" rx="1" fill="currentColor" fillOpacity="0.18" />
            <rect x="6" y="12" width="20" height="7" rx="1" fill="#0095FF" fillOpacity="0.20" stroke="#0095FF" />
            <rect x="3" y="22" width="26" height="7" rx="1" fill="currentColor" fillOpacity="0.10" />
            <circle cx="7" cy="25.5" r="0.7" fill="#0095FF" />
            <circle cx="10" cy="25.5" r="0.7" fill="currentColor" />
            <path d="M14 25.5h12" strokeOpacity="0.5" />
        </svg>
    );
}

/* ──────────────────────────────────────────────────────────────
   Product catalog
   ────────────────────────────────────────────────────────────── */

type Product = {
    title: string;
    role: string;
    description: string;
    href: string;
    tags: string[];
    glyph: React.ReactNode;
};

const PRODUCTS: Product[] = [
    {
        title: "Compute",
        role: "Servers",
        description:
            "Virtual machines, VDS, and dedicated hosts. Full root access, NVMe storage, sub-20 ms regional latency across 12 regions.",
        href: "/services/compute",
        tags: ["VPS", "Dedicated CPU", "Shared CPU", "Bare metal"],
        glyph: <ComputeGlyph />,
    },
    {
        title: "GPU Instances",
        role: "Accelerators",
        description:
            "NVIDIA GPUs for training, fine-tuning, and inference. B200, H200, H100, A100, L40S, A10 — on-demand, reserved, and spot.",
        href: "/services/gpu",
        tags: ["NVIDIA", "H100", "A100", "Training", "Inference"],
        glyph: <GpuGlyph />,
    },
    {
        title: "Managed Database",
        role: "Data plane",
        description:
            "Managed Postgres, MySQL, and Redis with HA standby, read replicas, PITR, and pgvector — on your private VPC.",
        href: "/services/database",
        tags: ["PostgreSQL", "MySQL", "Redis", "pgvector", "PITR"],
        glyph: <DatabaseGlyph />,
    },
    {
        title: "Kubernetes",
        role: "Orchestration",
        description:
            "Managed control plane, auto-scaling node pools (CPU + GPU), service mesh, GitOps — without the etcd babysitting.",
        href: "/services/kubernetes",
        tags: ["Managed CP", "Auto-scale", "Service mesh", "GitOps"],
        glyph: <K8sGlyph />,
    },
    {
        title: "Object Storage",
        role: "Storage",
        description:
            "S3-compatible object storage with lifecycle tiering, immutable backups, and CDN delivery. $5 for 250 GB, $0.01/GB after.",
        href: "/services/object-storage",
        tags: ["S3 API", "Versioning", "Lifecycle", "Object lock"],
        glyph: <BucketGlyph />,
    },
    {
        title: "Application Deployment",
        role: "Pipeline",
        description:
            "Push-to-deploy from any Git repo. Preview environments per branch, rolling deploys with health checks, auto-rollback.",
        href: "/services/app-deployment",
        tags: ["Git push", "Preview envs", "Auto-rollback", "Container"],
        glyph: <AppDeployGlyph />,
    },
];

/* ──────────────────────────────────────────────────────────────
   Page
   ────────────────────────────────────────────────────────────── */

export default function ProductsPage() {
    return (
        <main className="bg-[#0D0D0F]">
            {/* ─── Hero ──────────────────────────────────────── */}
            <section className="relative overflow-hidden bg-[#0D0D0F] py-24 sm:py-28 lg:py-32">
                <div
                    aria-hidden
                    className="absolute top-0 left-1/2 h-px w-[60%] -translate-x-1/2 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                />

                <Aurora intensity="medium" />
                <Eclipse position="center" size={820} intensity={0.10} blur={100} />

                <Container className="relative z-10">
                    <div className="mx-auto max-w-[820px] text-center">
                        <p
                            className={`${MONO} mb-6 inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-white/55`}
                        >
                            <span className="h-1.5 w-1.5 rounded-full bg-[#0095FF]" />
                            Our products
                        </p>
                        <h1 className="text-[44px] font-semibold leading-[1.04] tracking-[-0.03em] text-white sm:text-[56px] lg:text-[68px]">
                            Everything you need to{" "}
                            <span style={ACCENT_FONT} className="text-[#82adfb]">
                                build and ship.
                            </span>
                        </h1>
                        <p className="mx-auto mt-7 max-w-[600px] text-[15.5px] leading-[1.65] text-white/60 sm:text-[17px]">
                            Compute, storage, databases, Kubernetes, and app deploy —
                            one private network, one bill.
                        </p>
                    </div>
                </Container>
            </section>

            {/* ─── Products grid ─────────────────────────────── */}
            <section className="relative overflow-hidden bg-[#0D0D0F] py-20 sm:py-24 lg:py-28">
                <div
                    aria-hidden
                    className="absolute top-0 left-1/2 h-px w-[60%] -translate-x-1/2 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                />

                <Aurora intensity="soft" />

                <Container className="relative z-10">
                    <div className="mx-auto flex max-w-[1180px] flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                        <div className="max-w-[680px]">
                            <p
                                className={`${MONO} mb-5 inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-white/50`}
                            >
                                <span className="h-1.5 w-1.5 rounded-full bg-[#0095FF]" />
                                The catalog
                            </p>
                            <h2 className="text-3xl font-semibold leading-[1.05] tracking-[-0.02em] text-white sm:text-4xl lg:text-[48px]">
                                Six primitives.{" "}
                                <span style={ACCENT_FONT} className="text-[#82adfb]">
                                    One private network.
                                </span>
                            </h2>
                        </div>
                        <p className="max-w-[360px] text-[14.5px] leading-[1.65] text-white/55">
                            Pick a surface — or compose all six into the stack you need.
                        </p>
                    </div>

                    <div className="mx-auto mt-14 grid max-w-[1180px] grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                        {PRODUCTS.map((p, i) => (
                            <Link
                                key={p.href}
                                href={p.href}
                                className="group relative flex flex-col gap-5 overflow-hidden rounded-[10px] border border-white/[0.10] bg-[#0F1114] p-7 transition-colors hover:border-white/[0.22] hover:bg-[#13161B]"
                                style={{
                                    boxShadow:
                                        "inset 0 1px 0 rgba(255,255,255,0.05), 0 10px 28px -12px rgba(0,0,0,0.7)",
                                }}
                            >
                                {/* hover blue glow */}
                                <div
                                    aria-hidden
                                    className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100"
                                    style={{
                                        background:
                                            "radial-gradient(circle at 30% 0%, rgba(0,149,255,0.08), transparent 60%)",
                                    }}
                                />

                                {/* Top — icon + role pill + index */}
                                <div className="relative flex items-start justify-between">
                                    <div className="inline-flex h-12 w-12 items-center justify-center rounded-[8px] border border-white/[0.12] bg-white/[0.03] text-white/85">
                                        <div className="h-[26px] w-[26px]">{p.glyph}</div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span
                                            className={`${MONO} inline-flex items-center gap-1.5 rounded-full border border-white/[0.10] bg-white/[0.03] px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-white/55`}
                                        >
                                            <span className="h-1 w-1 rounded-full bg-[#0095FF]" />
                                            {p.role}
                                        </span>
                                        <span
                                            className={`${MONO} text-[10.5px] tabular-nums text-white/30`}
                                        >
                                            {String(i + 1).padStart(2, "0")}
                                        </span>
                                    </div>
                                </div>

                                {/* Title + description */}
                                <div className="relative">
                                    <h3 className="text-[18px] font-semibold leading-[1.25] tracking-[-0.01em] text-white transition-colors group-hover:text-[#82adfb]">
                                        {p.title}
                                    </h3>
                                    <p className="mt-2.5 text-[13px] leading-[1.6] text-white/60">
                                        {p.description}
                                    </p>
                                </div>

                                {/* Tags */}
                                <div className="relative flex flex-wrap gap-1.5">
                                    {p.tags.map((t) => (
                                        <span
                                            key={t}
                                            className={`${MONO} inline-flex items-center rounded-[3px] border border-white/[0.10] bg-white/[0.03] px-2 py-0.5 text-[10px] uppercase tracking-[0.10em] text-white/70`}
                                        >
                                            {t}
                                        </span>
                                    ))}
                                </div>

                                {/* Footer — explore link */}
                                <div
                                    className={`${MONO} relative mt-auto flex items-center gap-1.5 border-t border-white/[0.06] pt-4 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-white/65 transition-colors group-hover:text-white`}
                                >
                                    Explore {p.title}
                                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                                </div>
                            </Link>
                        ))}
                    </div>
                </Container>
            </section>
        </main>
    );
}
