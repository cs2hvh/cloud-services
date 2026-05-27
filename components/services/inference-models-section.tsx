"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";

import { Container } from "@/components/ui/container";

// ─── Provider catalog (visible in the marquee columns) ───────────────
//
// Each entry is rendered as a card flowing through one of three vertical
// columns. We don't ship real provider logos (IP / legal); the avatar
// is a brand-tinted initial. Tags are a single-line capability line.
type ModelCard = {
  provider: string;
  model: string;
  /** Single-line capability descriptor — small text under the model name. */
  meta: string;
  /** Hex brand-tinted color for the avatar + accent stripe. */
  accent: string;
};

// 18 cards total → 6 per column. Long enough that the marquee loop is
// not obviously short; short enough to keep the catalog feeling premium
// rather than a wall of text.
const CARDS: ModelCard[] = [
  { provider: "OpenAI",    model: "gpt-4o",                      meta: "Vision · Tools · 128k",         accent: "#10a37f" },
  { provider: "Anthropic", model: "claude-4-7-opus",             meta: "Frontier · Tools · 200k",       accent: "#d97706" },
  { provider: "Google",    model: "gemini-2.5-pro",              meta: "Long context · 2M tokens",      accent: "#4285f4" },
  { provider: "Meta",      model: "llama-4-maverick",            meta: "MoE · Open weights",            accent: "#0866ff" },
  { provider: "Mistral",   model: "mistral-large",               meta: "Multilingual · Tools",          accent: "#fa520f" },
  { provider: "DeepSeek",  model: "deepseek-v3",                 meta: "Reasoning · Open weights",      accent: "#7c3aed" },

  { provider: "OpenAI",    model: "o3",                          meta: "Reasoning · Thinking",          accent: "#10a37f" },
  { provider: "Anthropic", model: "claude-4-5-sonnet",           meta: "Frontier · Tools · 200k",       accent: "#d97706" },
  { provider: "Google",    model: "gemini-2.5-flash",            meta: "Fast · 1M context",             accent: "#4285f4" },
  { provider: "Qwen",      model: "qwen-3-32b",                  meta: "Multilingual · Open weights",   accent: "#615ced" },
  { provider: "Mistral",   model: "codestral",                   meta: "Code · 32k context",            accent: "#fa520f" },
  { provider: "DeepSeek",  model: "deepseek-coder-v3",           meta: "Code · Open weights",           accent: "#7c3aed" },

  { provider: "OpenAI",    model: "gpt-4o-mini",                 meta: "Cheap · Fast · 128k",           accent: "#10a37f" },
  { provider: "Meta",      model: "llama-4-scout",               meta: "Small · Open weights",          accent: "#0866ff" },
  { provider: "Cohere",    model: "command-r-plus",              meta: "RAG-tuned · Tools",             accent: "#ec4899" },
  { provider: "xAI",       model: "grok-3",                      meta: "Reasoning · Real-time",         accent: "#a3a3a3" },
  { provider: "Perplexity", model: "sonar-reasoning",            meta: "Web-grounded · Citations",      accent: "#22d3ee" },
  { provider: "Qwen",      model: "qwen-coder-32b",              meta: "Code · Open weights",           accent: "#615ced" },
];

// Three columns, each scrolls at a different speed to avoid a regimented
// "everything moves together" look. Direction alternates so adjacent
// columns counter-flow, which the eye reads as parallax.
const COLUMNS: Array<{ from: number; cards: ModelCard[]; durationS: number; reverse: boolean }> = [
  { from: 0,  cards: CARDS.slice(0, 6),  durationS: 38, reverse: false },
  { from: 6,  cards: CARDS.slice(6, 12), durationS: 50, reverse: true  },
  { from: 12, cards: CARDS.slice(12, 18), durationS: 44, reverse: false },
];

const STATS = [
  { value: "50+",   label: "Models" },
  { value: "12",    label: "Providers" },
  { value: "0%",    label: "Markup" },
  { value: "1 key", label: "All of it" },
];

