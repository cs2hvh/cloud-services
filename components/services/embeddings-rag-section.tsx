"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import {
  Bot,
  Database,
  FileText,
  Network,
  Scissors,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Container } from "@/components/ui/container";

type Stage = {
  num: string;
  label: string;
  title: string;
  body: string;
  icon: LucideIcon;
};

const STAGES: Stage[] = [
  {
    num: "01",
    label: "Chunk",
    icon: Scissors,
    title: "Split your corpus",
    body: "Markdown, PDF, HTML, code — overlap-aware splitting with metadata preserved per chunk.",
  },
  {
    num: "02",
    label: "Embed",
    icon: Sparkles,
    title: "Vector per chunk",
    body: "Hosted endpoint streams batches into your collection. Per-token billing, zero markup.",
  },
  {
    num: "03",
    label: "Store",
    icon: Database,
    title: "Indexed and ready",
    body: "pgvector with IVFFlat / HNSW indexes, online rebuilds, per-tenant isolation via RLS.",
  },
  {
    num: "04",
    label: "Retrieve",
    icon: Network,
    title: "Top-k passages",
    body: "Cosine, L2, or inner product. Filter by metadata, rerank with a second-stage model.",
  },
  {
    num: "05",
    label: "Generate",
    icon: Bot,
    title: "Grounded answer",
    body: "Hand retrieved chunks to any inference model — same API key, same bill.",
  },
];

const CODE_SNIPPET = `// 1. Embed and upsert
await fetch("/v1/vector/collections/docs/upsert", {
  method: "POST",
  headers: { Authorization: \`Bearer \${KEY}\` },
  body: JSON.stringify({
    rows: chunks.map((c) => ({
      id:       c.id,
      text:     c.text,
      metadata: { source: c.source, page: c.page }
    }))
  })
});

// 2. Query
const r = await fetch("/v1/vector/collections/docs/query", {
  method: "POST",
  headers: { Authorization: \`Bearer \${KEY}\` },
  body: JSON.stringify({
    text:   "How do I rotate my BYOK key?",
    top_k:  5,
    metric: "cosine"
  })
});

// 3. Hand to any inference model
const { matches } = await r.json();
const context = matches.map((m) => m.text).join("\\n---\\n");

await fetch("/v1/chat/completions", { /* with context */ });`;

