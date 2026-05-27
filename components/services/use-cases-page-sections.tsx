"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Brain,
  CheckCircle2,
  Code2,
  FileSearch,
  MessageSquare,
  Plug,
  Search,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Container } from "@/components/ui/container";
import PixelBlast from "@/components/hero/pixel-blast";

// ────────────────────────────────────────────────────────────────────
// HERO
// ────────────────────────────────────────────────────────────────────
export function UseCasesHero() {
  return (
    <section className="relative isolate flex min-h-screen flex-col justify-center overflow-hidden bg-black pb-16 pt-28 sm:pb-20 sm:pt-32 lg:pb-24">
      <div className="absolute inset-0 -z-10">
        <PixelBlast variant="circle" color="#0095FF" pixelSize={5} patternScale={3} patternDensity={0.7} pixelSizeJitter={0.5} speed={0.3} edgeFade={0.4} transparent />
      </div>
      <Container className="relative z-10">
        <div className="mx-auto max-w-4xl text-center">
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="font-[var(--font-geist-mono),ui-monospace,monospace] text-[11px] uppercase tracking-[0.22em] text-white/40">
            Use cases
          </motion.p>
          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.05 }} className="mt-5 text-5xl font-semibold leading-[1.04] tracking-[-0.035em] text-white sm:text-6xl lg:text-[72px]">
            What you can build
          </motion.h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 0.15 }} className="mx-auto mt-5 max-w-md text-[15px] leading-[1.65] text-white/50">
            One API, one bill. Four patterns that ship AI to production.
          </motion.p>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 0.22 }} className="mt-8 flex justify-center">
            <Link href="/signup" className="group inline-flex items-center gap-2 bg-white px-5 py-2.5 text-[13px] font-semibold text-black transition-all hover:bg-white/90">
              Get started <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </motion.div>
        </div>
      </Container>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────
// SHOWCASE — all 4 use cases in one interactive section
// ────────────────────────────────────────────────────────────────────

type UseCase = {
  id: string;
  icon: LucideIcon;
  label: string;
  tags: string[];
};

const CASES: UseCase[] = [
  { id: "chat", icon: Bot, label: "Chatbots & Agents", tags: ["Streaming", "Tool calling", "Memory"] },
  { id: "rag", icon: Brain, label: "RAG & Knowledge", tags: ["pgvector", "Reranking", "Citations"] },
  { id: "code", icon: Code2, label: "Code Generation", tags: ["Codestral", "DeepSeek-Coder", "Qwen-Coder"] },
  { id: "docs", icon: FileSearch, label: "Document Intel", tags: ["Long context", "JSON mode", "Batches"] },
];

