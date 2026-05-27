"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, Database, Sparkles, Zap } from "lucide-react";

import { Container } from "@/components/ui/container";
import PixelBlast from "@/components/hero/pixel-blast";

const BRAND = "#0095FF";

type Action = { label: string; href: string };

type EmbeddingsHeroSectionProps = {
  primaryAction?: Action;
  secondaryAction?: Action;
};

// Cycling demo: a query, three retrieved chunks, and a similarity score
// per chunk. Reads as "you ask a question → vectors come back ranked."
const DEMOS = [
  {
    query: "What's the refund policy on annual plans?",
    chunks: [
      { id: "doc_4821", title: "Annual plan refunds", sim: 0.93 },
      { id: "doc_4790", title: "Cancellations & credits", sim: 0.81 },
      { id: "doc_4655", title: "Trial conversion FAQ", sim: 0.74 },
    ],
  },
  {
    query: "How do I configure SSO with Okta?",
    chunks: [
      { id: "doc_2310", title: "SAML setup for Okta", sim: 0.95 },
      { id: "doc_2298", title: "JIT user provisioning", sim: 0.82 },
      { id: "doc_2240", title: "Domain verification", sim: 0.71 },
    ],
  },
  {
    query: "Why is my batch job stuck in 'queued'?",
    chunks: [
      { id: "doc_8842", title: "Batch queue lifecycle", sim: 0.91 },
      { id: "doc_8821", title: "Quota & concurrency limits", sim: 0.79 },
      { id: "doc_8810", title: "Retry behavior on 429s", sim: 0.68 },
    ],
  },
] as const;

const METRICS = [
  { value: "3072d", label: "Max dim" },
  { value: "<100ms", label: "p95 query" },
  { value: "B+", label: "Vectors / collection" },
  { value: "pgvector", label: "Under the hood" },
];

