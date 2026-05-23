import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Container } from "@/components/ui/container";

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

/* ──────────────────────────────────────────────────────────────
   Custom inline glyphs (32×32 — layered + blue accent fills)
   ────────────────────────────────────────────────────────────── */

function FundamentalsGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3} strokeLinejoin="round">
            <path d="M5 6h9a3 3 0 0 1 3 3v18a3 3 0 0 0-3-3H5V6z" fill="currentColor" fillOpacity="0.10" />
            <path d="M27 6h-9a3 3 0 0 0-3 3v18a3 3 0 0 1 3-3h9V6z" fill="#0095FF" fillOpacity="0.15" stroke="#0095FF" />
            <path d="M8 11h5M8 14h4M19 11h5M19 14h5M19 17h4" strokeOpacity="0.55" strokeLinecap="round" />
        </svg>
    );
}

function NamingGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3} strokeLinejoin="round">
            <rect x="4" y="11" width="24" height="10" rx="1.5" fill="currentColor" fillOpacity="0.08" />
            <path d="M4 11h24" strokeOpacity="0.4" />
            <text x="8" y="18.5" fill="currentColor" fillOpacity="0.85" fontSize="6" fontFamily="var(--font-geist-mono),ui-monospace,monospace" fontWeight="600">brand</text>
            <text x="18" y="18.5" fill="#0095FF" fontSize="6" fontFamily="var(--font-geist-mono),ui-monospace,monospace" fontWeight="700">.com</text>
            <path d="M22 8l1 2 2 0.5-2 0.5-1 2-1-2-2-0.5 2-0.5 1-2z" fill="#0095FF" />
            <circle cx="6" cy="25" r="0.7" fill="currentColor" fillOpacity="0.5" />
            <circle cx="10" cy="25" r="0.7" fill="currentColor" fillOpacity="0.5" />
            <circle cx="14" cy="25" r="0.7" fill="#0095FF" />
        </svg>
    );
}

function TransferGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="10" height="10" rx="1.2" fill="currentColor" fillOpacity="0.15" />
            <rect x="19" y="17" width="10" height="10" rx="1.2" fill="#0095FF" fillOpacity="0.25" stroke="#0095FF" />
            <path d="M14 9h11M22 6l3 3-3 3" />
            <path d="M18 23H7M10 26l-3-3 3-3" />
        </svg>
    );
}

function PortfolioGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            <rect x="4" y="4" width="11" height="7" rx="1" fill="currentColor" fillOpacity="0.15" />
            <rect x="17" y="4" width="11" height="7" rx="1" fill="#0095FF" fillOpacity="0.25" stroke="#0095FF" />
            <rect x="4" y="13" width="11" height="7" rx="1" fill="currentColor" fillOpacity="0.15" />
            <rect x="17" y="13" width="11" height="7" rx="1" fill="currentColor" fillOpacity="0.15" />
            <rect x="4" y="22" width="24" height="6" rx="1" fill="currentColor" fillOpacity="0.10" />
            <circle cx="7" cy="7.5" r="0.7" fill="#0095FF" />
            <path d="M9.5 7.5h4M6.5 25h6M14 25h4" strokeOpacity="0.55" strokeLinecap="round" />
            <path d="M22 16l-2 2-1-1" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

type Guide = {
    index: string;
    role: string;
    title: string;
    description: string;
    href: string;
    glyph: React.ReactNode;
    readTime: string;
};

const GUIDES: Guide[] = [
    {
        index: "01",
        role: "Primer",
        title: "Domain fundamentals",
        description:
            "How registration, registries, and DNS actually work — written for engineers, not marketers.",
        href: "/signup",
        glyph: <FundamentalsGlyph />,
        readTime: "6 min read",
    },
    {
        index: "02",
        role: "Strategy",
        title: "Naming strategy",
        description:
            "Practical guidance for choosing names that are memorable, defensible, and available.",
        href: "/services/domain#search",
        glyph: <NamingGlyph />,
        readTime: "5 min read",
    },
    {
        index: "03",
        role: "Migration",
        title: "Transferring a domain",
        description:
            "Step-by-step transfer playbook with zero-downtime DNS pre-staging and rollback safeguards.",
        href: "/dashboard/domains/transfer",
        glyph: <TransferGlyph />,
        readTime: "8 min read",
    },
    {
        index: "04",
        role: "Operations",
        title: "Portfolio operations",
        description:
            "DNS records, DNSSEC, WHOIS privacy, registrar lock, auto-renew, and bulk management at scale.",
        href: "/dashboard/domains",
        glyph: <PortfolioGlyph />,
        readTime: "10 min read",
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
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-[8px] border border-white/[0.12] bg-white/[0.03] text-white/85 transition-colors group-hover:border-white/[0.25] group-hover:text-white">
                    <div className="h-[26px] w-[26px]">{guide.glyph}</div>
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
                    className={`${MONO} inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-white/75 transition-colors group-hover:text-white`}
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