export default function InferenceModelsSection() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (!ref.current || inView) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setInView(true);
      },
      { threshold: 0.1 }
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [inView]);

  return (
    <section
      ref={ref}
      className="relative isolate overflow-hidden bg-[#0E0F0F] py-24 sm:py-32"
    >
      {/* Subtle radial wash + diagonal grain so the section reads as
          richer than a flat panel without distracting from the cards. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.20]"
        style={{
          background:
            "radial-gradient(70% 50% at 18% 30%, rgba(0,149,255,0.22), transparent 65%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04] mix-blend-soft-light"
        style={{
          backgroundImage:
            "repeating-linear-gradient(135deg, rgba(255,255,255,0.5) 0 1px, transparent 1px 9px)",
        }}
      />

      <Container className="relative z-10">
        <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-20">
          {/* ─── LEFT: sticky descriptive pane ──────────────────── */}
          <div className="lg:sticky lg:top-32 lg:self-start">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                One catalog
              </p>
              <h2 className="mt-4 text-3xl font-[400] leading-[1.05] tracking-tight text-white sm:text-4xl lg:text-[3.4rem]">
                Every model{" "}
                <span className="text-[#8ecaff]">worth calling.</span>
                <br />
                One key. One bill.
              </h2>
              <p className="mt-6 max-w-md text-[15px] leading-7 text-white/55 sm:text-[16px]">
                50+ models, 12 providers, one OpenAI- and Anthropic-compatible endpoint. Switch providers with a string change — no rewrite, no new SDK, no new contract.
              </p>

              {/* Stat strip with hairline dividers — matches the hero's strip */}
              <div className="mt-10 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4 lg:grid-cols-2 max-w-md">
                {STATS.map((s, i) => (
                  <motion.div
                    key={s.label}
                    initial={{ opacity: 0, y: 8 }}
                    animate={inView ? { opacity: 1, y: 0 } : {}}
                    transition={{
                      duration: 0.5,
                      ease: [0.16, 1, 0.3, 1],
                      delay: 0.1 + i * 0.06,
                    }}
                    className="border-t border-white/[0.1] pt-3"
                  >
                    <div className="text-[1.4rem] font-medium tracking-tight text-white">
                      {s.value}
                    </div>
                    <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">
                      {s.label}
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Capability footer chips — same content as the previous
                  flat-row chips, now lives in the descriptive pane */}
              <div className="mt-10 flex flex-wrap gap-1.5 max-w-md">
                {[
                  "Streaming",
                  "Tool calling",
                  "JSON mode",
                  "Vision",
                  "Long context",
                  "BYOK",
                  "Off-peak pricing",
                ].map((cap) => (
                  <span
                    key={cap}
                    className="rounded-[3px] border border-white/[0.08] bg-white/[0.02] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-white/55"
                  >
                    {cap}
                  </span>
                ))}
              </div>

              <motion.a
                href="/dashboard/services/inference/models"
                initial={{ opacity: 0 }}
                animate={inView ? { opacity: 1 } : {}}
                transition={{ duration: 0.5, delay: 0.5 }}
                className="group mt-10 inline-flex items-center gap-1.5 text-[13px] font-medium text-[#33adff] transition-colors hover:text-white"
              >
                Browse the full catalog
                <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </motion.a>
            </motion.div>
          </div>

          {/* ─── RIGHT: three counter-scrolling marquee columns ── */}
          <div className="relative">
            <motion.div
              initial={{ opacity: 0 }}
              animate={inView ? { opacity: 1 } : {}}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="relative h-[600px] sm:h-[680px]"
            >
              {/* Top + bottom fade masks so the marquee dissolves into
                  the background instead of hard-clipping at the edges. */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-[#0E0F0F] to-transparent"
              />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-24 bg-gradient-to-t from-[#0E0F0F] to-transparent"
              />

              <div className="grid h-full grid-cols-3 gap-3">
                {COLUMNS.map((col, idx) => (
                  <MarqueeColumn
                    key={idx}
                    cards={col.cards}
                    durationS={col.durationS}
                    reverse={col.reverse}
                  />
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </Container>

      {/* Marquee keyframes — defined inline so the file is self-contained
          and we don't have to touch globals.css. */}
      <style jsx global>{`
        @keyframes inference-marquee-up {
          from { transform: translateY(0); }
          to   { transform: translateY(-50%); }
        }
        @keyframes inference-marquee-down {
          from { transform: translateY(-50%); }
          to   { transform: translateY(0); }
        }
        /* Reduced-motion users get a static frozen state — accessibility. */
        @media (prefers-reduced-motion: reduce) {
          .inference-marquee-track { animation: none !important; }
        }
      `}</style>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────
// Marquee column — duplicates its content + animates translateY so the
// loop is seamless. Pauses on hover (a subtle "give the user a moment
// to read" affordance that's standard on enterprise logo walls).
// ────────────────────────────────────────────────────────────────────

function MarqueeColumn({
  cards,
  durationS,
  reverse,
}: {
  cards: ModelCard[];
  durationS: number;
  reverse: boolean;
}) {
  return (
    <div className="group relative h-full overflow-hidden">
      <div
        className="inference-marquee-track flex flex-col gap-3 will-change-transform group-hover:[animation-play-state:paused]"
        style={{
          animation: `${
            reverse ? "inference-marquee-down" : "inference-marquee-up"
          } ${durationS}s linear infinite`,
        }}
      >
        {/* Render twice for seamless loop. Keyframe goes 0 → -50%, so the
            second copy slides into the original's position exactly when
            the loop wraps. */}
        {[...cards, ...cards].map((c, i) => (
          <ModelTile key={`${c.model}-${i}`} card={c} />
        ))}
      </div>
    </div>
  );
}

function ModelTile({ card }: { card: ModelCard }) {
  // First two characters of the provider name, used as the avatar glyph.
  const glyph = card.provider.slice(0, 2).toUpperCase();

  return (
    <div
      className="group/tile relative flex items-center gap-3 overflow-hidden rounded-[6px] border border-white/[0.06] bg-white/[0.015] px-3.5 py-3 backdrop-blur-sm transition-colors duration-300 hover:border-white/[0.18] hover:bg-white/[0.05]"
    >
      {/* Provider-tinted left rail */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[2px] opacity-60 transition-opacity duration-300 group-hover/tile:opacity-100"
        style={{
          background: `linear-gradient(180deg, ${card.accent}, transparent)`,
          boxShadow: `0 0 10px ${card.accent}`,
        }}
      />

      {/* Avatar — brand-tinted initial. Looks like a logo without
          shipping any real third-party marks. */}
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[5px] border font-mono text-[10px] font-semibold tracking-[0.04em]"
        style={{
          background: `linear-gradient(135deg, ${card.accent}22, ${card.accent}08)`,
          borderColor: `${card.accent}40`,
          color: card.accent,
        }}
      >
        {glyph}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate font-mono text-[11.5px] font-medium text-white">
            {card.model}
          </p>
          <p
            className="shrink-0 text-[9.5px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: `${card.accent}cc` }}
          >
            {card.provider}
          </p>
        </div>
        <p className="mt-1 truncate text-[10.5px] text-white/45">{card.meta}</p>
      </div>
    </div>
  );
}
