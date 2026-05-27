"use client";

import { motion, useScroll, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";
import {
  Braces,
  CheckCircle2,
  Clock,
  FileSearch,
  FileText,
  Layers,
} from "lucide-react";

import { Container } from "@/components/ui/container";

const TAGS = ["Long context", "JSON mode", "Batches"] as const;

type ExtractedField = {
  label: string;
  value: string;
  confidence: number;
};

const FIELDS: ExtractedField[] = [
  { label: "Invoice Number", value: "INV-2026-0491", confidence: 0.99 },
  { label: "Vendor", value: "Acme Cloud Services Ltd.", confidence: 0.97 },
  { label: "Total Amount", value: "$12,840.00", confidence: 0.98 },
  { label: "Due Date", value: "2026-06-15", confidence: 0.96 },
  { label: "Category", value: "Infrastructure", confidence: 0.91 },
  { label: "PO Number", value: "PO-8842-Q2", confidence: 0.94 },
];

const CODE = `// Process a batch of documents
const batch = await fetch("https://api.cs2hvh.com/v1/chat/completions", {
  method: "POST",
  headers: { Authorization: \`Bearer \${KEY}\` },
  body: JSON.stringify({
    model: "openai/gpt-4o",
    response_format: { type: "json_object" },
    messages: [{
      role: "system",
      content: \`Extract structured fields from this invoice.
        Return JSON with: invoice_number, vendor, total, due_date,
        category, po_number. Include confidence scores.\`
    }, {
      role: "user",
      content: documentText  // up to 128k tokens
    }]
  })
});

// Parse structured output
const { invoice_number, vendor, total, ...rest } = await batch.json();`;

export default function UseCasesDocsSection() {
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const [visibleFields, setVisibleFields] = useState(0);
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
    if (visibleFields >= FIELDS.length) return;
    const t = window.setTimeout(
      () => setVisibleFields((n) => n + 1),
      600 + visibleFields * 200
    );
    return () => window.clearTimeout(t);
  }, [inView, visibleFields]);

  return (
    <section
      ref={sectionRef}
      className="relative isolate overflow-clip bg-[#F8F6F3] py-28 sm:py-36"
    >
      {/* Warm atmospheric gradient */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.55]"
        style={{
          background:
            "radial-gradient(60% 40% at 30% 20%, rgba(245,158,11,0.06), transparent 70%), radial-gradient(40% 40% at 80% 80%, rgba(0,149,255,0.04), transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.30]"
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
        {/* Header — left-aligned */}
        <motion.div style={{ y: headerY, opacity: headerOpacity }}>
          <div className="flex items-center gap-3">
            <div className="relative">
              <span
                aria-hidden
                className="pointer-events-none absolute -inset-3 rounded-2xl blur-xl"
                style={{
                  background:
                    "radial-gradient(50% 50%, rgba(245,158,11,0.35), transparent 70%)",
                }}
              />
              <span
                aria-hidden
                className="pointer-events-none absolute -inset-[3px] rounded-[14px]"
                style={{
                  background:
                    "conic-gradient(from 140deg, rgba(245,158,11,0.50), rgba(245,158,11,0.05), rgba(245,158,11,0.50))",
                }}
              />
              <div className="relative flex h-12 w-12 items-center justify-center rounded-[12px] border border-amber-400/50 bg-gradient-to-br from-amber-500/25 to-amber-500/5 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_6px_20px_rgba(245,158,11,0.25)]">
                <FileSearch
                  className="h-5 w-5 text-amber-700"
                  strokeWidth={1.6}
                />
              </div>
            </div>
            <div>
              <p className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-stone-400">
                Use case 04
              </p>
              <p className="font-mono text-[12px] uppercase tracking-[0.20em] text-amber-700">
                Document Intelligence
              </p>
            </div>
          </div>

          <h2 className="mt-8 max-w-2xl text-3xl font-[400] leading-[1.08] tracking-tight text-stone-900 sm:text-4xl lg:text-[3.2rem]">
            Extract structure{" "}
            <span className="text-amber-700">from any document.</span>
          </h2>
          <p className="mt-5 max-w-xl text-[15px] leading-[1.7] text-stone-500">
            Summarization, extraction, classification, and OCR-aware pipelines.
            JSON mode for structured output, batches for throughput, long context
            for full-document understanding.
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            {TAGS.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1.5 rounded-[6px] border border-amber-500/20 bg-amber-500/[0.06] px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.16em] text-amber-800"
              >
                {t === "Long context" && (
                  <FileText className="h-3 w-3" strokeWidth={1.8} />
                )}
                {t === "JSON mode" && (
                  <Braces className="h-3 w-3" strokeWidth={1.8} />
                )}
                {t === "Batches" && (
                  <Layers className="h-3 w-3" strokeWidth={1.8} />
                )}
                {t}
              </span>
            ))}
          </div>
        </motion.div>

        {/* ─── Three columns: doc preview + extraction + code ─── */}
        <div className="mt-14 grid gap-6 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,0.8fr)_minmax(0,1fr)] lg:gap-5">
          {/* Left: document preview */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="relative overflow-hidden rounded-[16px] border border-stone-200/80 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04),0_20px_48px_rgba(0,0,0,0.06)]"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
              style={{
                background:
                  "linear-gradient(90deg, transparent, rgba(245,158,11,0.7), transparent)",
                boxShadow: "0 0 10px rgba(245,158,11,0.2)",
              }}
            />

            <div className="flex items-center gap-2 border-b border-stone-100 px-4 py-3">
              <FileText className="h-3.5 w-3.5 text-amber-500" strokeWidth={1.8} />
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone-400">
                invoice-0491.pdf
              </span>
            </div>

            <div className="space-y-3 p-4">
              {/* Fake document lines */}
              {[
                { w: "w-3/4", dark: true },
                { w: "w-1/2", dark: false },
                { w: "w-full", dark: false },
                { w: "w-2/3", dark: false },
                { w: "w-4/5", dark: true },
                { w: "w-1/3", dark: false },
                { w: "w-full", dark: false },
                { w: "w-3/5", dark: false },
              ].map((line, i) => (
                <div
                  key={i}
                  className={`h-2.5 rounded-full ${line.w} ${line.dark ? "bg-stone-300/80" : "bg-stone-200/70"}`}
                />
              ))}

              {/* Highlighted extraction zones */}
              <div className="mt-2 space-y-2 rounded-[6px] border-2 border-dashed border-amber-400/40 bg-amber-50/50 p-3">
                <div className="h-2.5 w-1/2 rounded-full bg-amber-300/60" />
                <div className="h-2.5 w-3/4 rounded-full bg-amber-300/40" />
                <div className="h-2.5 w-1/3 rounded-full bg-amber-300/50" />
              </div>

              <div className="h-2.5 w-2/3 rounded-full bg-stone-200/70" />
              <div className="h-2.5 w-full rounded-full bg-stone-200/70" />
            </div>

            <div className="border-t border-stone-100 px-4 py-2.5 font-mono text-[9px] uppercase tracking-[0.16em] text-stone-400">
              <span className="flex items-center gap-1.5">
                <Clock className="h-3 w-3" strokeWidth={1.8} />
                128k context · full document
              </span>
            </div>
          </motion.div>

          {/* Middle: extracted fields */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{
              duration: 0.6,
              delay: 0.08,
              ease: [0.16, 1, 0.3, 1],
            }}
            className="relative overflow-hidden rounded-[16px] border border-stone-200/80 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04),0_20px_48px_rgba(0,0,0,0.06)]"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
              style={{
                background:
                  "linear-gradient(90deg, transparent, rgba(245,158,11,0.7), transparent)",
                boxShadow: "0 0 10px rgba(245,158,11,0.2)",
              }}
            />

            <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-stone-400">
                <Braces className="h-3.5 w-3.5 text-amber-500" strokeWidth={1.8} />
                extracted fields
              </div>
              <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-stone-300">
                json mode
              </span>
            </div>

            <div className="space-y-1 p-3">
              {FIELDS.map((f, i) => (
                <motion.div
                  key={f.label}
                  initial={{ opacity: 0, x: -10 }}
                  animate={
                    i < visibleFields
                      ? { opacity: 1, x: 0 }
                      : { opacity: 0, x: -10 }
                  }
                  transition={{
                    duration: 0.35,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  className="flex items-center justify-between rounded-[6px] px-3 py-2.5 transition-colors hover:bg-stone-50"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-stone-400">
                      {f.label}
                    </p>
                    <p className="mt-0.5 text-[13px] font-medium text-stone-800">
                      {f.value}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] tabular-nums text-amber-600">
                      {(f.confidence * 100).toFixed(0)}%
                    </span>
                    <CheckCircle2
                      className="h-3.5 w-3.5 text-emerald-500"
                      strokeWidth={2}
                    />
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="flex items-center justify-between border-t border-stone-100 px-4 py-2.5 font-mono text-[9px] uppercase tracking-[0.16em] text-stone-400">
              <span>
                {visibleFields >= FIELDS.length
                  ? `${FIELDS.length} fields extracted`
                  : `extracting…`}
              </span>
              <span className="text-emerald-500">
                {visibleFields >= FIELDS.length ? "complete" : ""}
              </span>
            </div>
          </motion.div>

          {/* Right: code */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{
              duration: 0.6,
              delay: 0.16,
              ease: [0.16, 1, 0.3, 1],
            }}
            className="relative overflow-hidden rounded-[16px] border border-stone-300/40 bg-[#1a1d24] shadow-[0_20px_48px_rgba(0,0,0,0.12)]"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
              style={{
                background:
                  "linear-gradient(90deg, transparent, rgba(245,158,11,0.7), transparent)",
                boxShadow: "0 0 10px rgba(245,158,11,0.2)",
              }}
            />

            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
              <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-white/55">
                extract.ts
              </span>
              <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/30">
                json mode
              </span>
            </div>

            <pre className="overflow-x-auto p-5 font-mono text-[11px] leading-[19px] text-white/80">
              {CODE}
            </pre>
          </motion.div>
        </div>
      </Container>
    </section>
  );
}
