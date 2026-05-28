"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Bell,
  KeyRound,
  Layers,
  Lock,
  ShieldCheck,
  Sparkles,
  TrendingDown,
} from "lucide-react";

import { Container } from "@/components/ui/container";

// ─── Premium icon badge ──────────────────────────────────────────────
//
// Used inside every tile. Wraps a lucide icon in a brand-blue gradient
// chip with a soft outer glow. Replaces the previous "plain icon in a
// thin-bordered square" treatment which read as generic.
function IconBadge({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <div className="relative">
      <span
        aria-hidden
        className="absolute -inset-1.5 rounded-[8px] opacity-70 blur-md"
        style={{
          background:
            "radial-gradient(50% 50% at 50% 50%, rgba(0,149,255,0.5), transparent 70%)",
        }}
      />
      <div
        className="relative flex h-9 w-9 items-center justify-center rounded-[6px] border border-[#33adff]/30 text-white"
        style={{
          background:
            "linear-gradient(135deg, rgba(0,149,255,0.30) 0%, rgba(0,149,255,0.08) 100%)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.10), 0 4px 16px rgba(0,149,255,0.18)",
        }}
      >
        <Icon className="h-4 w-4" strokeWidth={1.75} />
      </div>
    </div>
  );
}

// ─── Reusable tile shell ─────────────────────────────────────────────
//
// All tiles share the same border, hover state, and entrance animation.
// Children compose what's inside.
function Tile({
  className,
  delay,
  inView,
  children,
}: {
  className?: string;
  delay: number;
  inView: boolean;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay }}
      className={`group relative overflow-hidden rounded-[10px] border border-white/[0.08] bg-white/[0.015] p-6 transition-all duration-300 hover:border-white/[0.18] hover:bg-white/[0.035] ${className ?? ""}`}
    >
      {/* Soft top-edge highlight — bento staple */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent)",
        }}
      />
      {/* Hover wash */}
      <span
        aria-hidden
        className="pointer-events-none absolute -inset-px rounded-[10px] opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 0%, rgba(0,149,255,0.10), transparent 70%)",
        }}
      />
      <div className="relative">{children}</div>
    </motion.div>
  );
}

