"use client";

import { motion, useScroll, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Code2, Sparkles, Terminal } from "lucide-react";

import { Container } from "@/components/ui/container";

const INPUT_CODE = `function processPayment(order) {
  // TODO: validate, discount, errors
  const total = order.items.reduce((s, i) => s + i.price, 0);
  return chargeCard(order.card, total);
}`;

const OUTPUT_LINES = [
  "async function processPayment(order: Order): Promise<PaymentResult> {",
  '  if (!order.card || !validateCard(order.card)) throw new PaymentError("Invalid card");',
  "",
  "  const subtotal = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);",
  "  const discount = order.coupon ? await applyCoupon(order.coupon, subtotal) : 0;",
  "  const total = Math.max(0, subtotal - discount);",
  "",
  "  try {",
  "    const result = await chargeCard(order.card, total, {",
  "      idempotencyKey: order.id,",
  "      metadata: { orderId: order.id, items: order.items.length },",
  "    });",
  "    await auditLog.record('payment.success', { orderId: order.id, total });",
  "    return result;",
  "  } catch (err) {",
  "    await auditLog.record('payment.failed', { orderId: order.id, error: err });",
  "    throw err;",
  "  }",
  "}",
];

const CODE = `const completion = await fetch("https://api.cs2hvh.com/v1/chat/completions", {
  method: "POST",
  headers: { Authorization: \`Bearer \${KEY}\` },
  body: JSON.stringify({
    model: "deepseek/deepseek-coder-v3",
    messages: [{ role: "user", content: \`Refactor with types and error handling:\\n\${code}\` }],
    temperature: 0.1,
    max_tokens: 2048
  })
});`;

export default function UseCasesCodegenSection() {
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const [visibleLines, setVisibleLines] = useState(0);
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
    if (!inView || visibleLines >= OUTPUT_LINES.length) return;
    const t = window.setTimeout(() => setVisibleLines((n) => n + 1), 600 + visibleLines * 60);
    return () => window.clearTimeout(t);
  }, [inView, visibleLines]);

  return (
    <section ref={sectionRef} className="relative isolate overflow-clip bg-[#04060a] py-28 sm:py-36">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.18]" style={{ background: "radial-gradient(55% 40% at 70% 30%, rgba(0,149,255,0.22), transparent 70%)" }} />
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: "radial-gradient(rgba(255,255,255,0.5) 1px, transparent 1px)",
        backgroundSize: "32px 32px",
        maskImage: "radial-gradient(ellipse 80% 60% at 50% 50%, black, transparent 80%)",
        WebkitMaskImage: "radial-gradient(ellipse 80% 60% at 50% 50%, black, transparent 80%)",
      }} />

      <Container className="relative z-10">
        {/* Centered header */}
        <motion.div style={{ y: headerY, opacity: headerOpacity }} className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-3">
            <div className="relative">
              <span aria-hidden className="pointer-events-none absolute -inset-3 rounded-2xl blur-xl" style={{ background: "radial-gradient(50% 50%, rgba(0,149,255,0.45), transparent 70%)" }} />
              <span aria-hidden className="pointer-events-none absolute -inset-[3px] rounded-[14px]" style={{ background: "conic-gradient(from 140deg, rgba(51,173,255,0.55), rgba(0,149,255,0.05), rgba(51,173,255,0.55))" }} />
              <div className="relative flex h-12 w-12 items-center justify-center rounded-[12px] border border-[#33adff]/50 bg-gradient-to-br from-[#0095FF]/30 to-[#0095FF]/5 shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_6px_20px_rgba(0,149,255,0.35)]">
                <Code2 className="h-5 w-5 text-white" strokeWidth={1.6} />
              </div>
            </div>
            <div className="text-left">
              <p className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-white/35">Use case 03</p>
              <p className="font-mono text-[12px] uppercase tracking-[0.20em] text-[#8ecaff]">Code Generation</p>
            </div>
          </div>

          <h2 className="mt-7 text-3xl font-[400] leading-[1.08] tracking-tight text-white sm:text-4xl lg:text-[3rem]">
            Code that writes <span className="text-[#8ecaff]">better code.</span>
          </h2>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {["Codestral", "DeepSeek-Coder", "Qwen-Coder"].map((t) => (
              <span key={t} className="rounded-[5px] border border-[#33adff]/20 bg-[#0095FF]/[0.06] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[#33adff]/85">{t}</span>
            ))}
          </div>
        </motion.div>

        {/* Full-width split editor */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.15 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="relative mt-14 overflow-hidden rounded-[16px] border border-white/[0.08] bg-[#0b0d12] shadow-[0_28px_72px_rgba(0,0,0,0.6)]"
        >
          <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[2px]" style={{ background: "linear-gradient(90deg, transparent, rgba(51,173,255,0.85), transparent)", boxShadow: "0 0 16px rgba(0,149,255,0.55)" }} />

          <div className="grid lg:grid-cols-2">
            {/* Input */}
            <div className="border-b border-white/[0.06] lg:border-b-0 lg:border-r">
              <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
                <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.18em] text-white/45">
                  <Terminal className="h-3.5 w-3.5 text-white/35" strokeWidth={1.8} />
                  input
                </div>
                <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/25">before</span>
              </div>
              <pre className="p-5 font-mono text-[11.5px] leading-[20px] text-white/55">{INPUT_CODE}</pre>
            </div>

            {/* Output — line-by-line */}
            <div>
              <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
                <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.18em] text-white/55">
                  <Sparkles className="h-3.5 w-3.5 text-[#33adff]" strokeWidth={1.8} />
                  output
                </div>
                <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#33adff]/50">deepseek-coder-v3</span>
              </div>
              <div className="p-5 font-mono text-[11.5px] leading-[20px]">
                {OUTPUT_LINES.map((line, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0 }}
                    animate={i < visibleLines ? { opacity: 1 } : { opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="text-white/80"
                    style={{ minHeight: "20px" }}
                  >
                    {line || " "}
                  </motion.div>
                ))}
                {visibleLines < OUTPUT_LINES.length && (
                  <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-[#33adff]" />
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-white/[0.06] px-5 py-3 font-mono text-[10px] uppercase tracking-[0.16em] text-white/30">
            <span>{visibleLines >= OUTPUT_LINES.length ? `${OUTPUT_LINES.length} lines generated` : `generating line ${visibleLines}…`}</span>
            <span className="text-[#33adff]/50">temperature 0.1</span>
          </div>
        </motion.div>

        {/* API code */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="relative mt-6 overflow-hidden rounded-[16px] border border-white/[0.08] bg-[#0b0d12]"
        >
          <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[2px]" style={{ background: "linear-gradient(90deg, transparent, rgba(51,173,255,0.85), transparent)", boxShadow: "0 0 16px rgba(0,149,255,0.55)" }} />
          <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-white/55">codegen.ts</span>
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/30">one call</span>
          </div>
          <pre className="overflow-x-auto p-6 font-mono text-[11.5px] leading-[20px] text-white/80">{CODE}</pre>
        </motion.div>
      </Container>
    </section>
  );
}
