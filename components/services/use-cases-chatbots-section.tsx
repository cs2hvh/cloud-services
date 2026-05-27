"use client";

import { motion, useScroll, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Bot, MessageSquare, Plug, Terminal } from "lucide-react";

import { Container } from "@/components/ui/container";

const MESSAGES = [
  { role: "user" as const, text: "What's the status of order #4821?" },
  {
    role: "tool" as const,
    name: "lookup_order",
    text: '{"order_id":"4821","status":"shipped","eta":"May 29"}',
  },
  {
    role: "assistant" as const,
    text: "Order #4821 shipped yesterday — arrives May 29. Want tracking details sent to your email?",
  },
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
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const [visibleMsgs, setVisibleMsgs] = useState(0);
  const [inView, setInView] = useState(false);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start 80%", "start 20%"],
  });
  const headerY = useTransform(scrollYProgress, [0, 1], [30, 0]);
  const headerOpacity = useTransform(scrollYProgress, [0, 0.4], [0, 1]);

  useEffect(() => {
    if (!sectionRef.current || inView) return;
    const obs = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) setInView(true); },
      { threshold: 0.25 }
    );
    obs.observe(sectionRef.current);
    return () => obs.disconnect();
  }, [inView]);

  useEffect(() => {
    if (!inView || visibleMsgs >= MESSAGES.length) return;
    const t = window.setTimeout(() => setVisibleMsgs((n) => n + 1), 700 + visibleMsgs * 500);
    return () => window.clearTimeout(t);
  }, [inView, visibleMsgs]);

  return (
    <section ref={sectionRef} className="relative isolate overflow-clip bg-[#04060a] py-28 sm:py-36">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.18]"
        style={{ background: "radial-gradient(55% 40% at 30% 30%, rgba(0,149,255,0.28), transparent 70%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          maskImage: "radial-gradient(ellipse 80% 60% at 50% 50%, black, transparent 80%)",
          WebkitMaskImage: "radial-gradient(ellipse 80% 60% at 50% 50%, black, transparent 80%)",
        }}
      />

      <Container className="relative z-10">
        <motion.div style={{ y: headerY, opacity: headerOpacity }}>
          <div className="flex items-center gap-3">
            <IconBadge icon={Bot} />
            <div>
              <p className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-white/35">Use case 01</p>
              <p className="font-mono text-[12px] uppercase tracking-[0.20em] text-[#8ecaff]">Chatbots &amp; Agents</p>
            </div>
          </div>
          <h2 className="mt-7 max-w-xl text-3xl font-[400] leading-[1.08] tracking-tight text-white sm:text-4xl lg:text-[3rem]">
            Conversations that <span className="text-[#8ecaff]">take action.</span>
          </h2>
          <div className="mt-5 flex flex-wrap gap-2">
            {["Streaming", "Tool calling", "Memory"].map((t) => (
              <Tag key={t} label={t} />
            ))}
          </div>
        </motion.div>

        <div className="mt-12 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:gap-10">
          {/* Chat viz */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="relative overflow-hidden rounded-[16px] border border-white/[0.08] bg-[#0b0d12] shadow-[0_28px_72px_rgba(0,0,0,0.5)]"
          >
            <CardAccent />
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
              <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.18em] text-white/55">
                <MessageSquare className="h-3.5 w-3.5 text-[#33adff]" strokeWidth={1.8} />
                support-copilot
              </div>
              <LiveDot />
            </div>

            <div className="space-y-3 p-5">
              {MESSAGES.map((m, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
                  animate={i < visibleMsgs ? { opacity: 1, y: 0, filter: "blur(0px)" } : {}}
                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {m.role === "user" ? (
                    <div className="max-w-[85%] rounded-[10px] rounded-tr-[3px] bg-[#0095FF]/15 px-4 py-3">
                      <p className="text-[13px] leading-relaxed text-white/85">{m.text}</p>
                    </div>
                  ) : m.role === "tool" ? (
                    <div className="max-w-[90%] overflow-hidden rounded-[8px] border border-[#33adff]/20 bg-[#0095FF]/[0.04]">
                      <div className="flex items-center gap-1.5 border-b border-[#33adff]/10 px-3 py-1.5">
                        <Plug className="h-3 w-3 text-[#33adff]/70" strokeWidth={1.8} />
                        <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#33adff]/70">{m.name}</span>
                      </div>
                      <pre className="px-3 py-2 font-mono text-[10.5px] text-[#8ecaff]/65">{m.text}</pre>
                    </div>
                  ) : (
                    <div className="max-w-[85%] rounded-[10px] rounded-tl-[3px] border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                      <p className="text-[13px] leading-relaxed text-white/80">{m.text}</p>
                    </div>
                  )}
                </motion.div>
              ))}

              {visibleMsgs < MESSAGES.length && (
                <div className="flex justify-start">
                  <div className="flex gap-1 px-4 py-3">
                    {[0, 1, 2].map((d) => (
                      <motion.span
                        key={d}
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 1.2, repeat: Infinity, delay: d * 0.2 }}
                        className="block h-1.5 w-1.5 rounded-full bg-white/40"
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>

          {/* Code */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="relative overflow-hidden rounded-[16px] border border-white/[0.08] bg-[#0b0d12] shadow-[0_28px_72px_rgba(0,0,0,0.5)]"
          >
            <CardAccent />
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
              <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.18em] text-white/55">
                <Terminal className="h-3.5 w-3.5 text-[#33adff]" strokeWidth={1.8} />
                agent.ts
              </div>
              <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/30">streaming + tools</span>
            </div>
            <pre className="overflow-x-auto p-6 font-mono text-[11.5px] leading-[20px] text-white/80">{CODE}</pre>
          </motion.div>
        </div>
      </Container>
    </section>
  );
}

function IconBadge({ icon: Icon }: { icon: typeof Bot }) {
  return (
    <div className="relative">
      <span aria-hidden className="pointer-events-none absolute -inset-3 rounded-2xl blur-xl" style={{ background: "radial-gradient(50% 50%, rgba(0,149,255,0.45), transparent 70%)" }} />
      <span aria-hidden className="pointer-events-none absolute -inset-[3px] rounded-[14px]" style={{ background: "conic-gradient(from 140deg, rgba(51,173,255,0.55), rgba(0,149,255,0.05), rgba(51,173,255,0.55))" }} />
      <div className="relative flex h-12 w-12 items-center justify-center rounded-[12px] border border-[#33adff]/50 bg-gradient-to-br from-[#0095FF]/30 to-[#0095FF]/5 shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_6px_20px_rgba(0,149,255,0.35)]">
        <Icon className="h-5 w-5 text-white" strokeWidth={1.6} />
      </div>
    </div>
  );
}

function CardAccent() {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[2px]" style={{ background: "linear-gradient(90deg, transparent, rgba(51,173,255,0.85), transparent)", boxShadow: "0 0 16px rgba(0,149,255,0.55)" }} />
  );
}

function LiveDot() {
  return (
    <span className="relative flex h-1.5 w-1.5">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
    </span>
  );
}

function Tag({ label }: { label: string }) {
  return (
    <span className="rounded-[5px] border border-[#33adff]/20 bg-[#0095FF]/[0.06] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[#33adff]/85">
      {label}
    </span>
  );
}
