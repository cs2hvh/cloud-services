"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";

import { Container } from "@/components/ui/container";

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

type BillingCycle = "1y" | "2y" | "3y" | "5y" | "renew" | "transfer";

const cycles: { key: BillingCycle; label: string }[] = [
    { key: "1y", label: "1 Year" },
    { key: "2y", label: "2 Year" },
    { key: "3y", label: "3 Year" },
    { key: "5y", label: "5 Year" },
    { key: "renew", label: "Renew" },
    { key: "transfer", label: "Transfer" },
];

const pricingRows: Array<{
    tld: string;
    description: string;
    accent: string;
    prices: Record<BillingCycle, string>;
}> = [
    {
        tld: ".com",
        description: "Global standard for businesses",
        accent: "#4ade80",
        prices: {
            "1y": "$9.99",
            "2y": "$18.99",
            "3y": "$27.99",
            "5y": "$44.99",
            renew: "$11.99",
            transfer: "$8.99",
        },
    },
    {
        tld: ".io",
        description: "Built for startups & tech teams",
        accent: "#0095FF",
        prices: {
            "1y": "$39.99",
            "2y": "$76.99",
            "3y": "$112.99",
            "5y": "$184.99",
            renew: "$42.99",
            transfer: "$36.99",
        },
    },
    {
        tld: ".ai",
        description: "Perfect for AI-driven brands",
        accent: "#fbbf24",
        prices: {
            "1y": "$9.75",
            "2y": "$18.50",
            "3y": "$27.20",
            "5y": "$44.20",
            renew: "$11.50",
            transfer: "$8.95",
        },
    },
    {
        tld: ".org",
        description: "Reliable and versatile",
        accent: "#a78bfa",
        prices: {
            "1y": "$11.99",
            "2y": "$22.99",
            "3y": "$33.99",
            "5y": "$54.99",
            renew: "$12.99",
            transfer: "$10.99",
        },
    },
    {
        tld: ".co",
        description: "Trusted for communities & co.",
        accent: "#22d3ee",
        prices: {
            "1y": "$14.99",
            "2y": "$28.99",
            "3y": "$41.99",
            "5y": "$67.99",
            renew: "$17.99",
            transfer: "$13.99",
        },
    },
    {
        tld: ".net",
        description: "Short, modern alternative",
        accent: "#f472b6",
        prices: {
            "1y": "$12.99",
            "2y": "$24.99",
            "3y": "$36.99",
            "5y": "$59.99",
            renew: "$14.99",
            transfer: "$11.99",
        },
    },
    {
        tld: ".dev",
        description: "For builders, devs & open source",
        accent: "#4ade80",
        prices: {
            "1y": "$14.99",
            "2y": "$28.99",
            "3y": "$42.99",
            "5y": "$69.99",
            renew: "$16.99",
            transfer: "$13.99",
        },
    },
    {
        tld: ".app",
        description: "HTTPS-only by default",
        accent: "#a78bfa",
        prices: {
            "1y": "$15.99",
            "2y": "$30.99",
            "3y": "$45.99",
            "5y": "$74.99",
            renew: "$17.99",
            transfer: "$14.99",
        },
    },
];

