"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, ArrowRight, Check } from "lucide-react";
import { Container } from "@/components/ui/container";

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

const POPULAR_TLDS = [
  { tld: ".com", price: "$9.99/yr",  highlight: true },
  { tld: ".io",  price: "$39.99/yr", highlight: false },
  { tld: ".ai",  price: "$9.75/yr",  highlight: true },
  { tld: ".org", price: "$11.99/yr", highlight: false },
  { tld: ".co",  price: "$14.99/yr", highlight: false },
  { tld: ".net", price: "$39.99/yr", highlight: false },
];

const FEATURES = [
  "Free WHOIS privacy",
  "DNS management included",
  "Auto-renewal protection",
  "24/7 support",
];

export function DomainSearchSection() {
  const [query, setQuery] = useState("");

  function handleSearch() {
    const q = query.trim();
    if (!q) return;
    window.location.href = `/services/domain?q=${encodeURIComponent(q)}`;
  }

  return (
    <section className="relative z-10 overflow-hidden bg-[#E6E4DC] py-24 text-[#1A1814] sm:py-28">
      <Container className="relative z-10">
        {/* Header */}
        <div className="text-center">
          <p
            className={`${MONO} mb-5 inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-black/55`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#0095FF]" />
            Domain Registration
          </p>
          <h2 className="text-3xl font-semibold leading-[1.05] tracking-[-0.02em] text-[#1A1814] sm:text-4xl lg:text-[46px]">
            Find the right domain. Register in seconds.
          </h2>
          <p className="mx-auto mt-5 max-w-[560px] text-[15px] leading-[1.6] text-black/60 sm:text-[16.5px]">
            Search 400+ TLDs, register with one click, and manage DNS from the
            same dashboard as the rest of your infrastructure.
          </p>
        </div>

        {/* Search bar */}
        <div className="mx-auto mt-10 max-w-[720px]">
          <div className="flex items-stretch overflow-hidden rounded-[8px] border border-black/15 bg-[#EEECE4]">
            <div className="flex items-center pl-5 text-black/45">
              <Search size={18} />
            </div>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="yourname.com, startup.io…"
              className="h-14 flex-1 bg-transparent px-4 text-[15px] text-[#1A1814] placeholder:text-black/35 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleSearch}
              className={`${MONO} m-1.5 inline-flex items-center gap-1.5 rounded-[5px] bg-[#1A1814] px-6 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#EEECE4] transition-colors hover:bg-black`}
            >
              Search
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* TLD chips */}
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {POPULAR_TLDS.map((item) => (
              <button
                key={item.tld}
                type="button"
                onClick={() => {
                  setQuery((q) => {
                    const base = q.split(".")[0] || "yourname";
                    return base + item.tld;
                  });
                }}
                className={`group inline-flex items-center gap-2 rounded-[5px] border px-4 py-2 text-[12.5px] transition-colors ${
                  item.highlight
                    ? "border-black/25 bg-[#EEECE4] text-[#1A1814] hover:border-black/40"
                    : "border-black/10 bg-transparent text-black/65 hover:border-black/25 hover:bg-[#EEECE4] hover:text-[#1A1814]"
                }`}
              >
                <span className={`${MONO} font-semibold`}>{item.tld}</span>
                <span className={`${MONO} text-[10.5px] text-black/45`}>
                  {item.price}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Features + CTA row */}
        <div className="mx-auto mt-10 flex max-w-[860px] flex-col items-center justify-center gap-5 sm:flex-row">
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            {FEATURES.map((f) => (
              <span
                key={f}
                className="flex items-center gap-2 text-[12.5px] text-black/65"
              >
                <Check size={12} className="text-black/55" strokeWidth={2.6} />
                {f}
              </span>
            ))}
          </div>

          <span
            className="hidden h-4 w-px bg-black/15 sm:block"
            aria-hidden="true"
          />

          <Link
            href="/services/domain"
            className={`${MONO} inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.14em] text-black/65 transition-colors hover:text-[#1A1814]`}
          >
            Browse all extensions
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </Container>
    </section>
  );
}
