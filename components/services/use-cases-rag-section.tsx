"use client";

import { motion, useScroll, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Brain, Database, FileText, Search, Sparkles } from "lucide-react";

import { Container } from "@/components/ui/container";

const TAGS = ["pgvector", "Reranking", "Citations"] as const;

const QUERY = "How do I rotate my BYOK encryption key?";

const CHUNKS = [
  {
    id: "sec-041",
    title: "BYOK Key Rotation Procedure",
    excerpt:
      "To rotate your BYOK encryption key, navigate to Settings → Security → Encryption Keys. Click 'Rotate Key' and confirm...",
    score: 0.94,
    source: "security-guide.md",
  },
  {
    id: "sec-038",
    title: "Key Management Overview",
    excerpt:
      "AhuraCloud encrypts all customer data at rest using AES-256-GCM. Each organization's BYOK key is stored...",
    score: 0.82,
    source: "architecture.md",
  },
  {
    id: "sec-055",
    title: "Compliance & Audit Logging",
    excerpt:
      "Every key rotation event is logged with the operator, timestamp, and old key version for SOC 2 compliance...",
    score: 0.71,
    source: "compliance.md",
  },
];

const ANSWER =
  'Go to **Settings → Security → Encryption Keys** and click "Rotate Key." The system re-encrypts all active resources with the new key and logs the rotation for compliance. Old key versions are retained for 30 days to decrypt historical audit records.';

const CODE = `// 1. Query your vector collection
const results = await fetch("https://api.cs2hvh.com/v1/vector/collections/docs/query", {
  method: "POST",
  headers: { Authorization: \`Bearer \${KEY}\` },
  body: JSON.stringify({
    text: "How do I rotate my BYOK key?",
    top_k: 5,
    metric: "cosine"
  })
});

// 2. Hand retrieved context to any model
const { matches } = await results.json();
const context = matches.map(m => m.text).join("\\n---\\n");

const answer = await fetch("https://api.cs2hvh.com/v1/chat/completions", {
  method: "POST",
  headers: { Authorization: \`Bearer \${KEY}\` },
  body: JSON.stringify({
    model: "openai/gpt-4o",
    messages: [
      { role: "system", content: \`Answer using this context:\\n\${context}\` },
      { role: "user", content: "How do I rotate my BYOK key?" }
    ]
  })
});`;

