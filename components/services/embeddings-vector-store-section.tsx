"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Filter,
  GitBranch,
  Layers,
  Lock,
  Ruler,
  Timer,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Container } from "@/components/ui/container";

export default function EmbeddingsVectorStoreSection() {
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
      {/* Atmospheric backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.20]"
        style={{
          background:
            "radial-gradient(50% 50% at 80% 20%, rgba(0,149,255,0.20), transparent 70%), radial-gradient(40% 40% at 10% 80%, rgba(124,58,237,0.18), transparent 70%)",
        }}
      />

      <Container className="relative z-10">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-[400] leading-[1.05] tracking-tight text-white sm:text-4xl lg:text-[3.4rem]">
            A managed store{" "}
            <span className="text-[#0095FF]">your retrieval can trust.</span>
          </h2>
          <p className="mt-5 text-[15px] leading-7 text-white/55 sm:text-[16px]">
            Collections, indexes, metadata filters, replicas. The boring parts of a vector DB — already paved.
          </p>
        </div>

        {/* ─── Bento grid ─── */}
        <div
          className="mt-16 grid gap-4 lg:grid-cols-12 lg:grid-rows-[auto_auto]"
        >
          {/* TILE: Latency hero (wide, animated histogram) */}
          <Tile
            inView={inView}
            delay={0.05}
            className="lg:col-span-7 lg:row-span-1"
            accent="#33adff"
          >
            <TileHeader
              icon={Timer}
              eyebrow="Query latency"
              accent="#33adff"
            />
            <h3 className="mt-4 text-[22px] font-semibold leading-tight tracking-tight text-white sm:text-[26px]">
              <span className="tabular-nums text-[#0095FF]">p95 &lt; 100 ms</span>{" "}
              at 50M vectors per collection.
            </h3>
            <p className="mt-2 max-w-md text-[13px] leading-relaxed text-white/55">
              IVFFlat for cheap scans, HNSW for tight latency, dedicated read replicas for query traffic. Pick a metric (cosine, L2, IP) per collection.
            </p>
            <LatencyHistogram inView={inView} />
          </Tile>

          {/* TILE: Scale stat */}
          <Tile
            inView={inView}
            delay={0.12}
            className="lg:col-span-5 lg:row-span-1"
            accent="#7c3aed"
          >
            <TileHeader icon={Layers} eyebrow="Scale" accent="#7c3aed" />
            <div className="mt-4 flex items-baseline gap-2">
              <p className="font-mono text-[44px] font-semibold leading-none tracking-tight text-white tabular-nums sm:text-[56px]">
                B+
              </p>
              <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-white/40">
                vectors per collection
              </p>
            </div>
            <p className="mt-3 max-w-sm text-[13px] leading-relaxed text-white/55">
              Hundreds of millions on shared infra; billions on a dedicated cluster. Online rebuilds — no downtime when you add data or swap indexes.
            </p>
            <div className="mt-5 flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-white/45">
              {["pgvector", "HNSW", "IVFFlat", "online rebuild"].map((c) => (
                <span
                  key={c}
                  className="rounded-[3px] border border-white/[0.08] bg-white/[0.02] px-2 py-1"
                >
                  {c}
                </span>
              ))}
            </div>
          </Tile>

          {/* TILE: Metadata filter (terminal preview) */}
          <Tile
            inView={inView}
            delay={0.18}
            className="lg:col-span-5"
            accent="#22c55e"
          >
            <TileHeader
              icon={Filter}
              eyebrow="Filtered ANN"
              accent="#22c55e"
            />
            <h3 className="mt-4 text-[18px] font-semibold leading-tight tracking-tight text-white">
              Filter inside the index.
            </h3>
            <p className="mt-2 text-[12.5px] leading-relaxed text-white/55">
              JSON metadata predicates evaluated alongside the ANN search — no post-filter cliff.
            </p>
            <div className="mt-4 overflow-hidden rounded-[6px] border border-white/[0.06] bg-black/40">
              <pre className="px-4 py-3 font-mono text-[10.5px] leading-relaxed text-white/80">
{`{
  "text": "refund policy",
  "top_k": 5,
  "filter": {
    "source": "help-docs",
    "lang":   "en",
    "tier":   { "$gte": 2 }
  }
}`}
              </pre>
            </div>
          </Tile>

          {/* TILE: Isolation */}
          <Tile
            inView={inView}
            delay={0.24}
            className="lg:col-span-4"
            accent="#f59e0b"
          >
            <TileHeader icon={Lock} eyebrow="Tenancy" accent="#f59e0b" />
            <h3 className="mt-4 text-[18px] font-semibold leading-tight tracking-tight text-white">
              Per-tenant RLS.
            </h3>
            <p className="mt-2 text-[12.5px] leading-relaxed text-white/55">
              Every row scoped to your org. Queries from a key in org A literally cannot read vectors in org B — enforced by Postgres, not by app code.
            </p>
            <ul className="mt-4 space-y-1.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-white/55">
              <li className="flex items-center gap-2">
                <Dot color="#f59e0b" />
                row-level security on every table
              </li>
              <li className="flex items-center gap-2">
                <Dot color="#f59e0b" />
                no cross-org leakage by construction
              </li>
              <li className="flex items-center gap-2">
                <Dot color="#f59e0b" />
                soft-delete + audit log on every write
              </li>
            </ul>
          </Tile>

          {/* TILE: Dimensions */}
          <Tile
            inView={inView}
            delay={0.30}
            className="lg:col-span-3"
            accent="#06b6d4"
          >
            <TileHeader icon={Ruler} eyebrow="Dimensions" accent="#06b6d4" />
            <div className="mt-3 space-y-1.5">
              {[
                { dim: "3072", note: "embed-3-large" },
                { dim: "1536", note: "embed-3-small" },
                { dim: "1024", note: "BGE-M3 / Voyage" },
                { dim: "512", note: "truncated" },
              ].map((d) => (
                <div
                  key={d.dim}
                  className="flex items-baseline justify-between border-b border-white/[0.04] py-1.5 last:border-0"
                >
                  <p className="font-mono text-[14px] font-semibold tabular-nums text-white">
                    {d.dim}d
                  </p>
                  <p className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-white/40">
                    {d.note}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-white/45">
              Pick any dimension at create-time; the store stays model-agnostic.
            </p>
          </Tile>

          {/* TILE: Live counters */}
          <Tile
            inView={inView}
            delay={0.36}
            className="lg:col-span-5"
            accent="#33adff"
          >
            <TileHeader icon={Activity} eyebrow="Observability" accent="#33adff" />
            <h3 className="mt-4 text-[18px] font-semibold leading-tight tracking-tight text-white">
              Every call accounted for.
            </h3>
            <p className="mt-2 text-[12.5px] leading-relaxed text-white/55">
              Per-collection metrics + a global usage feed. Embed calls, query calls, storage GB — invoiceable, not estimates.
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <LiveMetric
                inView={inView}
                label="Queries / hr"
                base={142800}
                tickDelta={123}
                format={(v) => Math.floor(v).toLocaleString("en-US")}
              />
              <LiveMetric
                inView={inView}
                label="Embed tokens"
                base={9.4}
                tickDelta={0.1}
                accent="#22c55e"
                format={(v) => `${v.toFixed(1)}M`}
              />
              <LiveMetric
                inView={inView}
                label="Storage"
                base={6.8}
                tickDelta={0}
                format={(v) => `${v.toFixed(1)} GB`}
              />
            </div>
          </Tile>

          {/* TILE: Online rebuild */}
          <Tile
            inView={inView}
            delay={0.42}
            className="lg:col-span-7"
            accent="#a855f7"
          >
            <TileHeader icon={GitBranch} eyebrow="Online rebuilds" accent="#a855f7" />
            <h3 className="mt-4 text-[18px] font-semibold leading-tight tracking-tight text-white">
              Swap an index. Keep serving queries.
            </h3>
            <p className="mt-2 max-w-md text-[12.5px] leading-relaxed text-white/55">
              New index builds on a shadow table; queries read the live one until the cutover. Zero downtime, no re-upsert, no maintenance windows.
            </p>
            <RebuildBar inView={inView} />
          </Tile>
        </div>

        {/* Footer signal */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 0.5, delay: 0.7 }}
          className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-white/40"
        >
          <span className="inline-flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-white/40" />
            One API key, embeddings + vector + inference
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5 text-white/40" />
            Your tenant, end-to-end
          </span>
        </motion.div>
      </Container>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────
// Primitives
// ────────────────────────────────────────────────────────────────────

function Tile({
  children,
  inView,
  delay,
  className,
  accent,
}: {
  children: React.ReactNode;
  inView: boolean;
  delay: number;
  className?: string;
  accent: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay }}
      className={`group relative overflow-hidden rounded-[10px] border border-white/[0.08] bg-white/[0.015] p-6 transition-colors hover:border-white/[0.16] ${className ?? ""}`}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[2px] opacity-70"
        style={{
          background: `linear-gradient(90deg, transparent, ${accent}cc, transparent)`,
          boxShadow: `0 0 14px ${accent}66`,
        }}
      />
      {children}
    </motion.div>
  );
}

function TileHeader({
  icon: Icon,
  eyebrow,
  accent,
}: {
  icon: LucideIcon;
  eyebrow: string;
  accent: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div
        className="flex h-9 w-9 items-center justify-center rounded-[6px] border text-white"
        style={{
          background: `linear-gradient(135deg, ${accent}40, ${accent}10)`,
          borderColor: `${accent}55`,
          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.10), 0 4px 14px ${accent}33`,
        }}
      >
        <Icon className="h-4 w-4" strokeWidth={1.75} />
      </div>
      <span
        className="font-mono text-[10px] uppercase tracking-[0.16em]"
        style={{ color: `${accent}d9` }}
      >
        {eyebrow}
      </span>
    </div>
  );
}

function Dot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="block h-1.5 w-1.5 rounded-full"
      style={{
        background: color,
        boxShadow: `0 0 6px ${color}99`,
      }}
    />
  );
}

// Live-updating counter — counts up from 0 when the tile enters view, then
// keeps ticking so the observability tile reads as a live feed (loops).
function LiveMetric({
  inView,
  label,
  base,
  format,
  accent,
  tickDelta = 0,
}: {
  inView: boolean;
  label: string;
  base: number;
  format: (v: number) => string;
  accent?: string;
  tickDelta?: number;
}) {
  const [val, setVal] = useState(0);
  const [done, setDone] = useState(false);

  // Count up 0 → base on first view.
  useEffect(() => {
    if (!inView) return;
    const steps = 30;
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      const p = i / steps;
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(base * eased);
      if (i >= steps) {
        window.clearInterval(id);
        setVal(base);
        setDone(true);
      }
    }, 40);
    return () => window.clearInterval(id);
  }, [inView, base]);

  // Then keep ticking up so it feels live.
  useEffect(() => {
    if (!done || !tickDelta) return;
    const id = window.setInterval(() => setVal((v) => v + tickDelta), 1800);
    return () => window.clearInterval(id);
  }, [done, tickDelta]);

  return (
    <div className="rounded-[5px] border border-white/[0.06] bg-white/[0.015] px-3 py-2">
      <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/40">
        {label}
      </p>
      <p
        className="mt-1 font-mono text-[13px] font-semibold tabular-nums"
        style={{ color: accent ?? "rgba(255,255,255,0.92)" }}
      >
        {format(val)}
      </p>
    </div>
  );
}

// Stylized latency histogram — 24 bars with one peak around p95.
function LatencyHistogram({ inView }: { inView: boolean }) {
  // Fake but plausible — log-normal-ish, p95 around bar 18.
  const bars = [
    8, 14, 24, 38, 52, 62, 70, 74, 70, 62, 50, 40, 30, 22, 16, 12, 10, 16, 22, 14, 8, 5, 3, 2,
  ];
  const max = Math.max(...bars);

  return (
    <div className="mt-6">
      <div className="flex h-24 items-end gap-1">
        {bars.map((b, i) => {
          const isPeak = i === 17; // p95 marker bar
          return (
            <motion.div
              key={i}
              initial={{ height: 0 }}
              animate={inView ? { height: `${(b / max) * 100}%` } : {}}
              transition={{
                duration: 0.7,
                ease: [0.16, 1, 0.3, 1],
                delay: 0.3 + i * 0.018,
              }}
              className="flex-1 rounded-t-[2px]"
              style={
                isPeak
                  ? {
                      background: "linear-gradient(180deg, #33adff, #0095FF)",
                      boxShadow: "0 0 8px rgba(0,149,255,0.7)",
                    }
                  : {
                      background:
                        "linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0.06))",
                    }
              }
            />
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between font-mono text-[9.5px] uppercase tracking-[0.14em] text-white/40">
        <span>0ms</span>
        <span className="text-[#33adff]">p95 · 78ms</span>
        <span>250ms</span>
      </div>
    </div>
  );
}

// Online-rebuild progress visual — two bars (old / new) with new
// catching up and a cutover marker.
function RebuildBar({ inView }: { inView: boolean }) {
  return (
    <div className="mt-6 space-y-3">
      <RebuildRow inView={inView} label="Serving · IVFFlat (live)" pct={100} color="rgba(255,255,255,0.30)" />
      <RebuildRow inView={inView} label="Building · HNSW (shadow)" pct={72} color="#a855f7" delay={0.3} />
      <div className="flex items-center justify-between pt-1 font-mono text-[9.5px] uppercase tracking-[0.14em] text-white/40">
        <span>queries · uninterrupted</span>
        <span className="text-[#a855f7]">cutover in ~3m</span>
      </div>
    </div>
  );
}

function RebuildRow({
  inView,
  label,
  pct,
  color,
  delay = 0,
}: {
  inView: boolean;
  label: string;
  pct: number;
  color: string;
  delay?: number;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/45">
          {label}
        </p>
        <p className="font-mono text-[10.5px] tabular-nums text-white/70">
          {pct}%
        </p>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <motion.div
          initial={{ width: 0 }}
          animate={inView ? { width: `${pct}%` } : {}}
          transition={{
            duration: 0.9,
            ease: [0.16, 1, 0.3, 1],
            delay: 0.2 + delay,
          }}
          className="h-full rounded-full"
          style={{
            background: color,
            boxShadow: color.startsWith("#") ? `0 0 10px ${color}99` : undefined,
          }}
        />
      </div>
    </div>
  );
}
