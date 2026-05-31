"use client";

import { ArrowRight, Check } from "lucide-react";

import { Container } from "@/components/ui/container";
import { AuthAwareServiceCta } from "@/components/services/auth-aware-service-cta";
import type { StorageCategory } from "@/lib/helpers/storage-categories";

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

const INCLUDED = [
    "Versioning",
    "Lifecycle rules",
    "AES-256 encryption",
    "Free CDN cache egress",
    "IAM + per-object ACLs",
    "S3-compatible API",
];

interface ObjectStoragePricingSectionProps {
    categories?: StorageCategory[];
}

export default function ObjectStoragePricingSection(_: ObjectStoragePricingSectionProps) {
    return (
        <section className="relative overflow-hidden bg-[#E6E4DC] py-20 text-[#1A1814] sm:py-24 lg:py-28">
            <Container>
                {/* Header */}
                <div className="mx-auto max-w-[720px] text-center">
                    <p
                        className={`${MONO} mb-5 inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-black/55`}
                    >
                        <span className="h-1.5 w-1.5 rounded-full bg-[#0095FF]" />
                        Pricing
                    </p>
                    <h2 className="text-3xl font-semibold leading-[1.05] tracking-[-0.02em] text-black sm:text-4xl lg:text-[46px]">
                        <span className="text-[#0095FF]">$5</span> a month.{" "}<span className="text-[#0095FF]">250 GB</span> to start.
                    </h2>
                    <p className="mx-auto mt-5 max-w-[560px] text-[15px] leading-[1.6] text-black/65 sm:text-[16px]">
                        One plan. One price. Grow per GB only when you actually need to.
                    </p>
                </div>

                {/* Pricing card */}
                <article className="mx-auto mt-12 max-w-[760px] overflow-hidden rounded-[10px] border border-black/10 bg-[#EEECE4]">
                    <div className="grid grid-cols-1 sm:grid-cols-[1.1fr_1fr]">
                        {/* Base price */}
                        <div className="flex flex-col gap-3 border-b border-black/10 p-7 sm:border-b-0 sm:border-r sm:p-9">
                            <span
                                className={`${MONO} text-[10.5px] font-semibold uppercase tracking-[0.18em] text-black/50`}
                            >
                                Base
                            </span>
                            <div className="flex items-end gap-1">
                                <span
                                    className={`${MONO} text-[64px] font-bold leading-none tabular-nums text-black sm:text-[80px]`}
                                >
                                    $5
                                </span>
                                <span className="mb-2 text-[14px] text-black/55">
                                    / month
                                </span>
                            </div>
                            <p className="text-[14px] leading-[1.5] text-black/65">
                                Includes <span className="font-semibold text-black">250 GB</span> of storage and <span className="font-semibold text-black">250 GB</span> of egress.
                            </p>
                        </div>

                        {/* Overage */}
                        <div className="flex flex-col gap-3 p-7 sm:p-9">
                            <span
                                className={`${MONO} text-[10.5px] font-semibold uppercase tracking-[0.18em] text-black/50`}
                            >
                                Beyond that
                            </span>
                            <div className="flex items-end gap-1">
                                <span
                                    className={`${MONO} text-[44px] font-bold leading-none tabular-nums text-black sm:text-[52px]`}
                                >
                                    $0.01
                                </span>
                                <span className="mb-1.5 text-[13px] text-black/55">
                                    / GB · month
                                </span>
                            </div>
                            <p className="text-[14px] leading-[1.5] text-black/65">
                                Per-GB overage, billed only on what you exceed. No tiers, no commitments.
                            </p>
                        </div>
                    </div>

                    {/* CTA row */}
                    <div className="flex flex-col items-stretch gap-3 border-t border-black/10 bg-[#E2E0D7] px-7 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-9">
                        <p className={`${MONO} text-[11px] uppercase tracking-[0.16em] text-black/55`}>
                            No credit card required to start
                        </p>
                        <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
                            <a
                                href="/contact"
                                className={`${MONO} inline-flex h-10 items-center justify-center gap-1.5 rounded-[5px] border border-black/15 bg-transparent px-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-black/80 transition-colors hover:border-black/35 hover:bg-black/[0.04] hover:text-black`}
                            >
                                Talk to sales
                                <ArrowRight className="h-3.5 w-3.5" />
                            </a>
                            <AuthAwareServiceCta
                                service="object-storage"
                                intent="main"
                                className={`${MONO} inline-flex h-10 items-center justify-center gap-1.5 rounded-[5px] border border-black bg-black px-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#0095FF] hover:border-[#0095FF]`}
                            >
                                <span className="flex items-center gap-1.5">
                                    Get started
                                    <ArrowRight className="h-3.5 w-3.5" />
                                </span>
                            </AuthAwareServiceCta>
                        </div>
                    </div>
                </article>

                {/* Included with every bucket */}
                <div className="mx-auto mt-8 max-w-[760px] rounded-[10px] border border-black/10 bg-[#EEECE4] p-6 sm:p-7">
                    <p
                        className={`${MONO} text-[10.5px] font-semibold uppercase tracking-[0.18em] text-black/55`}
                    >
                        Included with every bucket
                    </p>
                    <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-[6px] border border-black/10 bg-black/10 sm:grid-cols-3">
                        {INCLUDED.map((feat) => (
                            <div
                                key={feat}
                                className="flex items-center gap-2 bg-[#EEECE4] px-3 py-3 text-[12.5px] text-black/75"
                            >
                                <Check
                                    className="h-3.5 w-3.5 shrink-0 text-black/55"
                                    strokeWidth={2.4}
                                />
                                {feat}
                            </div>
                        ))}
                    </div>
                </div>
            </Container>
        </section>
    );
}