export default function UseCasesRagSection() {
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const [step, setStep] = useState(0); // 0=idle, 1=searching, 2=chunks, 3=answer
  const [inView, setInView] = useState(false);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start 80%", "start 20%"],
  });

  const headerY = useTransform(scrollYProgress, [0, 1], [40, 0]);
  const headerOpacity = useTransform(scrollYProgress, [0, 0.4], [0, 1]);

  useEffect(() => {
    if (!sectionRef.current || inView) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setInView(true);
      },
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
    <section
      ref={sectionRef}
      className="relative isolate overflow-clip bg-[#FAFBFC] py-28 sm:py-36"
    >
      {/* Light atmospheric gradient — subtle brand presence */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.55]"
        style={{
          background:
            "radial-gradient(60% 40% at 70% 20%, rgba(0,149,255,0.06), transparent 70%), radial-gradient(40% 40% at 20% 80%, rgba(34,197,94,0.04), transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "radial-gradient(rgba(0,0,0,0.04) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          maskImage:
            "radial-gradient(ellipse 80% 60% at 50% 50%, black, transparent 80%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 60% at 50% 50%, black, transparent 80%)",
        }}
      />

      <Container className="relative z-10">
        {/* Header */}
        <motion.div
          style={{ y: headerY, opacity: headerOpacity }}
          className="flex flex-col items-end text-right"
        >
          <div className="flex items-center gap-3">
            <div>
              <p className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-black/35">
                Use case 02
              </p>
              <p className="font-mono text-[12px] uppercase tracking-[0.20em] text-emerald-600">
                RAG &amp; Knowledge Search
              </p>
            </div>
            <div className="relative">
              <span
                aria-hidden
                className="pointer-events-none absolute -inset-3 rounded-2xl blur-xl"
                style={{
                  background:
                    "radial-gradient(50% 50%, rgba(34,197,94,0.35), transparent 70%)",
                }}
              />
              <span
                aria-hidden
                className="pointer-events-none absolute -inset-[3px] rounded-[14px]"
                style={{
                  background:
                    "conic-gradient(from 140deg, rgba(34,197,94,0.50), rgba(34,197,94,0.05), rgba(34,197,94,0.50))",
                }}
              />
              <div className="relative flex h-12 w-12 items-center justify-center rounded-[12px] border border-emerald-400/50 bg-gradient-to-br from-emerald-500/25 to-emerald-500/5 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_6px_20px_rgba(34,197,94,0.25)]">
                <Brain className="h-5 w-5 text-emerald-700" strokeWidth={1.6} />
              </div>
            </div>
          </div>

          <h2 className="mt-8 max-w-2xl text-3xl font-[400] leading-[1.08] tracking-tight text-gray-900 sm:text-4xl lg:text-[3.2rem]">
            Your docs.{" "}
            <span className="text-emerald-600">Instant answers.</span>
          </h2>
          <p className="mt-5 max-w-xl text-[15px] leading-[1.7] text-gray-500">
            Vector retrieval over your corpus with citation-ready answers.
            Embed, store, query, generate — all through the same API key.
          </p>

          <div className="mt-6 flex flex-wrap justify-end gap-2">
            {TAGS.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1.5 rounded-[6px] border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.16em] text-emerald-700"
              >
                {t === "pgvector" && (
                  <Database className="h-3 w-3" strokeWidth={1.8} />
                )}
                {t === "Reranking" && (
                  <Sparkles className="h-3 w-3" strokeWidth={1.8} />
                )}
                {t === "Citations" && (
                  <FileText className="h-3 w-3" strokeWidth={1.8} />
                )}
                {t}
              </span>
            ))}
          </div>
        </motion.div>

        {/* ─── Two columns: RAG viz + code ─── */}
        <div className="mt-14 grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-10">
          {/* Left: RAG pipeline visualization */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="relative overflow-hidden rounded-[16px] border border-black/[0.08] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04),0_24px_56px_rgba(0,0,0,0.06)]"
          >
            {/* Top accent — emerald */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
              style={{
                background:
                  "linear-gradient(90deg, transparent, rgba(34,197,94,0.8), transparent)",
                boxShadow: "0 0 12px rgba(34,197,94,0.3)",
              }}
            />

            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
              <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.18em] text-gray-400">
                <Search className="h-3.5 w-3.5 text-emerald-500" strokeWidth={1.8} />
                vector.query
              </div>
              <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-gray-300">
                cosine · 412k vectors
              </span>
            </div>

            {/* Query bar */}
            <div className="border-b border-gray-100 bg-gray-50/60 px-5 py-4">
              <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-gray-400">
                Query
              </p>
              <p className="mt-1.5 text-[14px] text-gray-800">{QUERY}</p>
            </div>

            {/* Search indicator */}
            {step >= 1 && step < 2 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-2 border-b border-gray-100 px-5 py-3"
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{
                    duration: 1,
                    repeat: Infinity,
                    ease: "linear",
                  }}
                  className="h-3.5 w-3.5 rounded-full border-2 border-emerald-500/30 border-t-emerald-500"
                />
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-emerald-600/70">
                  Searching 412,890 vectors…
                </span>
              </motion.div>
            )}

            {/* Retrieved chunks */}
            {step >= 2 && (
              <div className="space-y-2 px-5 py-4">
                <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-gray-400">
                  Top matches
                </p>
                {CHUNKS.map((c, i) => (
                  <motion.div
                    key={c.id}
                    initial={{ opacity: 0, x: 14 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{
                      duration: 0.4,
                      delay: i * 0.12,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    className="relative overflow-hidden rounded-[8px] border border-gray-100 bg-gray-50/50 px-4 py-3 transition-colors hover:bg-gray-50"
                  >
                    <motion.span
                      initial={{ width: 0 }}
                      animate={{ width: `${c.score * 100}%` }}
                      transition={{
                        duration: 0.6,
                        delay: 0.1 + i * 0.12,
                        ease: [0.16, 1, 0.3, 1],
                      }}
                      aria-hidden
                      className="absolute inset-y-0 left-0"
                      style={{
                        background:
                          "linear-gradient(90deg, rgba(34,197,94,0.08), transparent 90%)",
                      }}
                    />
                    <div className="relative flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[12.5px] font-medium text-gray-800">
                          {c.title}
                        </p>
                        <p className="mt-1 text-[11.5px] leading-relaxed text-gray-500">
                          {c.excerpt}
                        </p>
                        <p className="mt-1.5 font-mono text-[9.5px] text-gray-400">
                          {c.source}
                        </p>
                      </div>
                      <span className="shrink-0 font-mono text-[12px] font-semibold tabular-nums text-emerald-600">
                        {c.score.toFixed(2)}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {/* Generated answer */}
            {step >= 3 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="border-t border-emerald-200/40 bg-emerald-50/40 px-5 py-4"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="block h-1.5 w-1.5 rounded-full bg-emerald-500"
                    style={{ boxShadow: "0 0 6px rgba(34,197,94,0.5)" }}
                  />
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-700/70">
                    Grounded answer
                  </p>
                </div>
                <p className="mt-2.5 text-[13px] leading-relaxed text-gray-700">
                  {ANSWER}
                </p>
              </motion.div>
            )}
          </motion.div>

          {/* Right: code */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{
              duration: 0.6,
              delay: 0.1,
              ease: [0.16, 1, 0.3, 1],
            }}
            className="relative overflow-hidden rounded-[16px] border border-black/[0.08] bg-[#1a1d24] shadow-[0_24px_56px_rgba(0,0,0,0.12)]"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
              style={{
                background:
                  "linear-gradient(90deg, transparent, rgba(34,197,94,0.8), transparent)",
                boxShadow: "0 0 12px rgba(34,197,94,0.3)",
              }}
            />

            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
              <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-white/55">
                rag.ts
              </span>
              <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/30">
                query + generate
              </span>
            </div>

            <pre className="overflow-x-auto p-6 font-mono text-[11.5px] leading-[20px] text-white/80">
              {CODE}
            </pre>
          </motion.div>
        </div>
      </Container>
    </section>
  );
}
