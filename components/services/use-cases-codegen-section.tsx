"use client";

import { motion, useScroll, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Code2, Sparkles, Terminal } from "lucide-react";

import { Container } from "@/components/ui/container";

const TAGS = ["Codestral", "DeepSeek-Coder", "Qwen-Coder"] as const;

const INPUT_CODE = `function processPayment(order) {
  // TODO: validate card, apply discount, handle errors
  const total = order.items.reduce((s, i) => s + i.price, 0);
  return chargeCard(order.card, total);
}`;

const OUTPUT_LINES = [
  "async function processPayment(order: Order): Promise<PaymentResult> {",
  "  if (!order.card || !validateCard(order.card)) {",
  '    throw new PaymentError("Invalid card details");',
  "  }",
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
    messages: [{
      role: "user",
      content: \`Refactor this function. Add validation, error handling,
      discount support, and TypeScript types:\\n\\n\${inputCode}\`
    }],
    temperature: 0.1,   // low temp for deterministic code
    max_tokens: 2048
  })
});`;

export default function UseCasesCodegenSection() {
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const [visibleLines, setVisibleLines] = useState(0);
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
    if (visibleLines >= OUTPUT_LINES.length) return;
    const t = window.setTimeout(
      () => setVisibleLines((n) => n + 1),
      600 + visibleLines * 60
    );
    return () => window.clearTimeout(t);
  }, [inView, visibleLines]);

  return (
    <section
      ref={sectionRef}
      className="relative isolate overflow-clip bg-[#0E0F0F] py-28 sm:py-36"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.18]"
        style={{
          background:
            "radial-gradient(55% 40% at 70% 30%, rgba(168,85,247,0.28), transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          maskImage:
            "radial-gradient(ellipse 80% 60% at 50% 50%, black, transparent 80%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 60% at 50% 50%, black, transparent 80%)",
        }}
      />

      <Container className="relative z-10">
        {/* Header — centered this time */}
        <motion.div
          style={{ y: headerY, opacity: headerOpacity }}
          className="mx-auto max-w-3xl text-center"
        >
          <div className="inline-flex items-center gap-3">
            <div className="relative">
              <span
                aria-hidden
                className="pointer-events-none absolute -inset-3 rounded-2xl blur-xl"
                style={{
                  background:
                    "radial-gradient(50% 50%, rgba(168,85,247,0.45), transparent 70%)",
                }}
              />
              <span
                aria-hidden
                className="pointer-events-none absolute -inset-[3px] rounded-[14px]"
                style={{
                  background:
                    "conic-gradient(from 140deg, rgba(168,85,247,0.55), rgba(168,85,247,0.05), rgba(168,85,247,0.55))",
                }}
              />
              <div className="relative flex h-12 w-12 items-center justify-center rounded-[12px] border border-violet-400/50 bg-gradient-to-br from-violet-500/30 to-violet-500/5 shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_6px_20px_rgba(168,85,247,0.35)]">
                <Code2 className="h-5 w-5 text-white" strokeWidth={1.6} />
              </div>
            </div>
            <div className="text-left">
              <p className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-white/40">
                Use case 03
              </p>
              <p className="font-mono text-[12px] uppercase tracking-[0.20em] text-violet-300">
                Code Generation
              </p>
            </div>
          </div>

          <h2 className="mt-8 text-3xl font-[400] leading-[1.08] tracking-tight text-white sm:text-4xl lg:text-[3.2rem]">
            Code that writes{" "}
            <span className="text-violet-300">better code.</span>
          </h2>
          <p className="mt-5 text-[15px] leading-[1.7] text-white/55">
            Completion, refactoring, and review powered by frontier and
            open-source code models. Low temperature for deterministic output,
            high context for full-file understanding.
          </p>

          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {TAGS.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1.5 rounded-[6px] border border-violet-400/25 bg-violet-500/[0.06] px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.16em] text-violet-300/90"
              >
                <Sparkles className="h-3 w-3" strokeWidth={1.8} />
                {t}
              </span>
            ))}
          </div>
        </motion.div>

        {/* ─── Full-width split editor ─── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.15 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="relative mt-14 overflow-hidden rounded-[16px] border border-white/[0.08] bg-[#0b0d12] shadow-[0_28px_72px_rgba(0,0,0,0.6)]"
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
            style={{
              background:
                "linear-gradient(90deg, transparent, rgba(168,85,247,0.85), transparent)",
              boxShadow: "0 0 16px rgba(168,85,247,0.55)",
            }}
          />

          <div className="grid lg:grid-cols-2">
            {/* Left: input */}
            <div className="border-b border-white/[0.06] lg:border-b-0 lg:border-r">
              <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
                <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.18em] text-white/55">
                  <Terminal className="h-3.5 w-3.5 text-white/40" strokeWidth={1.8} />
                  input
                </div>
                <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/30">
                  before
                </span>
              </div>
              <div className="p-5">
                <pre className="font-mono text-[11.5px] leading-[20px] text-white/60">
                  {INPUT_CODE}
                </pre>
              </div>
            </div>

            {/* Right: output (line-by-line reveal) */}
            <div>
              <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
                <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.18em] text-white/55">
                  <Sparkles className="h-3.5 w-3.5 text-violet-400" strokeWidth={1.8} />
                  output
                </div>
                <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-violet-300/50">
                  deepseek-coder-v3
                </span>
              </div>
              <div className="p-5">
                <div className="font-mono text-[11.5px] leading-[20px]">
                  {OUTPUT_LINES.map((line, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0 }}
                      animate={
                        i < visibleLines ? { opacity: 1 } : { opacity: 0 }
                      }
                      transition={{ duration: 0.2 }}
                      className="text-white/80"
                      style={{
                        minHeight: "20px",
                      }}
                    >
                      {line || " "}
                    </motion.div>
                  ))}
                  {visibleLines < OUTPUT_LINES.length && (
                    <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-violet-400" />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-white/[0.06] px-5 py-3 font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">
            <span>
              {visibleLines >= OUTPUT_LINES.length
                ? `${OUTPUT_LINES.length} lines generated`
                : `generating line ${visibleLines}…`}
            </span>
            <span className="text-violet-300/60">temperature 0.1</span>
          </div>
        </motion.div>

        {/* API code below */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="relative mt-6 overflow-hidden rounded-[16px] border border-white/[0.08] bg-[#0b0d12]"
        >
          <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-white/55">
              codegen.ts
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/30">
              one call
            </span>
          </div>
          <pre className="overflow-x-auto p-6 font-mono text-[11.5px] leading-[20px] text-white/80">
            {CODE}
          </pre>
        </motion.div>
      </Container>
    </section>
  );
}