// ─── Section ─────────────────────────────────────────────────────────
export default function InferenceFeaturesSection() {
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
      className="relative isolate overflow-hidden bg-[#04060a] py-24 sm:py-32"
    >
      {/* Atmospheric backdrop — radial wash + masked grid + soft glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.22]"
        style={{
          background:
            "radial-gradient(60% 40% at 50% 0%, rgba(0,149,255,0.30), transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
          maskImage:
            "radial-gradient(ellipse 65% 60% at 50% 35%, black, transparent 75%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 65% 60% at 50% 35%, black, transparent 75%)",
        }}
      />

      <Container className="relative z-10">
        {/* Section header */}
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
            Enterprise controls
          </p>
          <h2 className="mt-4 text-3xl font-[400] leading-[1.05] tracking-tight text-white sm:text-4xl lg:text-[3.4rem]">
            Production guardrails.{" "}
            <span className="text-[#8ecaff]">Day one.</span>
          </h2>
          <p className="mt-5 text-[15px] leading-7 text-white/55 sm:text-[16px]">
            Spend caps, BYOK, ZDR, semantic cache, and audit logs — working out of the box.
          </p>
        </div>

        {/* ─── Bento grid ────────────────────────────────────────
            12-col on lg. Tiles span varying widths/heights so the
            layout reads as composed instead of regimented. */}
        <div className="mt-16 grid gap-3 sm:grid-cols-2 lg:grid-cols-12 lg:grid-rows-[auto_auto]">
          {/* ── Tile 1: HERO — Drop-in compatibility (6 cols × 2 rows) ── */}
          <Tile className="lg:col-span-6 lg:row-span-2" delay={0.0} inView={inView}>
            <div className="flex items-start justify-between gap-4">
              <IconBadge icon={Layers} />
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
                Drop-in
              </span>
            </div>
            <h3 className="mt-5 text-[18px] font-semibold leading-snug tracking-tight text-white">
              OpenAI &amp; Anthropic SDK compatible
            </h3>
            <p className="mt-2 max-w-md text-[12.5px] leading-relaxed text-white/55">
              Change one line. Streaming, tools, JSON mode, and multi-modal all keep working.
            </p>

            {/* Code preview — diff-style highlight on the changed line */}
            <div className="mt-6 overflow-hidden rounded-[6px] border border-white/[0.06] bg-black/40 font-mono text-[11px] leading-relaxed">
              <div className="flex items-center gap-1.5 border-b border-white/[0.04] px-3 py-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#ff5f57]" />
                <span className="h-1.5 w-1.5 rounded-full bg-[#febc2e]" />
                <span className="h-1.5 w-1.5 rounded-full bg-[#28c840]" />
                <span className="ml-2 text-[10px] uppercase tracking-[0.14em] text-white/35">
                  python
                </span>
              </div>
              <pre className="px-4 py-3 text-white/80">
                <span className="text-white/45">from openai import OpenAI</span>
                {"\n"}
                <span className="text-white/45">client = OpenAI(</span>
                {"\n"}
                <span className="block rounded-[3px] bg-[#0095FF]/[0.15] -mx-2 px-2 text-white">
                  {"  "}base_url=&quot;https://api.cs2hvh.com/v1&quot;,
                </span>
                <span className="text-white/45">  api_key=os.environ[&quot;AHURA_API_KEY&quot;],</span>
                {"\n"}
                <span className="text-white/45">)</span>
              </pre>
            </div>

            <div className="mt-5 flex flex-wrap gap-1.5">
              {["OpenAI SDK", "Anthropic SDK", "LangChain", "LlamaIndex", "Vercel AI"].map((t) => (
                <span
                  key={t}
                  className="rounded-[3px] border border-white/[0.08] bg-white/[0.02] px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-white/55"
                >
                  {t}
                </span>
              ))}
            </div>
          </Tile>

          {/* ── Tile 2: TALL — Semantic cache (3 cols × 2 rows) ── */}
          <Tile className="lg:col-span-3 lg:row-span-2" delay={0.05} inView={inView}>
            <div className="flex items-start justify-between gap-4">
              <IconBadge icon={TrendingDown} />
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
                Cache
              </span>
            </div>
            <h3 className="mt-5 text-[16px] font-semibold leading-snug tracking-tight text-white">
              Semantic cache
            </h3>
            <p className="mt-2 text-[12px] leading-relaxed text-white/55">
              Serves cached responses for near-duplicate prompts above your similarity threshold.
            </p>

            {/* Similarity gauge — concentric arcs */}
            <div className="mt-7 flex flex-col items-center">
              <div className="relative h-32 w-32">
                <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                  {/* Track */}
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    fill="none"
                    stroke="rgba(255,255,255,0.08)"
                    strokeWidth="6"
                  />
                  {/* Filled arc — 0.95 of 1.0 = 95% */}
                  <motion.circle
                    cx="50"
                    cy="50"
                    r="42"
                    fill="none"
                    stroke="url(#cacheGrad)"
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 42}`}
                    initial={{ strokeDashoffset: 2 * Math.PI * 42 }}
                    animate={inView ? { strokeDashoffset: 2 * Math.PI * 42 * 0.05 } : {}}
                    transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1], delay: 0.4 }}
                  />
                  <defs>
                    <linearGradient id="cacheGrad" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#0095FF" />
                      <stop offset="100%" stopColor="#33adff" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <p className="font-mono text-[8.5px] uppercase tracking-[0.16em] text-white/40">
                    threshold
                  </p>
                  <p
                    style={{
                      fontFamily: "var(--font-serif), Georgia, serif",
                    }}
                    className="text-[26px] font-bold leading-none text-white tabular-nums"
                  >
                    0.95
                  </p>
                  <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-emerald-400/85">
                    cosine
                  </p>
                </div>
              </div>
              <p className="mt-4 text-center text-[10.5px] leading-relaxed text-white/45">
                Per-key opt-in.<br />ZDR keys never read or write.
              </p>
            </div>
          </Tile>

          {/* ── Tile 3: TALL — BYOK (3 cols × 2 rows) ── */}
          <Tile className="lg:col-span-3 lg:row-span-2" delay={0.1} inView={inView}>
            <div className="flex items-start justify-between gap-4">
              <IconBadge icon={KeyRound} />
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
                BYOK
              </span>
            </div>
            <h3 className="mt-5 text-[16px] font-semibold leading-snug tracking-tight text-white">
              Bring your own key
            </h3>
            <p className="mt-2 text-[12px] leading-relaxed text-white/55">
              Bill to your own provider account. Encrypted at rest, decrypted at the edge per request.
            </p>

            {/* Cipher line visual — looks like an encrypted payload */}
            <div className="mt-5 overflow-hidden rounded-[6px] border border-white/[0.06] bg-black/40 p-3 font-mono text-[10px]">
              <p className="text-white/35">$ payload (AES-256-GCM)</p>
              <p className="mt-1 break-all text-emerald-400/80">
                f4a9b2c7e1d80a5f3b6e9c2d7a1b4e6f8c0a3b5d7e9f1c2a4b6d8e0f2a4c6e8b
              </p>
              <p className="mt-2 text-white/35">$ decrypted at edge</p>
              <p className="mt-1 break-all text-white/65">sk-proj-xxxx••••••••</p>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-1.5">
              {["OpenAI", "Anthropic", "Google", "Mistral"].map((p) => (
                <span
                  key={p}
                  className="rounded-[3px] border border-white/[0.08] bg-white/[0.02] px-2 py-1 text-center font-mono text-[9.5px] uppercase tracking-[0.14em] text-white/55"
                >
                  {p}
                </span>
              ))}
            </div>
          </Tile>

          {/* ── Tile 4: WIDE — Spend control (6 cols × 1 row) ── */}
          <Tile className="lg:col-span-6 lg:row-span-1" delay={0.15} inView={inView}>
            <div className="flex items-start gap-5">
              <IconBadge icon={ShieldCheck} />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="text-[15px] font-semibold tracking-tight text-white">
                    Per-key &amp; org-level hard caps
                  </h3>
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
                    Spend
                  </span>
                </div>
                <p className="mt-1.5 text-[12px] leading-relaxed text-white/55">
                  Tightest cap wins. Alerts at 80 / 90 / 100% via in-app, email, or signed webhook.
                </p>

                {/* Spend bar — 68% with 80/100 markers */}
                <div className="mt-4">
                  <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                    <motion.div
                      initial={{ width: "0%" }}
                      animate={inView ? { width: "68%" } : {}}
                      transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1], delay: 0.6 }}
                      className="h-full rounded-full"
                      style={{
                        background:
                          "linear-gradient(90deg, #4ade80 0%, #fbbf24 70%, #f87171 100%)",
                        boxShadow: "0 0 12px rgba(74,222,128,0.4)",
                      }}
                    />
                    {/* 80% marker */}
                    <span
                      aria-hidden
                      className="absolute top-0 h-full w-px bg-white/30"
                      style={{ left: "80%" }}
                    />
                    {/* 100% marker */}
                    <span
                      aria-hidden
                      className="absolute top-0 h-full w-px bg-white/30"
                      style={{ left: "calc(100% - 1px)" }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
                    <span>$342 / $500 this month</span>
                    <span className="text-white/30">
                      80%<span className="mx-2">·</span>100%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Tile>

          {/* ── Tile 5: STD — Zero Data Retention (3 cols × 1 row) ── */}
          <Tile className="lg:col-span-3 lg:row-span-1" delay={0.2} inView={inView}>
            <div className="flex items-start gap-4">
              <IconBadge icon={Lock} />
              <div className="flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-[14.5px] font-semibold tracking-tight text-white">
                    Zero Data Retention
                  </h3>
                  <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/40">
                    ZDR
                  </span>
                </div>
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-white/55">
                  Per-key toggle. Prompts &amp; responses never logged. Caches skip. Billing metadata only.
                </p>
              </div>
            </div>
          </Tile>

          {/* ── Tile 6: STD — Observability (3 cols × 1 row) ── */}
          <Tile className="lg:col-span-3 lg:row-span-1" delay={0.25} inView={inView}>
            <div className="flex items-start gap-4">
              <IconBadge icon={Activity} />
              <div className="flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-[14.5px] font-semibold tracking-tight text-white">
                    Usage &amp; audit
                  </h3>
                  <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/40">
                    Logs
                  </span>
                </div>
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-white/55">
                  Daily spend, p50/p95/p99, per-key cache hit rate, CSV export, append-only audit log.
                </p>
              </div>
            </div>
          </Tile>

          {/* ── Tile 7: WIDE — Routing presets + webhooks (6 cols × 1 row) ── */}
          <Tile className="lg:col-span-6 lg:row-span-1" delay={0.3} inView={inView}>
            <div className="flex items-start gap-5">
              <IconBadge icon={Sparkles} />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="text-[15px] font-semibold tracking-tight text-white">
                    Routing presets &amp; signed webhooks
                  </h3>
                  <Bell className="h-3.5 w-3.5 text-white/40" />
                </div>
                <p className="mt-1.5 text-[12px] leading-relaxed text-white/55">
                  Named fallback chains via one header. HMAC-SHA256 webhooks on every inference event.
                </p>

                {/* Two inline pills showing the value props */}
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="rounded-[5px] border border-white/[0.06] bg-black/30 p-2.5">
                    <p className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-white/40">
                      Header
                    </p>
                    <p className="mt-1 truncate font-mono text-[11px] text-white/85">
                      X-Ahura-Preset:&nbsp;<span className="text-[#33adff]">prod-cheap-first</span>
                    </p>
                  </div>
                  <div className="rounded-[5px] border border-white/[0.06] bg-black/30 p-2.5">
                    <p className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-white/40">
                      Webhook signature
                    </p>
                    <p className="mt-1 truncate font-mono text-[11px] text-white/85">
                      sha256=<span className="text-emerald-400/85">3f2a9c…</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </Tile>
        </div>
      </Container>
    </section>
  );
}