export default function EmbeddingsHeroSection({
  primaryAction = { label: "Create a collection", href: "/signup" },
  secondaryAction = { label: "View documentation", href: "/api-docs" },
}: EmbeddingsHeroSectionProps) {
  const [demoIdx, setDemoIdx] = useState(0);
  const [queryChars, setQueryChars] = useState(0);
  const [chunksShown, setChunksShown] = useState(0);

  const demo = DEMOS[demoIdx]!;
  const fullQueryLen = demo.query.length;

  // Type the query, then reveal chunks one-by-one, then cycle.
  useEffect(() => {
    if (queryChars < fullQueryLen) {
      const t = window.setTimeout(() => setQueryChars((n) => n + 1), 28);
      return () => window.clearTimeout(t);
    }
    if (chunksShown < demo.chunks.length) {
      const t = window.setTimeout(
        () => setChunksShown((n) => n + 1),
        320 + chunksShown * 80
      );
      return () => window.clearTimeout(t);
    }
    // Hold then cycle.
    const t = window.setTimeout(() => {
      setDemoIdx((i) => (i + 1) % DEMOS.length);
      setQueryChars(0);
      setChunksShown(0);
    }, 2400);
    return () => window.clearTimeout(t);
  }, [queryChars, chunksShown, fullQueryLen, demo.chunks.length]);

  return (
    <section className="relative isolate flex min-h-screen flex-col justify-center overflow-hidden bg-[#0E0F0F] pb-16 pt-28 sm:pb-20 sm:pt-32 lg:pb-24">
      {/* Atmospheric backdrop */}
      <div className="absolute inset-0 -z-10">
        <PixelBlast
          color={BRAND}
          variant="circle"
          pixelSize={5}
          pixelSizeJitter={0.55}
          patternScale={3.2}
          patternDensity={1.05}
          speed={0.45}
          edgeFade={0.32}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(80% 60% at 50% 0%, rgba(0,149,255,0.10), transparent 70%)",
          }}
        />
      </div>

      <Container className="relative z-10">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
          {/* ── LEFT: copy ── */}
          <div>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.025] px-3 py-1 font-mono text-[10.5px] uppercase tracking-[0.16em] text-white/55"
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#33adff] opacity-70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#33adff]" />
              </span>
              Embeddings &amp; Vector
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.05 }}
              className="mt-6 text-4xl font-[400] leading-[1.04] tracking-tight text-white sm:text-5xl lg:text-[3.8rem]"
            >
              Retrieval that lives{" "}
              <span className="text-[#8ecaff]">next to your inference.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.12 }}
              className="mt-6 max-w-xl text-[15.5px] leading-7 text-white/60 sm:text-[16.5px]"
            >
              Hosted embedding endpoints plus a managed vector store. Upsert
              your corpus, query in natural language, get ranked passages back
              in under 100 ms. One API key, one bill, your tenant.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.18 }}
              className="mt-8 flex flex-wrap items-center gap-3"
            >
              <Link
                href={primaryAction.href}
                className="group inline-flex items-center gap-2 rounded-[8px] bg-[#0095FF] px-5 py-2.5 text-[13.5px] font-semibold text-white shadow-[0_8px_24px_rgba(0,149,255,0.35)] transition-all hover:bg-[#33adff] hover:shadow-[0_10px_30px_rgba(0,149,255,0.5)]"
              >
                {primaryAction.label}
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href={secondaryAction.href}
                className="inline-flex items-center gap-2 rounded-[8px] border border-white/[0.10] bg-white/[0.02] px-5 py-2.5 text-[13.5px] font-medium text-white/85 transition-colors hover:border-white/25 hover:bg-white/[0.05]"
              >
                {secondaryAction.label}
              </Link>
            </motion.div>

            {/* Metric strip */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-[8px] border border-white/[0.07] bg-white/[0.02] sm:grid-cols-4"
            >
              {METRICS.map((m) => (
                <div
                  key={m.label}
                  className="bg-[#0E0F0F] px-4 py-3"
                >
                  <p className="font-mono text-[14px] font-semibold text-white tabular-nums">
                    {m.value}
                  </p>
                  <p className="mt-0.5 font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/40">
                    {m.label}
                  </p>
                </div>
              ))}
            </motion.div>
          </div>

          {/* ── RIGHT: animated query → ranked chunks visualization ── */}
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="relative"
          >
            <div
              aria-hidden
              className="absolute -inset-6 rounded-3xl opacity-50 blur-2xl"
              style={{
                background:
                  "radial-gradient(60% 50% at 50% 40%, rgba(0,149,255,0.45), transparent 70%)",
              }}
            />
            <div className="relative overflow-hidden rounded-[14px] border border-white/[0.10] bg-[#0b0d12] shadow-[0_24px_64px_rgba(0,0,0,0.55)]">
              {/* Title bar */}
              <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
                <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-white/55">
                  <Sparkles className="h-3.5 w-3.5 text-[#33adff]" />
                  vector.query
                </div>
                <div className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-white/35">
                  <Database className="h-3 w-3" />
                  product-docs
                </div>
              </div>

              {/* Query input */}
              <div className="border-b border-white/[0.04] bg-black/30 px-5 py-4">
                <p className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-white/35">
                  Query
                </p>
                <p className="mt-1.5 font-mono text-[13px] leading-relaxed text-white">
                  {demo.query.slice(0, queryChars)}
                  <span className="ml-0.5 inline-block h-3.5 w-1.5 -translate-y-px animate-pulse bg-[#33adff]" />
                </p>
              </div>

              {/* Embed step indicator */}
              <div className="flex items-center justify-between border-b border-white/[0.04] px-5 py-2.5">
                <div className="flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.14em] text-white/40">
                  <Zap className="h-3 w-3 text-emerald-400/85" />
                  embed · 3072d · text-embedding-3-large
                </div>
                {queryChars >= fullQueryLen && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="font-mono text-[9.5px] text-emerald-400/85 tabular-nums"
                  >
                    {queryChars * 4 + 18}ms
                  </motion.span>
                )}
              </div>

              {/* Ranked chunks */}
              <div className="space-y-2 px-5 py-4">
                <p className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-white/35">
                  Top matches
                </p>
                {demo.chunks.map((c, i) => (
                  <motion.div
                    key={`${demoIdx}-${c.id}`}
                    initial={{ opacity: 0, x: 14 }}
                    animate={
                      i < chunksShown
                        ? { opacity: 1, x: 0 }
                        : { opacity: 0, x: 14 }
                    }
                    transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                    className="relative overflow-hidden rounded-[6px] border border-white/[0.06] bg-white/[0.015] px-3.5 py-2.5"
                  >
                    {/* Similarity bar */}
                    <motion.span
                      initial={{ width: 0 }}
                      animate={i < chunksShown ? { width: `${c.sim * 100}%` } : { width: 0 }}
                      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
                      aria-hidden
                      className="absolute inset-y-0 left-0"
                      style={{
                        background:
                          "linear-gradient(90deg, rgba(0,149,255,0.18), rgba(0,149,255,0.04) 90%, transparent)",
                      }}
                    />
                    <div className="relative flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-[11.5px] text-white/85">
                          {c.title}
                        </p>
                        <p className="mt-0.5 font-mono text-[9.5px] tracking-[0.10em] text-white/35">
                          {c.id}
                        </p>
                      </div>
                      <p className="shrink-0 font-mono text-[12px] font-semibold tabular-nums text-[#33adff]">
                        {c.sim.toFixed(2)}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between border-t border-white/[0.06] bg-[#0b0d12]/95 px-5 py-2.5 font-mono text-[9.5px] uppercase tracking-[0.14em]">
                <span className="text-white/45">
                  cosine · 412,890 vectors scanned
                </span>
                <span className="text-emerald-400/85 tabular-nums">
                  62ms total
                </span>
              </div>
            </div>
          </motion.div>
        </div>
      </Container>
    </section>
  );
}
