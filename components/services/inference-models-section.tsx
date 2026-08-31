"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";

import { Container } from "@/components/ui/container";
import { ProviderLogo } from "@/components/services/provider-logos";

// ─── Provider catalog (visible in the marquee columns) ───────────────
//
// Each entry is rendered as a card flowing through one of three vertical
// columns. The avatar shows the provider's brand mark (see provider-logos),
// brand-tinted via the accent. Tags are a single-line capability line.
type ModelCard = {
  provider: string;
  model: string;
  /** Single-line capability descriptor — small text under the model name. */
  meta: string;
  /** Hex brand-tinted color for the avatar + accent stripe. */
  accent: string;
};

/**
 * The service page keeps the percentage-based Container it was designed in.
 *
 * The homepage needs its left edge on the same grid as the hero, the GPU rail
 * and every section heading — all of which sit at 104px on a 1911px viewport.
 * Container's `lg:max-w-[75%]` would have set it ~135px further in.
 *
 * Note the width is 1800, not 1704: padding sits INSIDE the max-width here
 * (the hero's convention), so 1800 − 2×48 gives the same 1704px content box.
 * Putting 1704 here instead lands the edge 48px too far right.
 */
function Shell({ isHome, children }: { isHome: boolean; children: React.ReactNode }) {
  if (isHome) {
    return (
      <div className="relative z-10 mx-auto w-full max-w-[1800px] px-6 sm:px-10 lg:px-12">
        {children}
      </div>
    );
  }
  return <Container className="relative z-10">{children}</Container>;
}

// 18 cards total → 6 per column. Long enough that the marquee loop is
// not obviously short; short enough to keep the catalog feeling premium
// rather than a wall of text.
//
// EVERY ID HERE IS A MODEL THE GATEWAY WILL ACTUALLY ROUTE. That is not a
// stylistic note. Until 2026-08-26 this list advertised gpt-4o, o3,
// gemini-2.5-pro, llama-4-maverick, mistral-large, command-r-plus and twelve
// more — eighteen of eighteen unroutable after the move from OpenRouter to
// Wokey, across six providers the platform does not serve at all. A visitor
// who copied a name off this page got a 404 on their first request.
//
// The displayed name is the bare one; NAMESPACE below supplies the prefix
// that makes it callable, because `model` in a request body is the namespaced
// id exactly as inference.models.model_id stores it.
//
// inference-models.catalog.test.ts checks every id against the live catalog
// and fails naming the offender. That test is the only reason this list is
// allowed to be a hand-written snapshot rather than a query.
//
// NO VISION CLAIMS. Every active model in the catalog reports
// capabilities.vision = false, so no card may say otherwise. The old gpt-4o
// card led with "Vision".
const CARDS: ModelCard[] = [
  { provider: "Anthropic", model: "claude-opus-5",         meta: "Frontier · Tools · 1M context", accent: "#d97706" },
  { provider: "OpenAI",    model: "gpt-5.6-sol",           meta: "Frontier · Tools · 1M context", accent: "#10a37f" },
  { provider: "xAI",       model: "grok-4.6",              meta: "Reasoning · Tools · 500k",      accent: "#a3a3a3" },
  { provider: "Moonshot",  model: "kimi-k3",               meta: "Open weights · Tools · 1M",     accent: "#6366f1" },
  { provider: "Zhipu",     model: "glm-5.3",               meta: "Open weights · Tools · 1M",     accent: "#14b8a6" },
  { provider: "DeepSeek",  model: "deepseek-v4-pro",       meta: "Reasoning · Tools · 1M",        accent: "#7c3aed" },

  { provider: "Anthropic", model: "claude-sonnet-5",       meta: "Balanced · Tools · 1M context", accent: "#d97706" },
  { provider: "OpenAI",    model: "gpt-5.6-terra",         meta: "Balanced · Tools · 1M context", accent: "#10a37f" },
  { provider: "xAI",       model: "grok-4.5",              meta: "Reasoning · Tools · 500k",      accent: "#a3a3a3" },
  { provider: "Moonshot",  model: "kimi-k2.7-code",        meta: "Code · Open weights · 256k",    accent: "#6366f1" },
  { provider: "MiniMax",   model: "minimax-m3",            meta: "Open weights · Tools · 1M",     accent: "#f43f5e" },
  { provider: "Anthropic", model: "claude-opus-4.8",       meta: "Frontier · Tools · 1M context", accent: "#d97706" },

  { provider: "Anthropic", model: "claude-haiku-4.5",      meta: "Fast · Tools · 200k",           accent: "#d97706" },
  { provider: "OpenAI",    model: "gpt-5.4-mini",          meta: "Fast · Tools · 400k",           accent: "#10a37f" },
  { provider: "OpenAI",    model: "gpt-5.3-codex",         meta: "Code · Tools · 400k",           accent: "#10a37f" },
  { provider: "DeepSeek",  model: "deepseek-v4-flash",     meta: "Fast · Open weights · 1M",      accent: "#7c3aed" },
  { provider: "ByteDance", model: "doubao-seed-2.1-turbo", meta: "Fast · Tools · 256k",           accent: "#06b6d4" },
  { provider: "Anthropic", model: "claude-sonnet-4.6",     meta: "Balanced · Tools · 1M context", accent: "#d97706" },
];

/**
 * The namespace each card needs to become a callable id, keyed by the
 * displayed provider name. Kept beside the cards rather than inside them so
 * the card stays a display concern and this stays a routing fact.
 *
 * Moonshot, Zhipu, MiniMax and ByteDance have no brand mark in
 * provider-logos, so ProviderLogo falls back to a two-letter monogram. That
 * is deliberate — initials beat a wrong logo, and beat dropping four real
 * providers from the page because we lack an SVG for them.
 */