export function UseCasesShowcase() {
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (!ref.current || inView) return;
    const obs = new IntersectionObserver((e) => { if (e[0]?.isIntersecting) setInView(true); }, { threshold: 0.15 });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [inView]);

  return (
    <section ref={ref} className="relative z-10 bg-[#04060a] py-16 lg:py-28">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[60%] h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <Container>
        {/* Tab selectors */}
        <div className="flex flex-wrap gap-[1px] border border-white/[0.06] bg-white/[0.04]">
          {CASES.map((c, i) => {
            const Icon = c.icon;
            const isActive = active === i;
            return (
              <button
                key={c.id}
                onClick={() => setActive(i)}
                className="group flex flex-1 items-center gap-3 bg-[#04060a] px-5 py-4 transition-all duration-300"
                style={{
                  background: isActive ? "rgba(0,149,255,0.04)" : "#04060a",
                  borderBottom: isActive ? "2px solid #0095FF" : "2px solid transparent",
                }}
              >
                <Icon className="h-5 w-5 shrink-0 transition-colors duration-300" strokeWidth={1.5} style={{ color: isActive ? "#0095FF" : "rgba(255,255,255,0.30)" }} />
                <span className="hidden text-left sm:block">
                  <span className="block text-[13px] font-semibold tracking-tight transition-colors duration-300" style={{ color: isActive ? "white" : "rgba(255,255,255,0.55)" }}>
                    {c.label}
                  </span>
                  <span className="mt-0.5 flex gap-1.5">
                    {c.tags.map((t) => (
                      <span key={t} className="font-[var(--font-geist-mono),ui-monospace,monospace] text-[8.5px] tracking-[0.10em] text-white/25">{t}</span>
                    ))}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Active visualization — large, immersive */}
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4, ease: [0.25, 0.4, 0.25, 1] }}
            className="mt-[1px] border border-white/[0.06] bg-[#0a0a0a] shadow-[0px_5px_17.7px_rgba(0,0,0,0.75)]"
          >
            {active === 0 && <ChatViz inView={inView} />}
            {active === 1 && <RagViz inView={inView} />}
            {active === 2 && <CodeViz inView={inView} />}
            {active === 3 && <DocsViz inView={inView} />}
          </motion.div>
        </AnimatePresence>
      </Container>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────
// VIZ: Chatbots — animated conversation
// ────────────────────────────────────────────────────────────────────
function ChatViz({ inView }: { inView: boolean }) {
  const [msgs, setMsgs] = useState(0);
  useEffect(() => {
    if (!inView || msgs >= 3) return;
    const t = setTimeout(() => setMsgs((n) => n + 1), 600 + msgs * 450);
    return () => clearTimeout(t);
  }, [inView, msgs]);

  const lines: { role: "user" | "tool" | "bot"; text: string; tool?: string }[] = [
    { role: "user", text: "What's the status of order #4821?" },
    { role: "tool", text: '{"status":"shipped","eta":"May 29"}', tool: "lookup_order" },
    { role: "bot", text: "Order #4821 shipped — arrives May 29. Want tracking details?" },
  ];

  return (
    <div className="grid lg:grid-cols-[1fr_280px]">
      <div className="flex min-h-[360px] flex-col justify-center p-8 sm:p-12">
        <div className="mx-auto w-full max-w-lg space-y-3">
          {lines.map((m, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={i < msgs ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.35 }}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {m.role === "user" && (
                <div className="max-w-[80%] border border-white/[0.08] bg-white/[0.03] px-4 py-2.5">
                  <p className="text-[13px] text-white/80">{m.text}</p>
                </div>
              )}
              {m.role === "tool" && (
                <div className="max-w-[85%] border border-[#0095FF]/15 bg-[#0095FF]/[0.03]">
                  <div className="flex items-center gap-1.5 border-b border-[#0095FF]/10 px-3 py-1">
                    <Plug className="h-2.5 w-2.5 text-[#0095FF]/50" strokeWidth={1.5} />
                    <span className="font-[var(--font-geist-mono),ui-monospace,monospace] text-[8px] tracking-[0.14em] text-[#0095FF]/50">{m.tool}</span>
                  </div>
                  <pre className="px-3 py-1.5 font-[var(--font-geist-mono),ui-monospace,monospace] text-[10px] text-[#8ecaff]/50">{m.text}</pre>
                </div>
              )}
              {m.role === "bot" && (
                <div className="max-w-[80%] border border-white/[0.06] bg-[#1B1B1B] px-4 py-2.5">
                  <p className="text-[13px] text-white/75">{m.text}</p>
                </div>
              )}
            </motion.div>
          ))}
          {msgs < 3 && (
            <div className="flex gap-1 px-1 py-2">
              {[0, 1, 2].map((d) => <motion.span key={d} animate={{ opacity: [0.2, 0.7, 0.2] }} transition={{ duration: 1, repeat: Infinity, delay: d * 0.2 }} className="block h-1 w-1 rounded-full bg-white/35" />)}
            </div>
          )}
        </div>
      </div>
      {/* Sidebar stats */}
      <div className="hidden border-l border-white/[0.06] lg:flex lg:flex-col lg:justify-center lg:gap-6 lg:p-6">
        <Stat label="Model" value="gpt-4o-mini" />
        <Stat label="Streaming" value="enabled" />
        <Stat label="Tools" value="1 function" />
        <Stat label="Latency" value="380ms TTFT" />
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// VIZ: RAG — search → chunks → answer
// ────────────────────────────────────────────────────────────────────
function RagViz({ inView }: { inView: boolean }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const t = [setTimeout(() => setStep(1), 400), setTimeout(() => setStep(2), 1200), setTimeout(() => setStep(3), 2200)];
    return () => t.forEach(clearTimeout);
  }, [inView]);

  const chunks = [
    { title: "BYOK Key Rotation", score: 0.94 },
    { title: "Key Management Overview", score: 0.82 },
    { title: "Audit Logging", score: 0.71 },
  ];

  return (
    <div className="grid lg:grid-cols-[1fr_280px]">
      <div className="min-h-[360px] p-8 sm:p-12">
        {/* Query */}
        <div className="border-b border-white/[0.04] pb-4">
          <p className="font-[var(--font-geist-mono),ui-monospace,monospace] text-[9px] uppercase tracking-[0.14em] text-white/25">Query</p>
          <p className="mt-1 text-[14px] text-white/80">How do I rotate my BYOK encryption key?</p>
        </div>

        {/* Searching */}
        {step >= 1 && step < 2 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 py-4">
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }} className="h-3 w-3 rounded-full border border-[#0095FF]/30 border-t-[#0095FF]" />
            <span className="font-[var(--font-geist-mono),ui-monospace,monospace] text-[10px] text-white/35">Searching 412k vectors…</span>
          </motion.div>
        )}

        {/* Results */}
        {step >= 2 && (
          <div className="mt-4 space-y-[1px]">
            {chunks.map((c, i) => (
              <motion.div
                key={c.title}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: i * 0.08 }}
                className="relative flex items-center justify-between bg-white/[0.015] px-4 py-3 transition-colors hover:bg-white/[0.03]"
              >
                <motion.span initial={{ width: 0 }} animate={{ width: `${c.score * 100}%` }} transition={{ duration: 0.5, delay: i * 0.08 }} aria-hidden className="absolute inset-y-0 left-0 bg-[#0095FF]/[0.04]" />
                <span className="relative text-[12.5px] text-white/75">{c.title}</span>
                <span className="relative font-[var(--font-geist-mono),ui-monospace,monospace] text-[11px] font-semibold tabular-nums text-[#0095FF]">{c.score.toFixed(2)}</span>
              </motion.div>
            ))}
          </div>
        )}

        {/* Answer */}
        {step >= 3 && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-4 border-t border-[#0095FF]/10 bg-[#0095FF]/[0.02] px-4 py-3">
            <p className="font-[var(--font-geist-mono),ui-monospace,monospace] text-[8px] uppercase tracking-[0.14em] text-[#0095FF]/50">Answer</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-white/70">Settings → Security → Encryption Keys → Rotate Key. Re-encrypts all resources, logs for compliance.</p>
          </motion.div>
        )}
      </div>
      <div className="hidden border-l border-white/[0.06] lg:flex lg:flex-col lg:justify-center lg:gap-6 lg:p-6">
        <Stat label="Collection" value="product-docs" />
        <Stat label="Vectors" value="412,890" />
        <Stat label="Metric" value="cosine" />
        <Stat label="Latency" value="62ms" />
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// VIZ: Code — before/after with line-by-line reveal
// ────────────────────────────────────────────────────────────────────
function CodeViz({ inView }: { inView: boolean }) {
  const [lines, setLines] = useState(0);
  const output = [
    "async function processPayment(order: Order): Promise<PaymentResult> {",
    '  if (!validateCard(order.card)) throw new PaymentError("Invalid");',
    "",
    "  const subtotal = order.items.reduce((s, i) => s + i.price * i.qty, 0);",
    "  const discount = order.coupon ? await applyCoupon(order.coupon, subtotal) : 0;",
    "  const total = Math.max(0, subtotal - discount);",
    "",
    "  try {",
    "    const result = await chargeCard(order.card, total, { idempotencyKey: order.id });",
    "    await auditLog.record('payment.success', { orderId: order.id, total });",
    "    return result;",
    "  } catch (err) {",
    "    await auditLog.record('payment.failed', { orderId: order.id });",
    "    throw err;",
    "  }",
    "}",
  ];

  useEffect(() => {
    if (!inView || lines >= output.length) return;
    const t = setTimeout(() => setLines((n) => n + 1), 400 + lines * 50);
    return () => clearTimeout(t);
  }, [inView, lines, output.length]);

  return (
    <div className="grid lg:grid-cols-2">
      {/* Input */}
      <div className="border-b border-white/[0.06] lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-2.5">
          <span className="font-[var(--font-geist-mono),ui-monospace,monospace] text-[10px] tracking-[0.14em] text-white/30">input</span>
          <span className="font-[var(--font-geist-mono),ui-monospace,monospace] text-[8px] tracking-[0.14em] text-white/15">before</span>
        </div>
        <pre className="min-h-[320px] p-5 font-[var(--font-geist-mono),ui-monospace,monospace] text-[11px] leading-[19px] text-white/45">
{`function processPayment(order) {
  // TODO: validate, discount, errors
  const total = order.items.reduce(
    (s, i) => s + i.price, 0
  );
  return chargeCard(order.card, total);
}`}
        </pre>
      </div>
      {/* Output */}
      <div>
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-2.5">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-[#0095FF]" strokeWidth={1.5} />
            <span className="font-[var(--font-geist-mono),ui-monospace,monospace] text-[10px] tracking-[0.14em] text-white/45">output</span>
          </div>
          <span className="font-[var(--font-geist-mono),ui-monospace,monospace] text-[8px] tracking-[0.14em] text-[#0095FF]/35">deepseek-coder-v3</span>
        </div>
        <div className="min-h-[320px] p-5 font-[var(--font-geist-mono),ui-monospace,monospace] text-[11px] leading-[19px]">
          {output.map((line, i) => (
            <motion.div key={i} initial={{ opacity: 0 }} animate={i < lines ? { opacity: 1 } : { opacity: 0 }} transition={{ duration: 0.12 }} className="text-white/70" style={{ minHeight: "19px" }}>
              {line || " "}
            </motion.div>
          ))}
          {lines < output.length && <span className="inline-block h-3 w-[5px] animate-pulse bg-[#0095FF]" />}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// VIZ: Documents — field extraction animation
// ────────────────────────────────────────────────────────────────────
function DocsViz({ inView }: { inView: boolean }) {
  const [vis, setVis] = useState(0);
  const fields = [
    { label: "Invoice", value: "INV-2026-0491", conf: 99 },
    { label: "Vendor", value: "Acme Cloud Services", conf: 97 },
    { label: "Total", value: "$12,840.00", conf: 98 },
    { label: "Due", value: "2026-06-15", conf: 96 },
    { label: "Category", value: "Infrastructure", conf: 91 },
  ];

  useEffect(() => {
    if (!inView || vis >= fields.length) return;
    const t = setTimeout(() => setVis((n) => n + 1), 500 + vis * 160);
    return () => clearTimeout(t);
  }, [inView, vis, fields.length]);

  return (
    <div className="grid lg:grid-cols-[240px_1fr_280px]">
      {/* Document skeleton */}
      <div className="hidden border-r border-white/[0.06] p-6 lg:block">
        <p className="font-[var(--font-geist-mono),ui-monospace,monospace] text-[9px] uppercase tracking-[0.14em] text-white/25">invoice-0491.pdf</p>
        <div className="mt-4 space-y-2">
          {[0.7, 0.5, 1, 0.6, 0.8, 0.3].map((w, i) => (
            <div key={i} className="h-[4px] bg-white/[0.05]" style={{ width: `${w * 100}%` }} />
          ))}
          <div className="mt-1 space-y-1.5 border border-dashed border-[#0095FF]/20 bg-[#0095FF]/[0.02] p-2.5">
            <div className="h-[4px] w-1/2 bg-[#0095FF]/12" />
            <div className="h-[4px] w-3/4 bg-[#0095FF]/8" />
            <div className="h-[4px] w-1/3 bg-[#0095FF]/10" />
          </div>
          <div className="h-[4px] w-2/3 bg-white/[0.05]" />
          <div className="h-[4px] w-full bg-white/[0.05]" />
          <div className="h-[4px] w-1/2 bg-white/[0.05]" />
        </div>
      </div>

      {/* Extracted fields */}
      <div className="min-h-[360px]">
        <div className="flex items-center gap-2 border-b border-white/[0.06] px-5 py-2.5">
          <Search className="h-3 w-3 text-[#0095FF]" strokeWidth={1.5} />
          <span className="font-[var(--font-geist-mono),ui-monospace,monospace] text-[10px] tracking-[0.14em] text-white/40">extracted · json mode</span>
        </div>
        <div className="divide-y divide-white/[0.04]">
          {fields.map((f, i) => (
            <motion.div
              key={f.label}
              initial={{ opacity: 0, x: -6 }}
              animate={i < vis ? { opacity: 1, x: 0 } : { opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-white/[0.015]"
            >
              <div>
                <p className="font-[var(--font-geist-mono),ui-monospace,monospace] text-[8px] uppercase tracking-[0.16em] text-white/25">{f.label}</p>
                <p className="mt-0.5 text-[13px] font-medium text-white/80">{f.value}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-[var(--font-geist-mono),ui-monospace,monospace] text-[10px] tabular-nums text-[#0095FF]">{f.conf}%</span>
                <CheckCircle2 className="h-3 w-3 text-emerald-400/70" strokeWidth={2} />
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Sidebar stats */}
      <div className="hidden border-l border-white/[0.06] lg:flex lg:flex-col lg:justify-center lg:gap-6 lg:p-6">
        <Stat label="Model" value="gpt-4o" />
        <Stat label="Context" value="128k tokens" />
        <Stat label="Output" value="json_object" />
        <Stat label="Fields" value={`${vis}/${fields.length}`} />
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Shared
// ────────────────────────────────────────────────────────────────────
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-[var(--font-geist-mono),ui-monospace,monospace] text-[8px] uppercase tracking-[0.16em] text-white/25">{label}</p>
      <p className="mt-1 font-[var(--font-geist-mono),ui-monospace,monospace] text-[12px] tabular-nums text-white/65">{value}</p>
    </div>
  );
}
