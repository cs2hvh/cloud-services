"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Layers } from "lucide-react";

import { Container } from "@/components/ui/container";

// Embedding models grounded in what the catalog ships today (text-embedding-3
// -large / -small, ada-002) plus the OpenRouter-fronted open models the
// gateway already exposes via /v1/embeddings.
type EmbedModel = {
  id: string;
  displayName: string;
  family: string;
  dim: number;
  ctx: number;
  pricePerMTok: string;
  bestFor: string;
  accent: string;
  badge?: "Default" | "Cheapest" | "Open";
};

const MODELS: EmbedModel[] = [
  {
    id: "openai/text-embedding-3-large",
    displayName: "text-embedding-3-large",
    family: "OpenAI",
    dim: 3072,
    ctx: 8192,
    pricePerMTok: "$0.13",
    bestFor: "Highest semantic accuracy for dense English/multilingual RAG.",
    accent: "#10a37f",
    badge: "Default",
  },
  {
    id: "openai/text-embedding-3-small",
    displayName: "text-embedding-3-small",
    family: "OpenAI",
    dim: 1536,
    ctx: 8192,
    pricePerMTok: "$0.02",
    bestFor: "Production workhorse — 6× cheaper, ~95% the quality.",
    accent: "#10a37f",
    badge: "Cheapest",
  },
  {
    id: "openai/text-embedding-ada-002",
    displayName: "text-embedding-ada-002",
    family: "OpenAI",
    dim: 1536,
    ctx: 8192,
    pricePerMTok: "$0.10",
    bestFor: "Legacy compatibility — keep existing pipelines on the same vector space.",
    accent: "#10a37f",
  },
  {
    id: "baai/bge-m3",
    displayName: "BGE-M3",
    family: "BAAI",
    dim: 1024,
    ctx: 8192,
    pricePerMTok: "$0.01",
    bestFor: "Multilingual + dense/sparse hybrid retrieval. 100+ languages.",
    accent: "#7c3aed",
    badge: "Open",
  },
  {
    id: "voyage/voyage-3-large",
    displayName: "voyage-3-large",
    family: "Voyage",
    dim: 1024,
    ctx: 32000,
    pricePerMTok: "$0.18",
    bestFor: "Long-document retrieval. 32k context, optimized for code + docs.",
    accent: "#f59e0b",
  },
  {
    id: "cohere/embed-multilingual-v3.0",
    displayName: "embed-multilingual-v3",
    family: "Cohere",
    dim: 1024,
    ctx: 512,
    pricePerMTok: "$0.10",
    bestFor: "100+ languages with strong cross-lingual ranking.",
    accent: "#39c5bb",
  },
];

export default function EmbeddingsModelsSection() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (!ref.current || inView) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setInView(true);
      },
      { threshold: 0.12 }
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [inView]);

  return (
    <section
      ref={ref}
      className="relative isolate overflow-hidden bg-[#04060a] py-24 sm:py-32"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.22]"
        style={{
          background:
            "radial-gradient(60% 50% at 20% 30%, rgba(0,149,255,0.20), transparent 70%)",
        }}
      />

      <Container className="relative z-10">
        <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] lg:gap-16 lg:items-start">
          {/* Sticky header */}
          <div className="lg:sticky lg:top-32">
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                Embedding catalog
              </p>
              <h2 className="mt-4 text-3xl font-[400] leading-[1.05] tracking-tight text-white sm:text-4xl lg:text-[2.9rem]">
                Pick by dimension,{" "}
                <span className="text-[#8ecaff]">budget, or language.</span>
              </h2>
              <p className="mt-5 max-w-md text-[14.5px] leading-7 text-white/55">
                OpenAI for accuracy, BGE-M3 for multilingual at a tenth of the price, Voyage for 32k context. Hot-swap models with one config change.
              </p>

              <p className="mt-6 max-w-md text-[12px] leading-relaxed text-white/40">
                <Layers className="mr-1 inline h-3 w-3 -translate-y-px text-white/45" />
                Each collection is bound to one model — its dimension and metric. Migrate to a new model by creating a sibling collection and re-upserting.
              </p>

              <motion.a
                href="/signup"
                initial={{ opacity: 0 }}
                animate={inView ? { opacity: 1 } : {}}
                transition={{ duration: 0.5, delay: 0.4 }}
                className="group mt-8 inline-flex items-center gap-1.5 text-[13px] font-medium text-[#33adff] transition-colors hover:text-white"
              >
                Create a collection
                <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </motion.a>
            </motion.div>
          </div>

          {/* Table-style rows */}
          <div className="space-y-2">
            <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,0.55fr)_minmax(0,0.55fr)_minmax(0,0.7fr)] gap-3 px-4 pb-2 sm:grid">
              <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/35">Model</p>
              <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/35">Dim</p>
              <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/35">Context</p>
              <p className="text-right font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/35">Per 1M tokens</p>
            </div>

            {MODELS.map((m, i) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, x: 14 }}
                animate={inView ? { opacity: 1, x: 0 } : {}}
                transition={{
                  duration: 0.45,
                  ease: [0.16, 1, 0.3, 1],
                  delay: 0.05 + i * 0.05,
                }}
                className="group relative overflow-hidden rounded-[6px] border border-white/[0.06] bg-white/[0.015] px-4 py-3.5 transition-all duration-300 hover:border-white/[0.18] hover:bg-white/[0.04]"
              >
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 w-[2px] opacity-60 transition-opacity duration-300 group-hover:opacity-100"
                  style={{
                    background: `linear-gradient(180deg, ${m.accent}, transparent)`,
                    boxShadow: `0 0 10px ${m.accent}`,
                  }}
                />

                <div className="grid items-center gap-2 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,0.55fr)_minmax(0,0.55fr)_minmax(0,0.7fr)] sm:gap-3">
                  {/* Model + family + best-for */}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <p className="font-mono text-[13px] font-semibold text-white">
                        {m.displayName}
                      </p>
                      {m.badge && (
                        <span
                          className={`inline-flex items-center rounded-[3px] border px-1 py-px font-mono text-[8.5px] uppercase tracking-[0.14em] ${
                            m.badge === "Default"
                              ? "border-[#33adff]/35 bg-[#0095FF]/[0.08] text-[#33adff]"
                              : m.badge === "Cheapest"
                                ? "border-emerald-400/30 bg-emerald-400/[0.08] text-emerald-300/85"
                                : "border-violet-400/30 bg-violet-400/[0.06] text-violet-300/85"
                          }`}
                        >
                          {m.badge}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
                      {m.family}
                    </p>
                    <p className="mt-1.5 text-[11.5px] leading-relaxed text-white/50">
                      {m.bestFor}
                    </p>
                  </div>

                  <p
                    className="font-mono text-[11.5px] font-semibold tracking-tight tabular-nums"
                    style={{ color: m.accent }}
                  >
                    {m.dim}d
                  </p>
                  <p className="font-mono text-[11px] text-white/65 tabular-nums">
                    {m.ctx.toLocaleString()}
                  </p>
                  <p className="text-right font-mono text-[11.5px] tabular-nums text-emerald-400/85 sm:font-semibold">
                    {m.pricePerMTok}
                  </p>
                </div>
              </motion.div>
            ))}

            <p className="px-2 pt-3 text-[10.5px] leading-relaxed text-white/35">
              Prices are pass-through from the upstream model. We add zero markup on embedding calls — only storage and query are platform-priced.
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}
