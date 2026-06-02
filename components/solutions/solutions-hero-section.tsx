import Image from "next/image";
import { assetUrl } from "@/lib/asset-url";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Container } from "@/components/ui/container";
import { ACCENT_FONT, Aurora, Eclipse } from "@/components/brand/atmosphere";

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

const TAGS = [
    "Compute · General Purpose",
    "GPU Instances · Accelerated",
    "Security · Protect apps & data",
    "Database · Managed",
    "Kubernetes · Orchestration",
    "Object Storage · S3 compatible",
];

export function SolutionsHeroSection() {
    return (
        <section className="relative isolate min-h-screen overflow-hidden bg-[#0D0D0F] pt-[96px]">
            <Aurora intensity="medium" />
            <Eclipse position="top-right" size={800} intensity={0.10} blur={100} />

            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-[0.025]"
                style={{
                    backgroundImage:
                        "radial-gradient(circle at 1px 1px, rgba(255,255,255,1) 1px, transparent 0)",
                    backgroundSize: "28px 28px",
                }}
            />

            <Container className="relative z-10">
                <div className="grid min-h-[calc(100vh-96px)] items-center gap-10 py-16 lg:grid-cols-2 lg:gap-0 lg:py-0">
                    {/* Left: copy */}
                    <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
                        <p className={`${MONO} mb-5 inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-white/50`}>
                            <span className="h-1.5 w-1.5 rounded-full bg-[#0095FF]" />
                            Solutions catalog
                        </p>

                        <h1 className="max-w-[570px] text-[clamp(2rem,3vw,3.5rem)] font-semibold leading-[1.08] tracking-[-0.02em] text-white">
                            All solutions for building, scaling, and{" "}
                            <span style={ACCENT_FONT} className="text-[#82adfb]">
                                securing modern apps.
                            </span>
                        </h1>

                        <p className="mt-5 max-w-[520px] text-[15px] leading-[1.65] text-white/55 sm:text-[16px]">
                            Browse solution categories and match them to core products like Compute, GPUs, Managed Databases, Kubernetes, Object Storage, and Security.
                        </p>

                        <div className="mt-7 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
                            <Link
                                href="/contact"
                                className={`${MONO} inline-flex h-11 items-center gap-1.5 rounded-[5px] bg-white px-6 text-[11px] font-semibold uppercase tracking-[0.14em] text-black transition-colors hover:bg-white/90`}
                            >
                                Contact sales
                                <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                            <Link
                                href="/docs"
                                className={`${MONO} inline-flex h-11 items-center gap-1.5 rounded-[5px] border border-white/[0.14] bg-transparent px-6 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/75 transition-colors hover:border-white/35 hover:bg-white/[0.04] hover:text-white`}
                            >
                                Talk to an expert
                            </Link>
                        </div>

                        <p className={`${MONO} mt-5 text-[10.5px] uppercase tracking-[0.18em] text-white/30`}>
                            Typical response:{" "}
                            <span className="text-white/50">same business day</span>
                        </p>

                        {/* Tag chips */}
                        <div className="mt-9 flex flex-col gap-2 w-full max-w-[500px]">
                            {TAGS.map((tag) => (
                                <div
                                    key={tag}
                                    className={`${MONO} inline-flex h-9 w-full items-center gap-2 rounded-[4px] border border-white/[0.10] bg-white/[0.03] px-3 text-[10.5px] uppercase tracking-[0.10em] text-white/55`}
                                >
                                    <span className="h-1 w-1 shrink-0 rounded-full bg-[#0095FF]" />
                                    {tag}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Right: illustration */}
                    <div className="relative flex items-center justify-center lg:justify-end lg:h-full">
                        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[60%] w-[60%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(0,149,255,0.18)_0%,rgba(0,149,255,0.05)_50%,transparent_75%)] blur-[32px]" />
                        <div className="relative mx-auto h-[clamp(280px,40vw,540px)] w-[clamp(280px,40vw,540px)] max-w-[540px]">
                            <Image
                                src={assetUrl("/solution/solution-hero-bulb-idea.svg")}
                                alt="Solutions illustration"
                                fill
                                priority
                                className="object-contain"
                            />
                        </div>
                    </div>
                </div>
            </Container>
        </section>
    );
}
