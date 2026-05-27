"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Braces, CheckCircle2, FileSearch, Terminal } from "lucide-react";

import { Container } from "@/components/ui/container";

const FIELDS = [
  { label: "Invoice Number", value: "INV-2026-0491", confidence: 99 },
  { label: "Vendor", value: "Acme Cloud Services Ltd.", confidence: 97 },
  { label: "Total Amount", value: "$12,840.00", confidence: 98 },
  { label: "Due Date", value: "2026-06-15", confidence: 96 },
  { label: "Category", value: "Infrastructure", confidence: 91 },
  { label: "PO Number", value: "PO-8842-Q2", confidence: 94 },
];

const CODE = `const result = await fetch("https://api.cs2hvh.com/v1/chat/completions", {
  method: "POST",
  headers: { Authorization: \`Bearer \${KEY}\` },
  body: JSON.stringify({
    model: "openai/gpt-4o",
    response_format: { type: "json_object" },
    messages: [{
      role: "system",
      content: "Extract: invoice_number, vendor, total, due_date, category, po_number."
    }, {
      role: "user",
      content: documentText  // up to 128k tokens
    }]
  })
});`;

export default function UseCasesDocsSection() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visibleFields, setVisibleFields] = useState(0);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (!ref.current || inView) return;
    const obs = new IntersectionObserver((e) => { if (e[0]?.isIntersecting) setInView(true); }, { threshold: 0.2 });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [inView]);

  useEffect(() => {
    if (!inView || visibleFields >= FIELDS.length) return;
    const t = window.setTimeout(() => setVisibleFields((n) => n + 1), 500 + visibleFields * 180);
    return () => window.clearTimeout(t);
  }, [inView, visibleFields]);

  return (
    <section ref={ref} id="docs" className="relative z-10 bg-[#0a0a0a] py-16 lg:py-24">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[60%] h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <Container>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.5 }}
          className="flex items-start gap-4"
        >
          <FileSearch className="mt-1 h-6 w-6 shrink-0 text-[#0095FF]" strokeWidth={1.5} />
          <div>
            <p className="font-[var(--font-geist-mono),ui-monospace,monospace] text-[10.5px] uppercase tracking-[0.16em] text-white/40">
              04 · Document Intelligence
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.025em] text-white sm:text-4xl lg:text-[44px]">
              Extract structure from any document
            </h2>
          </div>
        </motion.div>

        <div className="mt-3 flex gap-3 pl-10">
          {["Long context", "JSON mode", "Batches"].map((t) => (
            <span key={t} className="border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 font-[var(--font-geist-mono),ui-monospace,monospace] text-[10px] tracking-[0.12em] text-white/45">{t}</span>
          ))}
        </div>

        {/* Three columns: doc + extraction + code */}
        <div className="mt-12 grid gap-[1px] bg-white/[0.04] lg:grid-cols-[minmax(0,0.6fr)_minmax(0,0.8fr)_minmax(0,1fr)]">
          {/* Doc preview */}
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.5 }}
            className="bg-[#0a0a0a] shadow-[0px_5px_17.7px_rgba(0,0,0,0.75)]"
          >
            <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
              <span className="font-[var(--font-geist-mono),ui-monospace,monospace] text-[10px] tracking-[0.14em] text-white/40">invoice-0491.pdf</span>
            </div>
            <div className="space-y-2.5 p-4">
              {[0.75, 0.5, 1, 0.66, 0.8, 0.33].map((w, i) => (
                <div key={i} className="h-[5px] bg-white/[0.06]" style={{ width: `${w * 100}%` }} />
              ))}
              {/* Highlighted extraction zone */}
              <div className="mt-1 space-y-2 border border-dashed border-[#0095FF]/25 bg-[#0095FF]/[0.02] p-3">
                <div className="h-[5px] w-1/2 bg-[#0095FF]/15" />
                <div className="h-[5px] w-3/4 bg-[#0095FF]/10" />
                <div className="h-[5px] w-1/3 bg-[#0095FF]/12" />
              </div>
              <div className="h-[5px] w-2/3 bg-white/[0.06]" />
              <div className="h-[5px] w-full bg-white/[0.06]" />
            </div>
            <div className="border-t border-white/[0.06] px-4 py-2 font-[var(--font-geist-mono),ui-monospace,monospace] text-[9px] tracking-[0.14em] text-white/25">
              128k ctx · full document
            </div>
          </motion.div>

          {/* Extracted fields */}
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.5, delay: 0.08 }}
            className="bg-[#0a0a0a] shadow-[0px_5px_17.7px_rgba(0,0,0,0.75)]"
          >
            <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
              <div className="flex items-center gap-2 font-[var(--font-geist-mono),ui-monospace,monospace] text-[10px] tracking-[0.14em] text-white/40">
                <Braces className="h-3.5 w-3.5 text-[#0095FF]" strokeWidth={1.5} />
                extracted
              </div>
              <span className="font-[var(--font-geist-mono),ui-monospace,monospace] text-[9px] tracking-[0.14em] text-white/20">json mode</span>
            </div>

            <div className="divide-y divide-white/[0.04]">
              {FIELDS.map((f, i) => (
                <motion.div
                  key={f.label}
                  initial={{ opacity: 0, x: -8 }}
                  animate={i < visibleFields ? { opacity: 1, x: 0 } : { opacity: 0, x: -8 }}
                  transition={{ duration: 0.3, ease: [0.25, 0.4, 0.25, 1] }}
                  className="flex items-center justify-between px-4 py-2.5 transition-colors hover:bg-white/[0.02]"
                >
                  <div>
                    <p className="font-[var(--font-geist-mono),ui-monospace,monospace] text-[8.5px] uppercase tracking-[0.16em] text-white/30">{f.label}</p>
                    <p className="mt-0.5 text-[12.5px] font-medium text-white/80">{f.value}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-[var(--font-geist-mono),ui-monospace,monospace] text-[10px] tabular-nums text-[#0095FF]">{f.confidence}%</span>
                    <CheckCircle2 className="h-3 w-3 text-emerald-400/80" strokeWidth={2} />
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="border-t border-white/[0.06] px-4 py-2 font-[var(--font-geist-mono),ui-monospace,monospace] text-[9px] tracking-[0.14em] text-white/25">
              {visibleFields >= FIELDS.length ? `${FIELDS.length} fields` : "extracting…"}
            </div>
          </motion.div>

          {/* Code */}
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.5, delay: 0.16 }}
            className="bg-[#0a0a0a] shadow-[0px_5px_17.7px_rgba(0,0,0,0.75)]"
          >
            <div className="flex items-center border-b border-white/[0.06] px-5 py-3">
              <div className="flex items-center gap-2 font-[var(--font-geist-mono),ui-monospace,monospace] text-[10.5px] tracking-[0.14em] text-white/45">
                <Terminal className="h-3.5 w-3.5 text-white/30" strokeWidth={1.5} />
                extract.ts
              </div>
            </div>
            <pre className="overflow-x-auto p-5 font-[var(--font-geist-mono),ui-monospace,monospace] text-[11px] leading-[19px] text-white/70">{CODE}</pre>
          </motion.div>
        </div>
      </Container>
    </section>
  );
}