export default function DomainPricingSection() {
    const [activeCycle, setActiveCycle] = useState<BillingCycle>("1y");
    const [query, setQuery] = useState("");

    const visibleRows = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        if (!normalized) return pricingRows;
        return pricingRows.filter(
            (row) =>
                row.tld.toLowerCase().includes(normalized) ||
                row.description.toLowerCase().includes(normalized),
        );
    }, [query]);

    const periodSuffix =
        activeCycle === "renew"
            ? "/yr renewal"
            : activeCycle === "transfer"
              ? "transfer + 1yr"
              : activeCycle === "1y"
                ? "/yr"
                : `total · ${activeCycle.replace("y", " yr")}`;

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
                        Pricing
                    </p>
                    <h2 className="text-3xl font-semibold leading-[1.05] tracking-[-0.02em] text-white sm:text-4xl lg:text-[44px]">
                        The price you see is the price you renew at
                    </h2>
                    <p className="mx-auto mt-5 max-w-[600px] text-[15px] leading-[1.6] text-white/60 sm:text-[16px]">
                        No introductory teaser rates, no surprise renewal hikes, no
                        ICANN-fee shenanigans. Year one and year five cost the same.
                    </p>
                </div>

                {/* Pricing table */}
                <div className="mx-auto mt-10 w-full max-w-[780px]">
                    {/* Cycle tabs */}
                    <div className="overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        <div className="mx-auto inline-flex min-w-max items-center gap-1 rounded-[6px] border border-white/[0.08] bg-[#0F1014] p-1">
                            {cycles.map((cycle) => {
                                const isActive = activeCycle === cycle.key;
                                return (
                                    <button
                                        key={cycle.key}
                                        type="button"
                                        onClick={() => setActiveCycle(cycle.key)}
                                        className={`${MONO} rounded-[4px] px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] transition-colors sm:px-4 ${
                                            isActive
                                                ? "bg-white/[0.08] text-white"
                                                : "text-white/45 hover:text-white/75"
                                        }`}
                                    >
                                        {cycle.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Search */}
                    <div className="mt-4 flex items-center gap-2 rounded-[6px] border border-white/[0.08] bg-[#0F1014] px-3.5">
                        <Search className="h-4 w-4 text-white/40" />
                        <input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Search TLDs — .com, .io, .ai…"
                            className="h-11 w-full bg-transparent text-[13px] text-white placeholder:text-white/35 focus:outline-none"
                        />
                    </div>

                    {/* Rows */}
                    <div className="mt-4 overflow-hidden rounded-[8px] border border-white/[0.08] bg-[#0F1014]">
                        {visibleRows.length === 0 ? (
                            <p
                                className={`${MONO} px-5 py-10 text-center text-[12px] uppercase tracking-[0.14em] text-white/40`}
                            >
                                No TLDs match &quot;{query}&quot;
                            </p>
                        ) : (
                            <ul className="divide-y divide-white/[0.05]">
                                {visibleRows.map((row) => (
                                    <li key={row.tld}>
                                        <Link
                                            href={`/dashboard/domains/marketplace?tld=${encodeURIComponent(row.tld.replace(".", ""))}`}
                                            className="group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-white/[0.025] sm:px-5"
                                        >
                                            <span
                                                className={`${MONO} w-[68px] shrink-0 text-[14px] font-semibold tabular-nums sm:w-[80px]`}
                                                style={{ color: row.accent }}
                                            >
                                                {row.tld}
                                            </span>
                                            <span className="flex-1 truncate text-[13px] text-white/65">
                                                {row.description}
                                            </span>
                                            <span className="hidden sm:inline-block text-right">
                                                <span
                                                    className={`${MONO} text-[14px] font-semibold tabular-nums text-white transition-colors group-hover:text-[#0095FF]`}
                                                >
                                                    {row.prices[activeCycle]}
                                                </span>
                                                <span
                                                    className={`${MONO} ml-1 text-[10px] uppercase tracking-[0.12em] text-white/40`}
                                                >
                                                    {periodSuffix}
                                                </span>
                                            </span>
                                            <span className="sm:hidden text-right">
                                                <span
                                                    className={`${MONO} text-[13px] font-semibold tabular-nums text-white`}
                                                >
                                                    {row.prices[activeCycle]}
                                                </span>
                                            </span>
                                            <ArrowRight className="ml-1 h-3.5 w-3.5 text-white/25 transition-all group-hover:translate-x-0.5 group-hover:text-white" />
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    {/* Footer link */}
                    <div className="mt-5 flex flex-col items-center justify-between gap-3 sm:flex-row">
                        <p
                            className={`${MONO} text-[10.5px] uppercase tracking-[0.18em] text-white/40`}
                        >
                            Showing {visibleRows.length} of 200+ TLDs · USD
                        </p>
                        <Link
                            href="/dashboard/domains/marketplace"
                            className={`${MONO} group inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:text-[#0095FF]`}
                        >
                            Browse all extensions
                            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                        </Link>
                    </div>
                </div>
            </Container>
        </section>
    );
}
