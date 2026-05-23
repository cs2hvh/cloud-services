import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Container } from "@/components/ui/container";
import { AuthAwareServiceCta } from "@/components/services/auth-aware-service-cta";

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

/* ──────────────────────────────────────────────────────────────
   Custom inline glyphs (32×32 — layered + blue accent fills)
   ────────────────────────────────────────────────────────────── */

function PrivacyGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3} strokeLinejoin="round">
            <path d="M16 3l11 4v8c0 6.5-4.5 11.5-11 13.5C9.5 26.5 5 21.5 5 15V7l11-4z" fill="currentColor" fillOpacity="0.10" />
            <circle cx="16" cy="14" r="3.2" fill="#0095FF" fillOpacity="0.30" stroke="#0095FF" />
            <path d="M11 22c1.2-2.5 3-3.8 5-3.8s3.8 1.3 5 3.8" strokeLinecap="round" />
            <path d="M11.5 14.5h2M18.5 14.5h2" strokeLinecap="round" strokeOpacity="0.7" />
        </svg>
    );
}

function AnycastDnsGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            <circle cx="16" cy="16" r="11" strokeOpacity="0.30" />
            <circle cx="16" cy="16" r="7" strokeOpacity="0.55" />
            <circle cx="16" cy="16" r="3.4" fill="#0095FF" fillOpacity="0.30" stroke="#0095FF" />
            <path d="M16 5c2.2 3 3.3 6 3.3 11s-1.1 8-3.3 11c-2.2-3-3.3-6-3.3-11s1.1-8 3.3-11z" strokeOpacity="0.55" />
            <circle cx="6" cy="9" r="1.3" fill="currentColor" />
            <circle cx="26" cy="9" r="1.3" fill="currentColor" />
            <circle cx="6" cy="23" r="1.3" fill="currentColor" />
            <circle cx="26" cy="23" r="1.3" fill="currentColor" />
            <circle cx="16" cy="3.5" r="0.9" fill="#0095FF" />
            <circle cx="16" cy="28.5" r="0.9" fill="#0095FF" />
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

function TldsGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3} strokeLinejoin="round">
            <path d="M5 8h22l-3.5 4 3.5 4-3.5 4 3.5 4H5z" fill="currentColor" fillOpacity="0.08" />
            <path d="M5 8v16" />
            <circle cx="9" cy="12" r="0.9" fill="#0095FF" />
            <circle cx="9" cy="16" r="0.9" fill="currentColor" />
            <circle cx="9" cy="20" r="0.9" fill="currentColor" />
            <path d="M12 12h6M12 16h8M12 20h6" strokeOpacity="0.55" />
            <text x="22.5" y="17" fill="#0095FF" fontSize="4" fontFamily="var(--font-geist-mono),ui-monospace,monospace" textAnchor="middle" fontWeight="700">200+</text>
        </svg>
    );
}

function RegistrarLockGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            <rect x="6" y="13" width="20" height="14" rx="1.5" fill="currentColor" fillOpacity="0.10" />
            <path d="M11 13v-3a5 5 0 0 1 10 0v3" />
            <circle cx="16" cy="19" r="1.8" fill="#0095FF" fillOpacity="0.40" stroke="#0095FF" />
            <path d="M16 20.5v2.5" strokeLinecap="round" />
            <path d="M22 5l3 1-0.5 3" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M25 6a8 8 0 0 1 1 4" strokeOpacity="0.5" strokeLinecap="round" />
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

type Feature = {
    glyph: React.ReactNode;
    role: string;
    title: string;
    description: string;
};

const FEATURES: Feature[] = [
    {
        glyph: <PrivacyGlyph />,
        role: "Privacy",
        title: "WHOIS privacy, free forever",
        description:
            "Your real contact details stay out of public WHOIS records — on every supported TLD, on every domain, without an upcharge.",
    },
    {
        glyph: <AnycastDnsGlyph />,
        role: "DNS",
        title: "Anycast DNS, 200+ edge locations",
        description:
            "Sub-30ms authoritative resolution worldwide, with templated records for AhuraCloud apps, compute, and storage.",
    },
    {
        glyph: <TransferGlyph />,
        role: "Transfer",
        title: "Lossless transfers in under an hour",
        description:
            "Inbound transfers from any ICANN-accredited registrar with pre-flight validation, DNS pre-staging, and zero downtime.",
    },
    {
        glyph: <TldsGlyph />,
        role: "TLDs",
        title: "200+ TLDs under one invoice",
        description:
            "Generic, premium, and country-code extensions — register, renew, and transfer across your portfolio from one billing relationship.",
    },
    {
        glyph: <RegistrarLockGlyph />,
        role: "Safety",
        title: "Registrar lock and auto-renew",
        description:
            "Block unauthorized transfers by default and never lose a domain to a missed renewal — with reminders 90, 30, and 7 days out.",
    },
    {
        glyph: <PortfolioGlyph />,
        role: "Operations",
        title: "Portfolio-grade operations",
        description:
            "Bulk DNS edits, batch renewals, CSV import/export, and a typed REST API for everything you can do in the dashboard.",
    },
];

