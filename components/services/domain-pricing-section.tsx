"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import { Container } from "@/components/ui/container";

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
  accentClass: string;
  prices: Record<BillingCycle, string>;
}> = [
  {
    tld: ".com",
    description: "Global standard for businesses",
    accentClass: "text-[#0B8FFF]",
    prices: { "1y": "$9.99/year", "2y": "$18.99", "3y": "$27.99", "5y": "$44.99", renew: "$11.99", transfer: "$8.99" },
  },
  {
    tld: ".io",
    description: "Built for startups & tech",
    accentClass: "text-[#0B8FFF]",
    prices: { "1y": "$39.99/year", "2y": "$76.99", "3y": "$112.99", "5y": "$184.99", renew: "$42.99", transfer: "$36.99" },
  },
  {
    tld: ".ai",
    description: "Perfect for AI-driven brands",
    accentClass: "text-[#FF5A4A]",
    prices: { "1y": "$9.75/year", "2y": "$18.50", "3y": "$27.20", "5y": "$44.20", renew: "$11.50", transfer: "$8.95" },
  },
  {
    tld: ".org",
    description: "Reliable and versatile",
    accentClass: "text-[#0B8FFF]",
    prices: { "1y": "$11.99/year", "2y": "$22.99", "3y": "$33.99", "5y": "$54.99", renew: "$12.99", transfer: "$10.99" },
  },
  {
    tld: ".co",
    description: "Trusted for communities",
    accentClass: "text-[#0B8FFF]",
    prices: { "1y": "$14.99/year", "2y": "$28.99", "3y": "$41.99", "5y": "$67.99", renew: "$17.99", transfer: "$13.99" },
  },
  {
    tld: ".net",
    description: "Short, modern alternative",
    accentClass: "text-[#0B8FFF]",
    prices: { "1y": "$39.99/year", "2y": "$74.99", "3y": "$109.99", "5y": "$179.99", renew: "$41.99", transfer: "$34.99" },
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
        row.description.toLowerCase().includes(normalized)
    );
  }, [query]);

  return (
    <section className="relative overflow-hidden py-16 sm:py-20 lg:py-24 mx-7 mb-7">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
         style={{
  backgroundImage: "url('/images/main-page/service-home-domain-sec-3-bg.svg')",
}}
        aria-hidden="true"
      />

      <Container className="relative z-10">
        <div className="mx-auto w-full max-w-[860px] rounded-[6px] border border-black/15 bg-[#FFFFFF]/95 px-4 py-8 shadow-[0_12px_28px_rgba(0,0,0,0.2)] sm:px-8 sm:py-10">
          <h2 className="text-center text-2xl font-medium text-[#181818] sm:text-4xl">
            Transparent Domain Pricing
          </h2>
          <p className="mx-auto mt-3 max-w-[620px] text-center text-sm text-black/70 sm:text-base">
            Simple, predictable pricing across the most popular domain extensions with no hidden fees.
          </p>

          <div className="mt-6 overflow-x-auto flex w-full max-w-[680px] items-center">
            <div className="mx-auto inline-flex min-w-max rounded-full border border-black/15 bg-white/90 p-1 shadow-sm">
              {cycles.map((cycle) => (
                <button
                  key={cycle.key}
                  type="button"
                  onClick={() => setActiveCycle(cycle.key)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors sm:px-4 ${
                    activeCycle === cycle.key
                      ? "bg-[#1EA2F8] text-white"
                      : "text-black/70 hover:bg-black/5"
                  }`}
                >
                  {cycle.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mx-auto mt-4 flex w-full max-w-[680px] items-center rounded-full border border-black/20 bg-white/90 px-4 shadow-sm">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search domain extension"
              className="h-10 w-full bg-transparent text-sm text-black placeholder:text-black/45 focus:outline-none"
            />
            <Search className="h-4 w-4 text-black/70" />
          </div>

          <div className="mx-auto mt-5 w-full max-w-[700px] overflow-hidden rounded-md border border-black/10 bg-[#E7EAF0]">
            {visibleRows.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-black/60">No domain extension found.</p>
            ) : (
              visibleRows.map((row) => (
                <div
                  key={row.tld}
                  className="grid grid-cols-[70px_1fr_auto] items-center gap-3 border-b border-black/10 px-4 py-2.5 last:border-b-0 sm:grid-cols-[90px_1fr_auto] sm:px-5"
                >
                  <span className={`text-sm font-semibold sm:text-base ${row.accentClass}`}>{row.tld}</span>
                  <span className="text-xs text-black/80 sm:text-sm">{row.description}</span>
                  <span className="text-[11px] font-medium text-black/80 sm:text-sm">{row.prices[activeCycle]}</span>
                </div>
              ))
            )}
          </div>

          <div className="mt-5 flex justify-center">
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-md bg-[#1EA2F8] px-6 text-sm font-medium text-white transition-colors hover:bg-[#128CDE]"
            >
              View More Extensions
              <span className="ml-2 text-base leading-none">&gt;</span>
            </button>
          </div>
        </div>
      </Container>
    </section>
  );
}