export default function EmbeddingsRagSection() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);
  const [activeStage, setActiveStage] = useState(0);

  useEffect(() => {
    if (!ref.current || inView) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setInView(true);
      },
      { threshold: 0.18 }
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [inView]);

  // Auto-cycle through stages while in view.
  useEffect(() => {
    if (!inView) return;
    const t = window.setInterval(
      () => setActiveStage((s) => (s + 1) % STAGES.length),
      2200
    );
    return () => window.clearInterval(t);
  }, [inView]);

  return (
    <section
      ref={ref}
      className="relative isolate overflow-hidden bg-[#0E0F0F] py-24 sm:py-32"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.18]"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 30%, rgba(0,149,255,0.30), transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.55) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          maskImage:
            "radial-gradient(ellipse 80% 60% at 50% 50%, black, transparent 80%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 60% at 50% 50%, black, transparent 80%)",
        }}
      />

      <Container className="relative z-10">
        {/* Section header */}
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-[400] leading-[1.05] tracking-tight text-white sm:text-4xl lg:text-[3.4rem]">
            Five stages.{" "}
            <span className="text-[#0095FF]">One API key.</span>
          </h2>
          <p className="mt-5 text-[15px] leading-7 text-white/55 sm:text-[16px]">
            From raw documents to a grounded answer — every step is a single endpoint, billed transparently.
          </p>
        </div>

        {/* ─── Animated horizontal flow diagram ─── */}
        <div className="mt-16 overflow-hidden rounded-[14px] border border-white/[0.08] bg-white/[0.015] p-6 sm:p-10">
          <div className="relative">
            {/* Connecting horizontal rail */}
            <div className="absolute inset-x-8 top-[28px] hidden h-px overflow-hidden bg-white/[0.08] sm:block">
              <motion.div
                animate={{ x: ["-100%", "100%"] }}
                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                className="h-full w-1/2"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, rgba(51,173,255,0.9), transparent)",
                  boxShadow: "0 0 8px rgba(0,149,255,0.6)",
                }}
              />
            </div>

            <div className="relative grid gap-8 sm:grid-cols-5 sm:gap-3">
              {STAGES.map((s, i) => {
                const Icon = s.icon;
                const isActive = activeStage === i;
                return (
                  <motion.div
                    key={s.num}
                    initial={{ opacity: 0, y: 14 }}
                    animate={inView ? { opacity: 1, y: 0 } : {}}
                    transition={{
                      duration: 0.5,
                      delay: 0.1 + i * 0.08,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    className="flex flex-col items-center text-center"
                  >
                    {/* Node icon */}
                    <motion.div
                      animate={{
                        scale: isActive ? 1.08 : 1,
                      }}
                      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                      className="relative"
                    >
                      <span
                        aria-hidden
                        className="absolute -inset-3 rounded-full transition-opacity duration-500"
                        style={{
                          opacity: isActive ? 0.7 : 0,
                          background:
                            "radial-gradient(50% 50% at 50% 50%, rgba(0,149,255,0.55), transparent 70%)",
                          filter: "blur(10px)",
                        }}
                      />
                      <div
                        className="relative flex h-14 w-14 items-center justify-center rounded-full border bg-[#0E0F0F] transition-all duration-500"
                        style={
                          isActive
                            ? {
                                borderColor: "rgba(51,173,255,0.6)",
                                background:
                                  "linear-gradient(135deg, rgba(0,149,255,0.30), rgba(0,149,255,0.08))",
                                boxShadow:
                                  "inset 0 1px 0 rgba(255,255,255,0.12), 0 6px 22px rgba(0,149,255,0.40)",
                              }
                            : {
                                borderColor: "rgba(255,255,255,0.10)",
                              }
                        }
                      >
                        <Icon
                          className="h-5 w-5 transition-colors duration-500"
                          strokeWidth={1.6}
                          style={{
                            color: isActive ? "#8ecaff" : "rgba(255,255,255,0.5)",
                          }}
                        />
                      </div>
                    </motion.div>

                    <p className="mt-4 font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/40">
                      {s.num}
                    </p>
                    <p
                      className="mt-1 text-[13px] font-semibold tracking-tight transition-colors duration-500"
                      style={{
                        color: isActive ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.65)",
                      }}
                    >
                      {s.label}
                    </p>
                    <p className="mt-1.5 max-w-[160px] text-[11.5px] leading-relaxed text-white/45">
                      {s.body}
                    </p>
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* Active stage detail strip */}
          <motion.div
            key={activeStage}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="mt-10 flex flex-col items-center justify-between gap-3 rounded-[8px] border border-white/[0.06] bg-black/30 px-5 py-4 sm:flex-row"
          >
            <div className="flex items-center gap-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#33adff]">
                {STAGES[activeStage]?.num} · {STAGES[activeStage]?.label}
              </span>
              <span className="hidden h-3 w-px bg-white/[0.10] sm:block" />
              <p className="text-[13px] text-white">
                {STAGES[activeStage]?.title}
              </p>
            </div>
            <p className="max-w-md text-[12px] leading-relaxed text-white/55 sm:text-right">
              {STAGES[activeStage]?.body}
            </p>
          </motion.div>
        </div>

        {/* ─── Code snippet + sidekick ─── */}
        <div className="mt-12 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          {/* Code */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="overflow-hidden rounded-[10px] border border-white/[0.08] bg-[#0b0d12]"
          >
            <div className="flex items-center gap-2 border-b border-white/[0.06] px-5 py-3 font-mono text-[10.5px] uppercase tracking-[0.16em] text-white/55">
              <FileText className="h-3.5 w-3.5 text-[#33adff]" />
              rag.ts
              <span className="ml-auto text-white/30">three calls, end-to-end</span>
            </div>
            <pre className="overflow-x-auto px-5 py-5 font-mono text-[12px] leading-relaxed text-white/85">
              {CODE_SNIPPET}
            </pre>
          </motion.div>

          {/* What you don't have to build */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="flex flex-col rounded-[10px] border border-white/[0.08] bg-white/[0.015] p-6"
          >
            <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-white/40">
              What you don&apos;t have to build
            </p>
            <ul className="mt-5 space-y-3.5">
              {[
                "Vector DB cluster, replica failover, index rebuilds",
                "Embedding queue + retry + rate-limit handling",
                "Per-tenant isolation (RLS is wired)",
                "Token-count metering and billing reconciliation",
                "Cold-start preheating between models",
              ].map((b) => (
                <li
                  key={b}
                  className="flex items-start gap-2.5 text-[12.5px] leading-relaxed text-white/65"
                >
                  <span
                    aria-hidden
                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#33adff]"
                    style={{ boxShadow: "0 0 6px rgba(0,149,255,0.6)" }}
                  />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
            <p className="mt-auto pt-6 text-[11.5px] leading-relaxed text-white/45">
              The boring parts of retrieval, shipped. You write the chunking strategy that matters for your corpus — we run the rest.
            </p>
          </motion.div>
        </div>
      </Container>
    </section>
  );
}
