"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { Search, ArrowRight, Check } from "lucide-react";
import { Container } from "@/components/ui/container";

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
    <section className="relative z-10 py-28 overflow-hidden">
      {/* Background — pure dark */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#080808] via-[#0a0a0a] to-[#080808]" />

      {/* Very faint warm-neutral glow — no blue */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] opacity-[0.06]"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(255,255,255,0.6) 0%, transparent 70%)",
          filter: "blur(70px)",
        }}
        aria-hidden="true"
      />

      {/* Subtle grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
        aria-hidden="true"
      />

      {/* Top + bottom edge lines */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />

      <Container className="relative z-10">

        {/* Header */}
        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 22 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.7, ease: [0.25, 0.4, 0.25, 1] }}
        >
          <p className="text-[11px] font-semibold tracking-[0.2em] uppercase text-white/50 mb-4">
            Domain Registration
          </p>
          <h2 className="text-[clamp(30px,3.8vw,54px)] font-semibold tracking-[-0.035em] leading-[1.08] text-white">
            Find your perfect{" "}
            <span
              className="text-transparent bg-clip-text"
              style={{
                backgroundImage:
                  "linear-gradient(115deg, rgba(255,255,255,0.9) 0%, rgba(180,215,255,0.85) 100%)",
              }}
            >
              domain
            </span>
          </h2>
          <p className="mt-5 text-[16px] leading-[1.75] text-white/55 max-w-[500px] mx-auto">
            Search, register, and manage domains with instant setup, free WHOIS
            privacy, and full DNS control — all in one place.
          </p>
        </motion.div>

        {/* Search bar */}
        <motion.div
          className="mt-10 mx-auto max-w-[700px]"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.7, delay: 0.12, ease: [0.25, 0.4, 0.25, 1] }}
        >
          {/* Outer glow ring — makes the bar pop off the dark bg */}
          <div className="relative">
            <div
              className="pointer-events-none absolute -inset-[1px] opacity-40"
              style={{
                boxShadow: "0 0 0 1px rgba(255,255,255,0.22), 0 4px 32px rgba(255,255,255,0.07)",
              }}
              aria-hidden="true"
            />
            <div className="flex items-stretch bg-[#161616] border border-white/[0.22]">
              <div className="flex items-center pl-5 text-white/60">
                <Search size={18} />
              </div>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Search your domain — yourname.com, startup.io…"
                className="flex-1 h-14 px-4 bg-transparent text-[15px] text-white placeholder:text-white/30 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleSearch}
                className="m-1.5 px-7 bg-white text-black text-[13px] font-semibold tracking-wide hover:bg-white/90 active:scale-[0.98] transition-all whitespace-nowrap"
              >
                Search Domain
              </button>
            </div>
          </div>

          {/* TLD chips */}
          <div className="mt-5 flex flex-wrap gap-2 justify-center">
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
                className={`inline-flex items-center gap-2 px-4 py-2 text-[13px] font-medium border transition-all ${
                  item.highlight
                    ? "border-white/25 text-white bg-white/[0.10] hover:bg-white/[0.16]"
                    : "border-white/[0.10] text-white/60 bg-white/[0.03] hover:bg-white/[0.09] hover:text-white/80"
                }`}
              >
                <span className="font-mono font-semibold">{item.tld}</span>
                <span className="text-white/40 text-[11px]">{item.price}</span>
              </button>
            ))}
          </div>
        </motion.div>

        {/* Features + CTA row */}
        <motion.div
          className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-5"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.8, delay: 0.28 }}
        >
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            {FEATURES.map((f) => (
              <span
                key={f}
                className="flex items-center gap-2 text-[13px] text-white/55"
              >
                <Check size={12} className="text-white/60" strokeWidth={2.5} />
                {f}
              </span>
            ))}
          </div>

          <div className="hidden sm:block w-px h-5 bg-white/[0.12]" aria-hidden="true" />

          <Link
            href="/services/domain"
            className="inline-flex items-center gap-1.5 text-[13px] text-white/50 hover:text-white transition-colors whitespace-nowrap font-medium"
          >
            Browse all extensions
            <ArrowRight size={13} />
          </Link>
        </motion.div>

      </Container>
    </section>
  );
}
