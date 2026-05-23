import Link from "next/link";
import {
    ArrowRight,
    ArrowRightLeft,
    Globe2,
    Layers,
    Lock,
    RefreshCcw,
    ShieldCheck,
    type LucideIcon,
} from "lucide-react";

import { Container } from "@/components/ui/container";
import { AuthAwareServiceCta } from "@/components/services/auth-aware-service-cta";

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

type Feature = {
    icon: LucideIcon;
    title: string;
    description: string;
};

const FEATURES: Feature[] = [
    {
        icon: ShieldCheck,
        title: "WHOIS privacy, free forever",
        description:
            "Your real contact details stay out of public WHOIS records — on every supported TLD, on every domain, without an upcharge.",
    },
    {
        icon: Globe2,
        title: "Anycast DNS, 200+ edge locations",
        description:
            "Sub-30ms authoritative resolution worldwide, with templated records for AhuraCloud apps, compute, and storage.",
    },
    {
        icon: ArrowRightLeft,
        title: "Lossless transfers in under an hour",
        description:
            "Inbound transfers from any ICANN-accredited registrar with pre-flight validation, DNS pre-staging, and zero downtime.",
    },
    {
        icon: Layers,
        title: "200+ TLDs under one invoice",
        description:
            "Generic, premium, and country-code extensions — register, renew, and transfer across your portfolio from one billing relationship.",
    },
    {
        icon: Lock,
        title: "Registrar lock and auto-renew",
        description:
            "Block unauthorized transfers by default and never lose a domain to a missed renewal — with reminders 90, 30, and 7 days out.",
    },
    {
        icon: RefreshCcw,
        title: "Portfolio-grade operations",
        description:
            "Bulk DNS edits, batch renewals, CSV import/export, and a typed REST API for everything you can do in the dashboard.",
    },
];

function FeatureCard({ f, index }: { f: Feature; index: number }) {
    const Icon = f.icon;
    return (
        <article
            className="relative flex flex-col gap-5 rounded-[8px] border border-white/[0.10] bg-[#111316] p-7 transition-colors hover:border-white/[0.22] hover:bg-[#161A1F]"
            style={{
                boxShadow:
                    "inset 0 1px 0 rgba(255,255,255,0.05), 0 10px 28px -12px rgba(0,0,0,0.7)",
            }}
        >
            <div className="flex items-start justify-between">
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-[6px] border border-white/[0.12] bg-white/[0.04] text-white/80">
                    <Icon className="h-5 w-5" strokeWidth={1.6} />
                </div>
                <span
                    className={`${MONO} text-[10.5px] tabular-nums text-white/30`}
                >
                    {String(index + 1).padStart(2, "0")}
                </span>
            </div>
            <div>
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
                        className={`${MONO} mb-5 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-white/50`}
                    >
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
