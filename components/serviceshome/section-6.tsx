import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";

import { ACCENT_FONT, Aurora } from "@/components/brand/atmosphere";

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

export type UseCase = {
    title: string;
    description: string;
    /** Optional lucide icon component — falls back to no icon if omitted */
    icon?: LucideIcon;
    /** Pre-instantiated icon node (e.g. Tabler filled icon) — takes precedence over icon */
    iconNode?: React.ReactNode;
    /** Accent colour for the icon container */
    accent?: string;
    /** Optional small metric / tag shown above the title */
    metric?: string;
};

type SectionProps = {
    cases: UseCase[];
    /** Override the eyebrow label (default: "Use cases") */
    eyebrow?: string;
    /** Override the heading (default: "Built for your needs") */
    heading?: string;
    /** Last 2-3 words rendered in Nunito display + brand-blue accent. */
    headingAccent?: string;
    /** Override the subtitle (default: short copy) */
    subtitle?: string;
    /** Hide the thin top divider line */
    hideTopDivider?: boolean;
};

function UseCaseCard({ item, index }: { item: UseCase; index: number }) {
    const Icon = item.icon;
    const hasIcon = !!(item.iconNode ?? item.icon);
    const accent = item.accent;

    return (
        <article
            className="group relative flex flex-col gap-5 overflow-hidden rounded-[8px] border border-white/[0.10] bg-[#111316] p-7 transition-all duration-300 hover:-translate-y-1 hover:border-[#0095FF] hover:bg-[#161A1F] hover:shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
            style={{
                boxShadow:
                    "inset 0 1px 0 rgba(255,255,255,0.05), 0 10px 28px -12px rgba(0,0,0,0.7)",
            }}
        >
            {/* Accent hover glow */}
            {accent && (
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                    style={{ background: `radial-gradient(circle at 30% 0%, ${accent}10, transparent 60%)` }}
                />
            )}

            {/* Top — icon + index */}
            <div className="relative flex items-start justify-between">
                {hasIcon ? (
                    <div
                        className="inline-flex h-11 w-11 items-center justify-center rounded-[6px] border transition-all"
                        style={accent
                            ? { background: `${accent}18`, borderColor: `${accent}40`, color: accent }
                            : { borderColor: "rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.8)" }
                        }
                    >
                        {item.iconNode ?? (Icon ? <Icon className="h-5 w-5" strokeWidth={1.6} /> : null)}
                    </div>
                ) : (
                    <div className="h-11 w-11" aria-hidden="true" />
                )}
                <span
                    className={`${MONO} text-[10.5px] tabular-nums`}
                    style={{ color: accent ? `${accent}60` : "rgba(255,255,255,0.3)" }}
                >
                    {String(index + 1).padStart(2, "0")}
                </span>
            </div>

            {/* Body */}
            <div className="relative">
                {item.metric && (
                    <p
                        className={`${MONO} mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45`}
                    >
                        {item.metric}
                    </p>
                )}
                <h3 className="text-[17px] font-semibold leading-[1.3] tracking-[-0.005em] text-white">
                    {item.title}
                </h3>
                <p className="mt-2.5 text-[13.5px] leading-[1.6] text-white/65">
                    {item.description}
                </p>
            </div>
        </article>
    );
}

const ServicesHomeSectionSix = ({
    cases,
    eyebrow = "Use cases",
    heading = "Built for your needs",
    headingAccent,
    subtitle = "Four common workloads our customers ship into production every day — backed by the same primitives, SLAs, and support.",
    hideTopDivider = false,
}: SectionProps) => {
    return (
        <section className="relative overflow-hidden bg-[#0D0D0F] py-16 sm:py-20 lg:py-24">
            {!hideTopDivider && (
                <div
                    aria-hidden="true"
                    className="absolute top-0 left-1/2 h-px w-[60%] -translate-x-1/2 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                />
            )}

            <Aurora intensity="soft" />

            <div className="relative z-10 mx-auto w-full max-w-[1280px] px-6 lg:px-12">
                <div className="mx-auto max-w-[760px] text-center">
                    <p
                        className={`${MONO} mb-5 inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-white/50`}
                    >
                        <span className="h-1.5 w-1.5 rounded-full bg-[#0095FF]" />
                        {eyebrow}
                    </p>
                    <h2 className="text-3xl font-semibold leading-[1.05] tracking-[-0.02em] text-white sm:text-4xl lg:text-[48px]">
                        {heading}
                        {headingAccent && (
                            <>
                                {" "}
                                <span style={ACCENT_FONT} className="text-[#0095FF]">
                                    {headingAccent}
                                </span>
                            </>
                        )}
                    </h2>
                    <p className="mx-auto mt-5 max-w-[600px] text-[15px] leading-[1.6] text-white/60 sm:text-[16px]">
                        {subtitle}
                    </p>
                </div>

                {/* 2x2 symmetric grid */}
                <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2 lg:gap-5">
                    {cases.map((item, i) => (
                        <UseCaseCard key={item.title} item={item} index={i} />
                    ))}
                </div>

                {/* Footer CTA */}
                <div className="mt-12 flex flex-col items-center justify-center gap-3 border-t border-white/[0.08] pt-8 sm:flex-row sm:gap-5">
                    <p
                        className={`${MONO} text-[10.5px] uppercase tracking-[0.18em] text-white/45`}
                    >
                        Building something else?
                    </p>
                    <Link
                        href="/contact"
                        className={`${MONO} group inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:text-[#0095FF]`}
                    >
                        Talk to our solutions team
                        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                </div>
            </div>
        </section>
    );
};

export default ServicesHomeSectionSix;
