"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Code2, Sparkles, Terminal } from "lucide-react";

import { Container } from "@/components/ui/container";

const INPUT = `function processPayment(order) {
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
  const ref = useRef<HTMLDivElement | null>(null);
  const [visibleLines, setVisibleLines] = useState(0);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (!ref.current || inView) return;
    const obs = new IntersectionObserver((e) => { if (e[0]?.isIntersecting) setInView(true); }, { threshold: 0.2 });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [inView]);

  useEffect(() => {
    if (!inView || visibleLines >= OUTPUT_LINES.length) return;
    const t = window.setTimeout(() => setVisibleLines((n) => n + 1), 500 + visibleLines * 55);
    return () => window.clearTimeout(t);
  }, [inView, visibleLines]);

  return (
    <section ref={ref} id="codegen" className="relative z-10 bg-[#04060a] py-16 lg:py-24">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[60%] h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <Container>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.5 }}
          className="flex items-start gap-4"
        >
          <Code2 className="mt-1 h-6 w-6 shrink-0 text-[#0095FF]" strokeWidth={1.5} />
          <div>
            <p className="font-[var(--font-geist-mono),ui-monospace,monospace] text-[10.5px] uppercase tracking-[0.16em] text-white/40">
              03 · Code Generation
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.025em] text-white sm:text-4xl lg:text-[44px]">
              Code that writes better code
            </h2>
          </div>
        </motion.div>

        <div className="mt-3 flex gap-3 pl-10">
          {["Codestral", "DeepSeek-Coder", "Qwen-Coder"].map((t) => (
            <span key={t} className="border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 font-[var(--font-geist-mono),ui-monospace,monospace] text-[10px] tracking-[0.12em] text-white/45">{t}</span>
          ))}
        </div>

        {/* Full-width split editor */}
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.5 }}
          className="mt-12 border border-white/[0.06] bg-[#0a0a0a] shadow-[0px_5px_17.7px_rgba(0,0,0,0.75)]"
        >
          <div className="grid lg:grid-cols-2">
            {/* Input */}
            <div className="border-b border-white/[0.06] lg:border-b-0 lg:border-r">
              <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
                <div className="flex items-center gap-2 font-[var(--font-geist-mono),ui-monospace,monospace] text-[10.5px] tracking-[0.14em] text-white/35">
                  <Terminal className="h-3.5 w-3.5 text-white/25" strokeWidth={1.5} />
                  input
                </div>
                <span className="font-[var(--font-geist-mono),ui-monospace,monospace] text-[9px] tracking-[0.14em] text-white/15">before</span>
              </div>
              <pre className="p-5 font-[var(--font-geist-mono),ui-monospace,monospace] text-[11.5px] leading-[20px] text-white/50">{INPUT}</pre>
            </div>

            {/* Output */}
            <div>
              <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
                <div className="flex items-center gap-2 font-[var(--font-geist-mono),ui-monospace,monospace] text-[10.5px] tracking-[0.14em] text-white/45">
                  <Sparkles className="h-3.5 w-3.5 text-[#0095FF]" strokeWidth={1.5} />
                  output
                </div>
                <span className="font-[var(--font-geist-mono),ui-monospace,monospace] text-[9px] tracking-[0.14em] text-[#0095FF]/40">deepseek-coder-v3</span>
              </div>
              <div className="p-5 font-[var(--font-geist-mono),ui-monospace,monospace] text-[11.5px] leading-[20px]">
                {OUTPUT_LINES.map((line, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0 }}
                    animate={i < visibleLines ? { opacity: 1 } : { opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="text-white/75"
                    style={{ minHeight: "20px" }}
                  >
                    {line || " "}
                  </motion.div>
                ))}
                {visibleLines < OUTPUT_LINES.length && (
                  <span className="ml-0.5 inline-block h-3.5 w-[6px] animate-pulse bg-[#0095FF]" />
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-white/[0.06] px-5 py-2.5 font-[var(--font-geist-mono),ui-monospace,monospace] text-[9px] uppercase tracking-[0.14em] text-white/25">
            <span>{visibleLines >= OUTPUT_LINES.length ? `${OUTPUT_LINES.length} lines` : `line ${visibleLines}…`}</span>
            <span>temperature 0.1</span>
          </div>
        </motion.div>

        {/* API call */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mt-[1px] border border-white/[0.06] bg-[#0a0a0a] shadow-[0px_5px_17.7px_rgba(0,0,0,0.75)]"
        >
          <div className="flex items-center border-b border-white/[0.06] px-5 py-3">
            <span className="font-[var(--font-geist-mono),ui-monospace,monospace] text-[10.5px] tracking-[0.14em] text-white/45">codegen.ts</span>
          </div>
          <pre className="overflow-x-auto p-5 font-[var(--font-geist-mono),ui-monospace,monospace] text-[11.5px] leading-[20px] text-white/70">{CODE}</pre>
        </motion.div>
      </Container>
    </section>
  );
}
