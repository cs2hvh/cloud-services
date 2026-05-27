"use client";

import { motion, useScroll, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Brain, Database, Search, Sparkles, Terminal } from "lucide-react";

import { Container } from "@/components/ui/container";

const QUERY = "How do I rotate my BYOK encryption key?";

const CHUNKS = [
  { id: "sec-041", title: "BYOK Key Rotation Procedure", score: 0.94, source: "security-guide.md" },
  { id: "sec-038", title: "Key Management Overview", score: 0.82, source: "architecture.md" },
  { id: "sec-055", title: "Compliance & Audit Logging", score: 0.71, source: "compliance.md" },
];

const ANSWER = 'Go to Settings → Security → Encryption Keys and click "Rotate Key." Re-encrypts all active resources with the new key, logs the rotation for compliance.';

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
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const [step, setStep] = useState(0);
  const [inView, setInView] = useState(false);

  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start 80%", "start 20%"] });
  const headerY = useTransform(scrollYProgress, [0, 1], [30, 0]);
  const headerOpacity = useTransform(scrollYProgress, [0, 0.4], [0, 1]);

  useEffect(() => {
    if (!sectionRef.current || inView) return;
    const obs = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) setInView(true); },
      { threshold: 0.2 }
    );
    obs.observe(sectionRef.current);
    return () => obs.disconnect();
  }, [inView]);

  useEffect(() => {
    if (!inView) return;
    const timers = [
      setTimeout(() => setStep(1), 500),
      setTimeout(() => setStep(2), 1400),
      setTimeout(() => setStep(3), 2800),
    ];
    return () => timers.forEach(clearTimeout);
  }, [inView]);

  return (
    <section ref={sectionRef} className="relative isolate overflow-clip bg-[#0E0F0F] py-28 sm:py-36">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.18]" style={{ background: "radial-gradient(55% 40% at 70% 30%, rgba(0,149,255,0.25), transparent 70%)" }} />
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: "radial-gradient(rgba(255,255,255,0.5) 1px, transparent 1px)",
        backgroundSize: "32px 32px",
        maskImage: "radial-gradient(ellipse 80% 60% at 50% 50%, black, transparent 80%)",
        WebkitMaskImage: "radial-gradient(ellipse 80% 60% at 50% 50%, black, transparent 80%)",
      }} />

      <Container className="relative z-10">
        {/* Right-aligned header */}
        <motion.div style={{ y: headerY, opacity: headerOpacity }} className="flex flex-col items-end text-right">
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-white/35">Use case 02</p>
              <p className="font-mono text-[12px] uppercase tracking-[0.20em] text-[#8ecaff]">RAG &amp; Knowledge Search</p>
            </div>
            <div className="relative">
              <span aria-hidden className="pointer-events-none absolute -inset-3 rounded-2xl blur-xl" style={{ background: "radial-gradient(50% 50%, rgba(0,149,255,0.45), transparent 70%)" }} />
              <span aria-hidden className="pointer-events-none absolute -inset-[3px] rounded-[14px]" style={{ background: "conic-gradient(from 140deg, rgba(51,173,255,0.55), rgba(0,149,255,0.05), rgba(51,173,255,0.55))" }} />
              <div className="relative flex h-12 w-12 items-center justify-center rounded-[12px] border border-[#33adff]/50 bg-gradient-to-br from-[#0095FF]/30 to-[#0095FF]/5 shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_6px_20px_rgba(0,149,255,0.35)]">
                <Brain className="h-5 w-5 text-white" strokeWidth={1.6} />
              </div>
            </div>
          </div>
          <h2 className="mt-7 max-w-xl text-3xl font-[400] leading-[1.08] tracking-tight text-white sm:text-4xl lg:text-[3rem]">
            Your docs. <span className="text-[#8ecaff]">Instant answers.</span>
          </h2>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            {["pgvector", "Reranking", "Citations"].map((t) => (
              <span key={t} className="rounded-[5px] border border-[#33adff]/20 bg-[#0095FF]/[0.06] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[#33adff]/85">{t}</span>
            ))}
          </div>
        </motion.div>

        <div className="mt-12 grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-10">
          {/* RAG pipeline viz */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="relative overflow-hidden rounded-[16px] border border-white/[0.08] bg-[#0b0d12] shadow-[0_28px_72px_rgba(0,0,0,0.5)]"
          >
            <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[2px]" style={{ background: "linear-gradient(90deg, transparent, rgba(51,173,255,0.85), transparent)", boxShadow: "0 0 16px rgba(0,149,255,0.55)" }} />

            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
              <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.18em] text-white/55">
                <Search className="h-3.5 w-3.5 text-[#33adff]" strokeWidth={1.8} />
                vector.query
              </div>
              <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/30">cosine · 412k vectors</span>
            </div>

            {/* Query */}
            <div className="border-b border-white/[0.04] bg-black/25 px-5 py-4">
              <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/35">Query</p>
              <p className="mt-1.5 text-[13px] text-white/85">{QUERY}</p>
            </div>

            {/* Searching */}
            {step >= 1 && step < 2 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 border-b border-white/[0.04] px-5 py-3">
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="h-3.5 w-3.5 rounded-full border-2 border-[#33adff]/30 border-t-[#33adff]" />
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#33adff]/70">Searching 412,890 vectors…</span>
              </motion.div>
            )}

            {/* Chunks */}
            {step >= 2 && (
              <div className="space-y-2 px-5 py-4">
                <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/35">Top matches</p>
                {CHUNKS.map((c, i) => (
                  <motion.div
                    key={c.id}
                    initial={{ opacity: 0, x: 14 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.4, delay: i * 0.12, ease: [0.16, 1, 0.3, 1] }}
                    className="relative overflow-hidden rounded-[8px] border border-white/[0.06] bg-white/[0.015] px-4 py-3"
                  >
                    <motion.span
                      initial={{ width: 0 }}
                      animate={{ width: `${c.score * 100}%` }}
                      transition={{ duration: 0.6, delay: 0.1 + i * 0.12, ease: [0.16, 1, 0.3, 1] }}
                      aria-hidden className="absolute inset-y-0 left-0"
                      style={{ background: "linear-gradient(90deg, rgba(0,149,255,0.12), transparent 90%)" }}
                    />
                    <div className="relative flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[12.5px] font-medium text-white/85">{c.title}</p>
                        <p className="mt-0.5 font-mono text-[9.5px] text-white/35">{c.source}</p>
                      </div>
                      <span className="shrink-0 font-mono text-[12px] font-semibold tabular-nums text-[#33adff]">{c.score.toFixed(2)}</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {/* Answer */}
            {step >= 3 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="border-t border-[#33adff]/20 bg-[#0095FF]/[0.04] px-5 py-4"
              >
                <div className="flex items-center gap-2">
                  <span className="block h-1.5 w-1.5 rounded-full bg-[#33adff]" style={{ boxShadow: "0 0 6px rgba(0,149,255,0.6)" }} />
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#33adff]/70">Grounded answer</p>
                </div>
                <p className="mt-2.5 text-[13px] leading-relaxed text-white/75">{ANSWER}</p>
              </motion.div>
            )}
          </motion.div>

          {/* Code */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="relative overflow-hidden rounded-[16px] border border-white/[0.08] bg-[#0b0d12] shadow-[0_28px_72px_rgba(0,0,0,0.5)]"
          >
            <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[2px]" style={{ background: "linear-gradient(90deg, transparent, rgba(51,173,255,0.85), transparent)", boxShadow: "0 0 16px rgba(0,149,255,0.55)" }} />
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
              <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.18em] text-white/55">
                <Terminal className="h-3.5 w-3.5 text-[#33adff]" strokeWidth={1.8} />
                rag.ts
              </div>
              <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/30">query + generate</span>
            </div>
            <pre className="overflow-x-auto p-6 font-mono text-[11.5px] leading-[20px] text-white/80">{CODE}</pre>
          </motion.div>
        </div>
      </Container>
    </section>
  );
}
