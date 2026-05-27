"use client";

import { motion, useScroll, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Braces, CheckCircle2, Clock, FileSearch, FileText, Terminal } from "lucide-react";

import { Container } from "@/components/ui/container";

type Field = { label: string; value: string; confidence: number };

const FIELDS: Field[] = [
  { label: "Invoice Number", value: "INV-2026-0491", confidence: 0.99 },
  { label: "Vendor", value: "Acme Cloud Services Ltd.", confidence: 0.97 },
  { label: "Total Amount", value: "$12,840.00", confidence: 0.98 },
  { label: "Due Date", value: "2026-06-15", confidence: 0.96 },
  { label: "Category", value: "Infrastructure", confidence: 0.91 },
  { label: "PO Number", value: "PO-8842-Q2", confidence: 0.94 },
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
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const [visibleFields, setVisibleFields] = useState(0);
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
    if (!inView || visibleFields >= FIELDS.length) return;
    const t = window.setTimeout(() => setVisibleFields((n) => n + 1), 600 + visibleFields * 200);
    return () => window.clearTimeout(t);
  }, [inView, visibleFields]);

  return (
    <section ref={sectionRef} className="relative isolate overflow-clip bg-[#0E0F0F] py-28 sm:py-36">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.18]" style={{ background: "radial-gradient(55% 40% at 30% 70%, rgba(0,149,255,0.22), transparent 70%)" }} />
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: "radial-gradient(rgba(255,255,255,0.5) 1px, transparent 1px)",
        backgroundSize: "32px 32px",
        maskImage: "radial-gradient(ellipse 80% 60% at 50% 50%, black, transparent 80%)",
        WebkitMaskImage: "radial-gradient(ellipse 80% 60% at 50% 50%, black, transparent 80%)",
      }} />

      <Container className="relative z-10">
        <motion.div style={{ y: headerY, opacity: headerOpacity }}>
          <div className="flex items-center gap-3">
            <div className="relative">
              <span aria-hidden className="pointer-events-none absolute -inset-3 rounded-2xl blur-xl" style={{ background: "radial-gradient(50% 50%, rgba(0,149,255,0.45), transparent 70%)" }} />
              <span aria-hidden className="pointer-events-none absolute -inset-[3px] rounded-[14px]" style={{ background: "conic-gradient(from 140deg, rgba(51,173,255,0.55), rgba(0,149,255,0.05), rgba(51,173,255,0.55))" }} />
              <div className="relative flex h-12 w-12 items-center justify-center rounded-[12px] border border-[#33adff]/50 bg-gradient-to-br from-[#0095FF]/30 to-[#0095FF]/5 shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_6px_20px_rgba(0,149,255,0.35)]">
                <FileSearch className="h-5 w-5 text-white" strokeWidth={1.6} />
              </div>
            </div>
            <div>
              <p className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-white/35">Use case 04</p>
              <p className="font-mono text-[12px] uppercase tracking-[0.20em] text-[#8ecaff]">Document Intelligence</p>
            </div>
          </div>

          <h2 className="mt-7 max-w-xl text-3xl font-[400] leading-[1.08] tracking-tight text-white sm:text-4xl lg:text-[3rem]">
            Extract structure <span className="text-[#8ecaff]">from any document.</span>
          </h2>
          <div className="mt-5 flex flex-wrap gap-2">
            {["Long context", "JSON mode", "Batches"].map((t) => (
              <span key={t} className="rounded-[5px] border border-[#33adff]/20 bg-[#0095FF]/[0.06] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[#33adff]/85">{t}</span>
            ))}
          </div>
        </motion.div>

        {/* Three columns: doc preview + extraction + code */}
        <div className="mt-12 grid gap-5 lg:grid-cols-[minmax(0,0.65fr)_minmax(0,0.85fr)_minmax(0,1fr)]">
          {/* Doc preview */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="relative overflow-hidden rounded-[16px] border border-white/[0.08] bg-[#0b0d12] shadow-[0_28px_72px_rgba(0,0,0,0.5)]"
          >
            <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[2px]" style={{ background: "linear-gradient(90deg, transparent, rgba(51,173,255,0.85), transparent)", boxShadow: "0 0 16px rgba(0,149,255,0.55)" }} />

            <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
              <FileText className="h-3.5 w-3.5 text-[#33adff]" strokeWidth={1.8} />
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/45">invoice-0491.pdf</span>
            </div>

            <div className="space-y-3 p-4">
              {[
                { w: "w-3/4", o: 0.25 }, { w: "w-1/2", o: 0.15 }, { w: "w-full", o: 0.15 },
                { w: "w-2/3", o: 0.15 }, { w: "w-4/5", o: 0.25 }, { w: "w-1/3", o: 0.15 },
              ].map((line, i) => (
                <div key={i} className={`h-2 rounded-full bg-white ${line.w}`} style={{ opacity: line.o }} />
              ))}

              {/* Highlighted zone */}
              <div className="space-y-2 rounded-[6px] border border-dashed border-[#33adff]/30 bg-[#0095FF]/[0.04] p-3">
                <div className="h-2 w-1/2 rounded-full bg-[#33adff]/25" />
                <div className="h-2 w-3/4 rounded-full bg-[#33adff]/18" />
                <div className="h-2 w-1/3 rounded-full bg-[#33adff]/20" />
              </div>

              <div className="h-2 w-2/3 rounded-full bg-white/15" />
              <div className="h-2 w-full rounded-full bg-white/15" />
            </div>

            <div className="border-t border-white/[0.06] px-4 py-2.5 font-mono text-[9px] uppercase tracking-[0.16em] text-white/35">
              <span className="flex items-center gap-1.5">
                <Clock className="h-3 w-3" strokeWidth={1.8} />
                128k context · full document
              </span>
            </div>
          </motion.div>

          {/* Extracted fields */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.6, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="relative overflow-hidden rounded-[16px] border border-white/[0.08] bg-[#0b0d12] shadow-[0_28px_72px_rgba(0,0,0,0.5)]"
          >
            <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[2px]" style={{ background: "linear-gradient(90deg, transparent, rgba(51,173,255,0.85), transparent)", boxShadow: "0 0 16px rgba(0,149,255,0.55)" }} />

            <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-white/45">
                <Braces className="h-3.5 w-3.5 text-[#33adff]" strokeWidth={1.8} />
                extracted fields
              </div>
              <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/25">json mode</span>
            </div>

            <div className="space-y-1 p-3">
              {FIELDS.map((f, i) => (
                <motion.div
                  key={f.label}
                  initial={{ opacity: 0, x: -10 }}
                  animate={i < visibleFields ? { opacity: 1, x: 0 } : { opacity: 0, x: -10 }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                  className="flex items-center justify-between rounded-[6px] px-3 py-2.5 transition-colors hover:bg-white/[0.02]"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/35">{f.label}</p>
                    <p className="mt-0.5 text-[13px] font-medium text-white/85">{f.value}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] tabular-nums text-[#33adff]">{(f.confidence * 100).toFixed(0)}%</span>
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" strokeWidth={2} />
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-2.5 font-mono text-[9px] uppercase tracking-[0.16em] text-white/35">
              <span>{visibleFields >= FIELDS.length ? `${FIELDS.length} fields` : "extracting…"}</span>
              <span className="text-emerald-400/80">{visibleFields >= FIELDS.length ? "complete" : ""}</span>
            </div>
          </motion.div>

          {/* Code */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.6, delay: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="relative overflow-hidden rounded-[16px] border border-white/[0.08] bg-[#0b0d12] shadow-[0_28px_72px_rgba(0,0,0,0.5)]"
          >
            <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[2px]" style={{ background: "linear-gradient(90deg, transparent, rgba(51,173,255,0.85), transparent)", boxShadow: "0 0 16px rgba(0,149,255,0.55)" }} />
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
              <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.18em] text-white/55">
                <Terminal className="h-3.5 w-3.5 text-[#33adff]" strokeWidth={1.8} />
                extract.ts
              </div>
              <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/30">json mode</span>
            </div>
            <pre className="overflow-x-auto p-5 font-mono text-[11px] leading-[19px] text-white/80">{CODE}</pre>
          </motion.div>
        </div>
      </Container>
    </section>
  );
}
