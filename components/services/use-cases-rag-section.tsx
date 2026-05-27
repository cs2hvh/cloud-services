"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Brain, Search, Terminal } from "lucide-react";

import { Container } from "@/components/ui/container";

const CHUNKS = [
  { title: "BYOK Key Rotation Procedure", score: 0.94, source: "security-guide.md" },
  { title: "Key Management Overview", score: 0.82, source: "architecture.md" },
  { title: "Compliance & Audit Logging", score: 0.71, source: "compliance.md" },
];

const ANSWER = 'Go to Settings → Security → Encryption Keys and click "Rotate Key." Re-encrypts all active resources, logs the rotation for compliance.';

const CODE = `const results = await fetch("https://api.cs2hvh.com/v1/vector/collections/docs/query", {
  method: "POST",
  headers: { Authorization: \`Bearer \${KEY}\` },
  body: JSON.stringify({ text: query, top_k: 5, metric: "cosine" })
});

const { matches } = await results.json();
const context = matches.map(m => m.text).join("\\n---\\n");

const answer = await fetch("https://api.cs2hvh.com/v1/chat/completions", {
  method: "POST",
  headers: { Authorization: \`Bearer \${KEY}\` },
  body: JSON.stringify({
    model: "openai/gpt-4o",
    messages: [
      { role: "system", content: \`Answer using:\\n\${context}\` },
      { role: "user", content: query }
    ]
  })
});`;

export default function UseCasesRagSection() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [step, setStep] = useState(0);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (!ref.current || inView) return;
    const obs = new IntersectionObserver((e) => { if (e[0]?.isIntersecting) setInView(true); }, { threshold: 0.2 });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [inView]);

  useEffect(() => {
    if (!inView) return;
    const timers = [setTimeout(() => setStep(1), 500), setTimeout(() => setStep(2), 1400), setTimeout(() => setStep(3), 2800)];
    return () => timers.forEach(clearTimeout);
  }, [inView]);

  return (
    <section ref={ref} id="rag" className="relative z-10 bg-[#0a0a0a] py-16 lg:py-24">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[60%] h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <Container>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.5 }}
          className="flex items-start gap-4"
        >
          <Brain className="mt-1 h-6 w-6 shrink-0 text-[#0095FF]" strokeWidth={1.5} />
          <div>
            <p className="font-[var(--font-geist-mono),ui-monospace,monospace] text-[10.5px] uppercase tracking-[0.16em] text-white/40">
              02 · RAG &amp; Knowledge Search
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.025em] text-white sm:text-4xl lg:text-[44px]">
              Your docs, instant answers
            </h2>
          </div>
        </motion.div>

        <div className="mt-3 flex gap-3 pl-10">
          {["pgvector", "Reranking", "Citations"].map((t) => (
            <span key={t} className="border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 font-[var(--font-geist-mono),ui-monospace,monospace] text-[10px] tracking-[0.12em] text-white/45">{t}</span>
          ))}
        </div>

        <div className="mt-12 grid gap-[1px] bg-white/[0.04] lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          {/* RAG pipeline */}
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.5 }}
            className="bg-[#0a0a0a] shadow-[0px_5px_17.7px_rgba(0,0,0,0.75)]"
          >
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
              <div className="flex items-center gap-2 font-[var(--font-geist-mono),ui-monospace,monospace] text-[10.5px] tracking-[0.14em] text-white/45">
                <Search className="h-3.5 w-3.5 text-[#0095FF]" strokeWidth={1.5} />
                vector.query
              </div>
              <span className="font-[var(--font-geist-mono),ui-monospace,monospace] text-[9px] tracking-[0.14em] text-white/20">cosine · 412k vectors</span>
            </div>

            {/* Query */}
            <div className="border-b border-white/[0.04] px-5 py-3.5">
              <p className="font-[var(--font-geist-mono),ui-monospace,monospace] text-[9px] uppercase tracking-[0.14em] text-white/30">Query</p>
              <p className="mt-1 text-[13px] text-white/80">How do I rotate my BYOK encryption key?</p>
            </div>

            {/* Searching */}
            {step >= 1 && step < 2 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 border-b border-white/[0.04] px-5 py-2.5">
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="h-3 w-3 rounded-full border border-[#0095FF]/30 border-t-[#0095FF]" />
                <span className="font-[var(--font-geist-mono),ui-monospace,monospace] text-[10px] tracking-[0.14em] text-white/40">Searching…</span>
              </motion.div>
            )}

            {/* Chunks */}
            {step >= 2 && (
              <div className="space-y-[1px] bg-white/[0.02] p-[1px]">
                {CHUNKS.map((c, i) => (
                  <motion.div
                    key={c.title}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.35, delay: i * 0.1, ease: [0.25, 0.4, 0.25, 1] }}
                    className="relative flex items-center justify-between bg-[#0a0a0a] px-5 py-3 transition-colors hover:bg-[#111]"
                  >
                    {/* Score bar */}
                    <motion.span
                      initial={{ width: 0 }}
                      animate={{ width: `${c.score * 100}%` }}
                      transition={{ duration: 0.6, delay: 0.1 + i * 0.1 }}
                      aria-hidden className="absolute inset-y-0 left-0 bg-[#0095FF]/[0.04]"
                    />
                    <div className="relative min-w-0">
                      <p className="text-[12.5px] font-medium text-white/80">{c.title}</p>
                      <p className="mt-0.5 font-[var(--font-geist-mono),ui-monospace,monospace] text-[9px] tracking-[0.12em] text-white/30">{c.source}</p>
                    </div>
                    <span className="relative shrink-0 font-[var(--font-geist-mono),ui-monospace,monospace] text-[12px] font-semibold tabular-nums text-[#0095FF]">{c.score.toFixed(2)}</span>
                  </motion.div>
                ))}
              </div>
            )}

            {/* Answer */}
            {step >= 3 && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="border-t border-[#0095FF]/10 bg-[#0095FF]/[0.02] px-5 py-4">
                <p className="font-[var(--font-geist-mono),ui-monospace,monospace] text-[9px] uppercase tracking-[0.14em] text-[#0095FF]/60">Grounded answer</p>
                <p className="mt-2 text-[13px] leading-relaxed text-white/70">{ANSWER}</p>
              </motion.div>
            )}
          </motion.div>

          {/* Code */}
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="bg-[#0a0a0a] shadow-[0px_5px_17.7px_rgba(0,0,0,0.75)]"
          >
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
              <div className="flex items-center gap-2 font-[var(--font-geist-mono),ui-monospace,monospace] text-[10.5px] tracking-[0.14em] text-white/45">
                <Terminal className="h-3.5 w-3.5 text-white/30" strokeWidth={1.5} />
                rag.ts
              </div>
            </div>
            <pre className="overflow-x-auto p-5 font-[var(--font-geist-mono),ui-monospace,monospace] text-[11.5px] leading-[20px] text-white/70">{CODE}</pre>
          </motion.div>
        </div>
      </Container>
    </section>
  );
}