const NAMESPACE: Record<string, string> = {
  Anthropic: "anthropic",
  OpenAI: "openai",
  xAI: "x-ai",
  Moonshot: "moonshotai",
  Zhipu: "zhipu",
  DeepSeek: "deepseek",
  MiniMax: "minimax",
  ByteDance: "bytedance",
};

/** The id a caller passes as `model`. Checked against the live catalog. */
export function catalogId(card: { provider: string; model: string }): string {
  return `${NAMESPACE[card.provider] ?? card.provider.toLowerCase()}/${card.model}`;
}

export const MODEL_CARDS: ReadonlyArray<ModelCard> = CARDS;

// Three columns, each scrolls at a different speed to avoid a regimented
// "everything moves together" look. Direction alternates so adjacent
// columns counter-flow, which the eye reads as parallax.
const COLUMNS: Array<{ from: number; cards: ModelCard[]; durationS: number; reverse: boolean }> = [
  { from: 0,  cards: CARDS.slice(0, 6),  durationS: 38, reverse: false },
  { from: 6,  cards: CARDS.slice(6, 12), durationS: 50, reverse: true  },
  { from: 12, cards: CARDS.slice(12, 18), durationS: 44, reverse: false },
];

/**
 * Counts the catalog can support, exported so the test can hold them to it.
 *
 * These were "50+" and "12" against a real 29 and 8 — inflated by roughly
 * 1.7x and 1.5x. Both are now the live number, and the test fails if the
 * catalog moves away from them in either direction. Being wrong LOW is still
 * wrong: it undersells the platform and it means this file has stopped
 * tracking reality, which is the same defect as overselling it.
 */
export const CATALOG_MODEL_COUNT = 29;
export const CATALOG_PROVIDER_COUNT = 8;

/**
 * THE MARKUP STAT IS GONE, and deliberately.
 *
 * It read "0% Markup". That is true of 20 of the 29 active models and false
 * of the other nine, which carry between 18% and 633% on output tokens —
 * deepseek-v4-flash bills 132¢/Mtok against an 18¢ cost, and gpt-5.6-sol, a
 * featured model, bills 3000¢ against 1000¢. Whether those margins should
 * exist is a pricing decision and not this file's to make; whether the page
 * may advertise their absence while they exist is not a close question.
 *
 * If inference moves to at-cost the way GPU did, put the stat back and let
 * the test assert it. Until then the strip carries only claims that hold.
 */
const STATS = [
  { value: String(CATALOG_MODEL_COUNT),    label: "Models" },
  { value: String(CATALOG_PROVIDER_COUNT), label: "Providers" },
  { value: "1M",                           label: "Max context" },
  { value: "1",                            label: "API key" },
];

/**
 * Rendered on /services/inference AND on the marketing homepage. The model
 * list is the single source of truth for both — do not fork it.
 *
 * `variant` only changes the shell: the service page keeps its percentage
 * Container, the homepage uses the 1704px content box and page ground so its
 * left edge lines up with every other section (Container's 75% would have put
 * it ~135px further in).
 */
export default function InferenceModelsSection({
  variant = "service",
}: {
  variant?: "service" | "home";
} = {}) {
  const isHome = variant === "home";
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
      className={`relative isolate overflow-hidden ${isHome ? "pt-16 pb-6 lg:pt-24 lg:pb-8" : "bg-[#0E0F0F] py-24 sm:py-32"}`}
      style={isHome ? { background: "var(--ah-bg)" } : undefined}
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

      <Shell isHome={isHome}>
        <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-20">
          {/* ─── LEFT: sticky descriptive pane ──────────────────── */}
          <div className="lg:sticky lg:top-28 lg:self-start">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            >
              <h2 className={isHome ? "ah-h2" : "text-3xl font-[400] leading-[1.05] tracking-tight text-white sm:text-4xl lg:text-[3.4rem]"}>
                Every provider behind
                <br />
                <span className={isHome ? "ah-h2-hl" : "text-[#0095FF]"}>a single integration.</span>
              </h2>
              <p className="mt-6 max-w-md text-[15px] leading-7 text-white/55 sm:text-[16px]">
                {CATALOG_MODEL_COUNT} models, {CATALOG_PROVIDER_COUNT} providers, one OpenAI- and Anthropic-compatible endpoint. Switch providers with a string change.
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
                    <div className="text-[1.4rem] font-medium tracking-tight text-[#0095FF]">
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
                    className="border border-white/[0.08] bg-white/[0.02] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-white/55"
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
                className="group mt-10 inline-flex items-center gap-1.5 text-[13px] font-medium text-white transition-colors hover:text-[#0095FF]"
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
      </Shell>

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
  return (
    <div
      className="ah-notch-sm group/tile relative flex items-center gap-3 overflow-hidden border border-white/[0.06] bg-white/[0.015] px-3.5 py-3 backdrop-blur-sm transition-colors duration-300 hover:border-white/[0.18] hover:bg-white/[0.05]"
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

      {/* Avatar — brand-tinted provider logo, glyph fallback when no
          mark exists. Inherits the accent via currentColor. */}
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center border font-mono text-[10px] font-semibold tracking-[0.04em]"
        style={{
          background: `linear-gradient(135deg, ${card.accent}22, ${card.accent}08)`,
          borderColor: `${card.accent}40`,
          color: card.accent,
        }}
      >
        <ProviderLogo provider={card.provider} />
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
