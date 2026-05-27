"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Bot, MessageSquare, Plug, Terminal } from "lucide-react";

import { Container } from "@/components/ui/container";

const MESSAGES = [
  { role: "user" as const, text: "What's the status of order #4821?" },
  { role: "tool" as const, name: "lookup_order", text: '{"order_id":"4821","status":"shipped","eta":"May 29"}' },
  { role: "assistant" as const, text: "Order #4821 shipped yesterday — arrives May 29. Want tracking details?" },
];

const CODE = `const stream = await fetch("https://api.cs2hvh.com/v1/chat/completions", {
  method: "POST",
  headers: { Authorization: \`Bearer \${KEY}\` },
  body: JSON.stringify({
    model: "openai/gpt-4o-mini",
    stream: true,
    messages: conversation,
    tools: [{
      type: "function",
      function: {
        name: "lookup_order",
        parameters: {
          type: "object",
          properties: { order_id: { type: "string" } },
          required: ["order_id"]
        }
      }
    }]
  })
});`;

export default function UseCasesChatbotsSection() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visibleMsgs, setVisibleMsgs] = useState(0);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (!ref.current || inView) return;
    const obs = new IntersectionObserver((e) => { if (e[0]?.isIntersecting) setInView(true); }, { threshold: 0.25 });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [inView]);

  useEffect(() => {
    if (!inView || visibleMsgs >= MESSAGES.length) return;
    const t = window.setTimeout(() => setVisibleMsgs((n) => n + 1), 700 + visibleMsgs * 500);
    return () => window.clearTimeout(t);
  }, [inView, visibleMsgs]);

  return (
    <section ref={ref} id="chatbots" className="relative z-10 bg-[#04060a] py-16 lg:py-24">
      {/* Section divider */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[60%] h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <Container>
        {/* Header row */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.5 }}
          className="flex items-start gap-4"
        >
          <Bot className="mt-1 h-6 w-6 shrink-0 text-[#0095FF]" strokeWidth={1.5} />
          <div>
            <p className="font-[var(--font-geist-mono),ui-monospace,monospace] text-[10.5px] uppercase tracking-[0.16em] text-white/40">
              01 · Chatbots &amp; Agents
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.025em] text-white sm:text-4xl lg:text-[44px]">
              Conversations that take action
            </h2>
          </div>
        </motion.div>

        <div className="mt-3 flex gap-3 pl-10">
          {["Streaming", "Tool calling", "Memory"].map((t) => (
            <span key={t} className="border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 font-[var(--font-geist-mono),ui-monospace,monospace] text-[10px] tracking-[0.12em] text-white/45">
              {t}
            </span>
          ))}
        </div>

        {/* Content: chat + code side by side */}
        <div className="mt-12 grid gap-[1px] bg-white/[0.04] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          {/* Chat visualization */}
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.5 }}
            className="bg-[#0a0a0a] shadow-[0px_5px_17.7px_rgba(0,0,0,0.75)]"
          >
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
              <div className="flex items-center gap-2 font-[var(--font-geist-mono),ui-monospace,monospace] text-[10.5px] tracking-[0.14em] text-white/45">
                <MessageSquare className="h-3.5 w-3.5 text-[#0095FF]" strokeWidth={1.5} />
                support-copilot
              </div>
              <span className="flex items-center gap-1.5 font-[var(--font-geist-mono),ui-monospace,monospace] text-[9px] tracking-[0.14em] text-white/25">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" style={{ animationDuration: "2.5s" }} />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                </span>
                live
              </span>
            </div>

            <div className="space-y-3 p-5">
              {MESSAGES.map((m, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={i < visibleMsgs ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.4, ease: [0.25, 0.4, 0.25, 1] }}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {m.role === "user" ? (
                    <div className="max-w-[85%] border border-white/[0.08] bg-white/[0.03] px-4 py-2.5">
                      <p className="text-[13px] leading-relaxed text-white/80">{m.text}</p>
                    </div>
                  ) : m.role === "tool" ? (
                    <div className="max-w-[90%] border border-[#0095FF]/15 bg-[#0095FF]/[0.03]">
                      <div className="flex items-center gap-1.5 border-b border-[#0095FF]/10 px-3 py-1.5">
                        <Plug className="h-3 w-3 text-[#0095FF]/60" strokeWidth={1.5} />
                        <span className="font-[var(--font-geist-mono),ui-monospace,monospace] text-[9px] tracking-[0.14em] text-[#0095FF]/60">{m.name}</span>
                      </div>
                      <pre className="px-3 py-2 font-[var(--font-geist-mono),ui-monospace,monospace] text-[10.5px] text-[#8ecaff]/55">{m.text}</pre>
                    </div>
                  ) : (
                    <div className="max-w-[85%] border border-white/[0.06] bg-[#1B1B1B] px-4 py-2.5">
                      <p className="text-[13px] leading-relaxed text-white/75">{m.text}</p>
                    </div>
                  )}
                </motion.div>
              ))}
              {visibleMsgs < MESSAGES.length && (
                <div className="flex gap-1 px-2 py-2">
                  {[0, 1, 2].map((d) => (
                    <motion.span key={d} animate={{ opacity: [0.2, 0.8, 0.2] }} transition={{ duration: 1.2, repeat: Infinity, delay: d * 0.2 }} className="block h-1 w-1 rounded-full bg-white/40" />
                  ))}
                </div>
              )}
            </div>
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
                agent.ts
              </div>
              <span className="font-[var(--font-geist-mono),ui-monospace,monospace] text-[9px] tracking-[0.14em] text-white/20">streaming + tools</span>
            </div>
            <pre className="overflow-x-auto p-5 font-[var(--font-geist-mono),ui-monospace,monospace] text-[11.5px] leading-[20px] text-white/70">{CODE}</pre>
          </motion.div>
        </div>
      </Container>
    </section>
  );
}
