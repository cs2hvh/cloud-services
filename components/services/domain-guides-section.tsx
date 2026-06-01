import Link from "next/link";
import { ArrowRight, LucideRoute } from "lucide-react";
import {
    IconBookFilled,
    IconAbc,
    IconArrowsExchange,
    IconSitemapFilled,
} from "@tabler/icons-react";

import { Container } from "@/components/ui/container";

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

type Guide = {
    index: string;
    role: string;
    title: string;
    description: string;
    href: string;
    icon: React.ReactNode;
    readTime: string;
    accent: string;
};

const GUIDES: Guide[] = [
    {
        index: "01",
        role: "Primer",
        title: "Domain fundamentals",
        description:
            "How registration, registries, and DNS actually work — written for engineers, not marketers.",
        href: "/signup",
        icon: <IconBookFilled size={24} />,
        readTime: "6 min read",
        accent: "#0095FF",
    },
    {
        index: "02",
        role: "Strategy",
        title: "Naming strategy",
        description:
            "Practical guidance for choosing names that are memorable, defensible, and available.",
        href: "/services/domain#search",
        icon: <LucideRoute size={24} />,
        readTime: "5 min read",
        accent: "#8B5CF6",
    },
    {
        index: "03",
        role: "Migration",
        title: "Transferring a domain",
        description:
            "Step-by-step transfer playbook with zero-downtime DNS pre-staging and rollback safeguards.",
        href: "/dashboard/domains/transfer",
        icon: <IconArrowsExchange size={24} />,
        readTime: "8 min read",
        accent: "#06B6D4",
    },
    {
        index: "04",
        role: "Operations",
        title: "Portfolio operations",
        description:
            "DNS records, DNSSEC, WHOIS privacy, registrar lock, auto-renew, and bulk management at scale.",
        href: "/dashboard/domains",
        icon: <IconSitemapFilled size={24} />,
        readTime: "10 min read",
        accent: "#10B981",
    },
];

function GuideCard({ guide }: { guide: Guide }) {
    return (
        <Link
            href={guide.href}
            className="group relative flex flex-col gap-5 overflow-hidden rounded-[10px] border border-white/[0.10] bg-[#0F1114] p-7 transition-all duration-200 hover:-translate-y-1 hover:border-white/[0.22] hover:bg-[#13161B]"
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
                        "radial-gradient(circle at 30% 0%, rgba(0,149,255,0.07), transparent 60%)",
                }}
            />

            {/* Top — icon + role pill + index */}
            <div className="relative flex items-start justify-between">
                <div
                    className="inline-flex h-12 w-12 items-center justify-center rounded-[8px] border transition-all group-hover:brightness-110"
                    style={{ background: `${guide.accent}18`, borderColor: `${guide.accent}40`, color: guide.accent }}
                >
                    {guide.icon}
                </div>
                <div className="flex items-center gap-2">
                    <span
                        className={`${MONO} inline-flex items-center gap-1.5 rounded-full border border-white/[0.10] bg-white/[0.03] px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-white/55`}
                    >
                        <span className="h-1 w-1 rounded-full bg-[#0095FF]" />
                        {guide.role}
                    </span>
                    <span
                        className={`${MONO} text-[10.5px] tabular-nums text-white/30`}
                    >
                        {guide.index}
                    </span>
                </div>
            </div>

            {/* Title + description */}
            <div className="relative">
                <h3 className="text-[17px] font-semibold leading-[1.3] tracking-[-0.005em] text-white">
                    {guide.title}
                </h3>
                <p className="mt-2.5 text-[13.5px] leading-[1.6] text-white/65">
                    {guide.description}
                </p>
            </div>

            {/* Footer — read time + CTA */}
            <div className="relative mt-auto flex items-center justify-between gap-3 border-t border-white/[0.06] pt-4">
                <span
                    className={`${MONO} text-[10px] uppercase tracking-[0.16em] text-white/40`}
                >
                    {guide.readTime}
                </span>
                <span
                    className={`${MONO} inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-white/75 transition-colors group-hover:text-[#0095FF]`}
                >
                    Read guide
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
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
                        className={`${MONO} mb-5 inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-white/50`}
                    >
                        <span className="h-1.5 w-1.5 rounded-full bg-[#0095FF]" />
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
                        className={`${MONO} group inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:text-[#0095FF]`}
                    >
                        Manage in the dashboard
                        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                </div>
            </Container>
        </section>
    );
}
