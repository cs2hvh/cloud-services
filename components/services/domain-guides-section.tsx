import Link from "next/link";
import {
    ArrowRight,
    ArrowRightLeft,
    BookOpen,
    Settings,
    Sparkles,
    type LucideIcon,
} from "lucide-react";

import { Container } from "@/components/ui/container";

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

type Guide = {
    index: string;
    title: string;
    description: string;
    href: string;
    icon: LucideIcon;
};

const GUIDES: Guide[] = [
    {
        index: "01",
        title: "Domain fundamentals",
        description:
            "How registration, registries, and DNS actually work — written for engineers, not marketers.",
        href: "/signup",
        icon: BookOpen,
    },
    {
        index: "02",
        title: "Naming strategy",
        description:
            "Practical guidance for choosing names that are memorable, defensible, and available.",
        href: "/services/domain#search",
        icon: Sparkles,
    },
    {
        index: "03",
        title: "Transferring a domain",
        description:
            "Step-by-step transfer playbook with zero-downtime DNS pre-staging and rollback safeguards.",
        href: "/dashboard/domains/transfer",
        icon: ArrowRightLeft,
    },
    {
        index: "04",
        title: "Portfolio operations",
        description:
            "DNS records, DNSSEC, WHOIS privacy, registrar lock, auto-renew, and bulk management at scale.",
        href: "/dashboard/domains",
        icon: Settings,
    },
];

function GuideCard({ guide }: { guide: Guide }) {
    const Icon = guide.icon;
    return (
        <Link
            href={guide.href}
            className="group relative flex flex-col gap-5 rounded-[8px] border border-white/[0.10] bg-[#111316] p-7 transition-all duration-200 hover:-translate-y-1 hover:border-white/[0.22] hover:bg-[#161A1F]"
            style={{
                boxShadow:
                    "inset 0 1px 0 rgba(255,255,255,0.05), 0 10px 28px -12px rgba(0,0,0,0.7)",
            }}
        >
            {/* Top — index + icon */}
            <div className="flex items-start justify-between">
                <div className="h-11 w-11 inline-flex items-center justify-center rounded-[6px] border border-white/[0.12] bg-white/[0.04] text-white/80 transition-colors group-hover:border-white/[0.25] group-hover:text-white">
                    <Icon className="h-5 w-5" strokeWidth={1.6} />
                </div>
                <span
                    className={`${MONO} text-[10.5px] tabular-nums text-white/30`}
                >
                    {guide.index}
                </span>
            </div>

            {/* Title + description */}
            <div>
                <h3 className="text-[17px] font-semibold leading-[1.3] tracking-[-0.005em] text-white">
                    {guide.title}
                </h3>
                <p className="mt-2.5 text-[13.5px] leading-[1.6] text-white/65">
                    {guide.description}
                </p>
            </div>

            {/* Footer — read guide */}
            <div
                className={`${MONO} mt-auto flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/65 transition-colors group-hover:text-white`}
            >
                Read guide
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </div>
        </Link>
    );
}

export default function DomainGuidesSection() {
    return (
        <section className="relative overflow-hidden bg-[#0D0D0F] py-16 sm:py-20 lg:py-24">
            {/* Top hairline to mark the section transition */}
            <div
                aria-hidden="true"
                className="absolute top-0 left-1/2 h-px w-[60%] -translate-x-1/2 bg-gradient-to-r from-transparent via-white/10 to-transparent"
            />

            <Container className="relative z-10">
                {/* Header */}
                <div className="mx-auto max-w-[760px] text-center">
                    <p
                        className={`${MONO} mb-5 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-white/50`}
                    >
                        Resources
                    </p>
                    <h2 className="text-3xl font-semibold leading-[1.05] tracking-[-0.02em] text-white sm:text-4xl lg:text-[44px]">
                        Domain operations, explained
                    </h2>
                    <p className="mx-auto mt-5 max-w-[600px] text-[15px] leading-[1.6] text-white/60 sm:text-[16px]">
                        Four short reads covering registration, naming, transfers,
                        and portfolio hygiene — written by people who run real
                        domain portfolios.
                    </p>
                </div>

                {/* Guide cards */}
                <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
                    {GUIDES.map((guide) => (
                        <GuideCard key={guide.index} guide={guide} />
                    ))}
                </div>

                {/* Bottom slim CTA */}
                <div className="mt-10 flex flex-col items-center justify-center gap-3 border-t border-white/[0.06] pt-7 sm:flex-row sm:gap-5">
                    <p
                        className={`${MONO} text-[10.5px] uppercase tracking-[0.18em] text-white/45`}
                    >
                        Managing many domains?
                    </p>
                    <Link
                        href="/dashboard/domains"
                        className={`${MONO} group inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-white transition-opacity hover:opacity-80`}
                    >
                        Manage in the dashboard
                        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                </div>
            </Container>
        </section>
    );
}