function FeatureCard({ f, index }: { f: Feature; index: number }) {
    return (
        <article
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
                        "radial-gradient(circle at 30% 0%, rgba(0,149,255,0.07), transparent 60%)",
                }}
            />

            <div className="relative flex items-start justify-between">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-[8px] border border-white/[0.12] bg-white/[0.03] text-white/85">
                    <div className="h-[26px] w-[26px]">{f.glyph}</div>
                </div>
                <div className="flex items-center gap-2">
                    <span
                        className={`${MONO} inline-flex items-center gap-1.5 rounded-full border border-white/[0.10] bg-white/[0.03] px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-white/55`}
                    >
                        <span className="h-1 w-1 rounded-full bg-[#0095FF]" />
                        {f.role}
                    </span>
                    <span
                        className={`${MONO} text-[10.5px] tabular-nums text-white/30`}
                    >
                        {String(index + 1).padStart(2, "0")}
                    </span>
                </div>
            </div>

            <div className="relative">
                <h3 className="text-[17px] font-semibold leading-[1.3] tracking-[-0.005em] text-white">
                    {f.title}
                </h3>
                <p className="mt-2.5 text-[13.5px] leading-[1.6] text-white/65">
                    {f.description}
                </p>
            </div>
        </article>
    );
}

export default function DomainChoiceSection() {
    return (
        <section className="relative overflow-hidden bg-[#0D0D0F] py-16 sm:py-20 lg:py-24">
            {/* Top hairline */}
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
                        The platform
                    </p>
                    <h2 className="text-3xl font-semibold leading-[1.05] tracking-[-0.02em] text-white sm:text-4xl lg:text-[44px]">
                        Everything domain teams need
                    </h2>
                    <p className="mx-auto mt-5 max-w-[620px] text-[15px] leading-[1.6] text-white/60 sm:text-[16px]">
                        Six essentials that ship with every domain on AhuraCloud —
                        from privacy and DNS to lossless transfers and portfolio
                        operations at scale.
                    </p>
                </div>

                {/* Feature grid */}
                <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
                    {FEATURES.map((f, i) => (
                        <FeatureCard key={f.title} f={f} index={i} />
                    ))}
                </div>

                {/* Trust strip + CTA */}
                <div className="mt-14 flex flex-col items-center gap-6 border-t border-white/[0.08] pt-9 sm:flex-row sm:justify-between">
                    <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 sm:justify-start">
                        <span
                            className={`${MONO} text-[11px] font-medium uppercase tracking-[0.18em] text-white/65`}
                        >
                            ICANN accredited
                        </span>
                        <span className="hidden h-3 w-px bg-white/20 sm:inline" />
                        <span
                            className={`${MONO} text-[11px] font-medium uppercase tracking-[0.18em] text-white/65`}
                        >
                            99.99% DNS uptime SLA
                        </span>
                        <span className="hidden h-3 w-px bg-white/20 sm:inline" />
                        <span
                            className={`${MONO} text-[11px] font-medium uppercase tracking-[0.18em] text-white/65`}
                        >
                            24/7 support
                        </span>
                    </div>

                    <div className="flex items-center gap-3">
                        <Link
                            href="/services/domain#search"
                            className={`${MONO} inline-flex h-11 items-center justify-center border border-white/20 bg-transparent px-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white transition-colors hover:border-white/40 hover:bg-white/[0.05]`}
                        >
                            Search a domain
                        </Link>
                        <AuthAwareServiceCta
                            service="domain"
                            intent="main"
                            className={`${MONO} inline-flex h-11 items-center justify-center gap-1.5 border border-white bg-white px-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-black transition-colors hover:bg-white/90`}
                        >
                            Open dashboard
                            <ArrowRight className="h-3.5 w-3.5" />
                        </AuthAwareServiceCta>
                    </div>
                </div>
            </Container>
        </section>
    );
}
