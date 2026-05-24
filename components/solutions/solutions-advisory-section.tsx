import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Container } from "@/components/ui/container";
import { ACCENT_FONT, Eclipse } from "@/components/brand/atmosphere";
import { CoreProductsPanel } from "./core-products-panel";

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

const SOLUTIONS = [
    {
        icon: "/solution/secondsection/AI.svg",
        title: "AI & Machine Learning",
        subtitle: "Train & Deploy Models",
        href: "/solutions/ai-ml",
    },
    {
        icon: "/solution/secondsection/Monitor.svg",
        title: "Web Hosting & SaaS",
        subtitle: "Modern Web Apps",
        href: "/solutions/web-hosting",
    },
    {
        icon: "/solution/secondsection/Shopping%20Bag.svg",
        title: "Ecommerce Infrastructure",
        subtitle: "Scalable Storefronts",
        href: "/solutions/ecommerce",
    },
    {
        icon: "/solution/secondsection/Game%20Controller.svg",
        title: "Game Development",
        subtitle: "Low-Latency Servers",
        href: "/solutions/game-dev",
    },
    {
        icon: "/solution/secondsection/Database.svg",
        title: "Database Applications",
        subtitle: "Data-Heavy Apps",
        href: "/solutions/database",
    },
    {
        icon: "/solution/secondsection/Protect.svg",
        title: "Enterprise Security",
        subtitle: "Compliance & Governance",
        href: "/solutions/security",
    },
    {
        icon: "/solution/secondsection/Kubernetes.svg",
        title: "Cloud-Native Kubernetes",
        subtitle: "Microservices Platform",
        href: "/solutions/kubernetes",
    },
    {
        icon: "/solution/secondsection/Stack.svg",
        title: "Storage & Backup",
        subtitle: "Durable Object Storage",
        href: "/solutions/storage",
    },
];

function SolutionsOverviewPanel() {
    return (
        <section className="relative bg-[#0D0D0F] py-16 sm:py-20">
            <div aria-hidden className="absolute top-0 left-1/2 h-px w-[60%] -translate-x-1/2 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />

            <Container>
                <div className="mb-10">
                    <p className={`${MONO} mb-4 inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-white/50`}>
                        <span className="h-1.5 w-1.5 rounded-full bg-[#0095FF]" />
                        All solutions
                    </p>
                    <h2 className="text-[26px] font-semibold leading-[1.15] tracking-[-0.02em] text-white sm:text-[30px]">
                        Purpose-built for every use case.
                    </h2>
                    <p className="mt-3 max-w-[540px] text-[13.5px] leading-[1.6] text-white/55">
                        Architecture patterns combining multiple products to solve specific workloads.
                    </p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {SOLUTIONS.map((solution) => (
                        <Link
                            key={solution.title}
                            href={solution.href}
                            className="group flex items-center gap-3 rounded-[8px] border border-white/[0.10] bg-[#111316] p-4 transition-colors hover:border-white/[0.22] hover:bg-[#13161B]"
                        >
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] border border-white/[0.10] bg-white/[0.04]">
                                <Image src={solution.icon} alt="" width={18} height={18} className="opacity-75" />
                            </div>
                            <div className="min-w-0">
                                <p className="truncate text-[13px] font-semibold leading-[1.2] text-white">
                                    {solution.title}
                                </p>
                                <p className={`${MONO} mt-0.5 truncate text-[9px] uppercase tracking-[0.10em] text-white/40`}>
                                    {solution.subtitle}
                                </p>
                            </div>
                            <ArrowRight className="ml-auto h-3.5 w-3.5 shrink-0 text-white/20 transition-colors group-hover:text-[#0095FF]" />
                        </Link>
                    ))}
                </div>
            </Container>
        </section>
    );
}

function AdvisoryPanel() {
    return (
        <section className="relative overflow-hidden bg-[#0D0D0F] py-16 pb-20 sm:py-20 sm:pb-24">
            <div aria-hidden className="absolute top-0 left-1/2 h-px w-[60%] -translate-x-1/2 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            <Eclipse position="top-right" size={600} intensity={0.10} color="#0095FF" blur={80} />

            <Container className="relative z-10">
                <div className="mx-auto max-w-[920px] overflow-hidden rounded-[12px] border border-white/[0.10] bg-[#111316] p-10 sm:p-12 lg:p-14">
                    <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#0095FF]/[0.06] blur-3xl" />

                    <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-center lg:gap-14">
                        <div>
                            <p className={`${MONO} mb-4 inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-white/50`}>
                                <span className="h-1.5 w-1.5 rounded-full bg-[#0095FF]" />
                                Expert guidance
                            </p>
                            <h2 className="text-3xl font-semibold leading-[1.05] tracking-[-0.02em] text-white sm:text-4xl lg:text-[42px]">
                                Not sure which{" "}
                                <span style={ACCENT_FONT} className="text-[#82adfb]">
                                    solution fits?
                                </span>
                            </h2>
                            <p className="mt-4 max-w-[440px] text-[14.5px] leading-[1.6] text-white/60">
                                Share your goals — traffic, data size, latency, compliance — and we&apos;ll suggest a practical architecture using the right mix of products.
                            </p>
                            <ul className={`${MONO} mt-6 space-y-2 text-[11px] uppercase tracking-[0.12em] text-white/45`}>
                                {["Architecture review", "Custom quotes", "Migration support", "24/7 expert help"].map((item) => (
                                    <li key={item} className="flex items-center gap-2">
                                        <span className="h-1 w-1 rounded-full bg-[#0095FF]" />
                                        {item}
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className="flex flex-col gap-3">
                            <Link
                                href="/contact"
                                className={`${MONO} inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-[5px] border border-white bg-white text-[11px] font-semibold uppercase tracking-[0.14em] text-black transition-colors hover:bg-white/90`}
                            >
                                Contact sales
                                <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                            <Link
                                href="/docs"
                                className={`${MONO} inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-[5px] border border-white/[0.14] bg-transparent text-[11px] font-semibold uppercase tracking-[0.14em] text-white/75 transition-colors hover:border-white/35 hover:bg-white/[0.04] hover:text-white`}
                            >
                                Request a demo
                            </Link>
                        </div>
                    </div>
                </div>
            </Container>
        </section>
    );
}

export function SolutionsAdvisorySection({ activeTab }: { activeTab: "solutions" | "products" }) {
    return (
        <>
            {activeTab === "solutions" ? <CoreProductsPanel /> : <SolutionsOverviewPanel />}
            <AdvisoryPanel />
        </>
    );
}
