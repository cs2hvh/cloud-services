"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, Terminal } from "lucide-react";

import { Container } from "@/components/ui/container";
import PixelBlast from "@/components/hero/pixel-blast";

const BRAND = "#0095FF";

const HERO_METRICS = [
  { value: "50+", label: "Models" },
  { value: "0%", label: "Markup" },
  { value: "<300ms", label: "p95 Latency" },
  { value: "Edge", label: "Multi-region" },
];

// What we type into the terminal (typed character-by-character on mount).
const TERMINAL_CMD = `curl https://api.cs2hvh.com/v1/chat/completions \\
  -H "Authorization: Bearer $AHURA_API_KEY" \\
  -d '{"model": "openai/gpt-4o-mini",
       "messages": [{"role": "user", "content": "Hi"}]}'`;

// The streamed response — appears word-by-word after the command finishes.
const TERMINAL_RESPONSE = [
  `{"id":"chatcmpl-...","model":"openai/gpt-4o-mini",`,
  `"choices":[{"message":{"role":"assistant",`,
  `"content":"Hello! How can I help you today?"},`,
  `"finish_reason":"stop"}],`,
  `"usage":{"prompt_tokens":8,"completion_tokens":11}}`,
];

type InferenceHeroSectionProps = {
  primaryAction?: { label: string; href: string };
  secondaryAction?: { label: string; href: string };
};

export default function InferenceHeroSection({
  primaryAction,
  secondaryAction,
}: InferenceHeroSectionProps) {
  // Character-by-character type animation for the curl command. Runs
  // once on mount; we don't restart on prop changes.
  const [cmdChars, setCmdChars] = useState(0);
  const [responseLines, setResponseLines] = useState(0);

  const fullCmdLength = useMemo(() => TERMINAL_CMD.length, []);

  useEffect(() => {
    if (cmdChars >= fullCmdLength) {
      // After the command finishes typing, stream the response line-by-line.
      if (responseLines < TERMINAL_RESPONSE.length) {
        const t = window.setTimeout(() => setResponseLines((n) => n + 1), 280);
        return () => window.clearTimeout(t);
      }
      return;
    }
    // ~12ms per character — fast enough to feel responsive, slow enough
    // to be readable.
    const t = window.setTimeout(() => setCmdChars((n) => Math.min(n + 2, fullCmdLength)), 12);
    return () => window.clearTimeout(t);
  }, [cmdChars, responseLines, fullCmdLength]);

  return (
    <section className="relative isolate flex min-h-screen flex-col justify-center overflow-hidden bg-[#04060a] pb-16 pt-28 sm:pb-20 sm:pt-32 lg:pb-24">
      {/* Same PixelBlast ambient backdrop the other service pages use. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 opacity-[0.55]"
      >
        <PixelBlast
          variant="circle"
          color={BRAND}
          pixelSize={5}
          patternScale={3}
          patternDensity={0.7}
          pixelSizeJitter={0.4}
          enableRipples={false}
          speed={0.3}
          edgeFade={0.4}
          transparent
        />
      </div>

      <Container className="relative z-10">
        <div className="grid gap-14 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:items-center lg:gap-16">
          {/* ─── Left: copy ──────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="max-w-2xl"
          >
            <div className="inline-flex items-center gap-2 border border-white/[0.1] bg-white/[0.03] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/56">
              <span className="h-1.5 w-1.5 rounded-full bg-[#0095FF]" />
              A.I. Labs — Inference
            </div>

            <h1 className="mt-6 max-w-3xl text-4xl font-[400] leading-[0.96] tracking-tight text-white sm:text-5xl lg:text-[5.15rem]">
              Every AI model.
              <span className="block text-[#8ecaff]">One API.</span>
            </h1>

            <p className="mt-6 max-w-xl text-[15px] leading-8 text-white/62 sm:text-[17px]">
              OpenAI- and Anthropic-compatible gateway. 50+ frontier and open-source models, one key, one bill. Streaming, tools, BYOK, semantic cache — zero markup.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              {primaryAction ? (
                <Link
                  href={primaryAction.href}
                  className="inline-flex h-11 items-center gap-2 bg-white px-6 text-sm font-medium text-black transition hover:bg-white/90"
                >
                  {primaryAction.label}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              ) : null}

              {secondaryAction ? (
                <Link
                  href={secondaryAction.href}
                  className="inline-flex h-11 items-center gap-2 border border-white/[0.12] bg-white/[0.04] px-6 text-sm font-medium text-white/78 transition hover:bg-white/[0.08] hover:text-white"
                >
                  {secondaryAction.label}
                </Link>
              ) : null}
            </div>

            <div className="mt-12 grid gap-6 sm:grid-cols-4">
              {HERO_METRICS.map((metric) => (
                <div key={metric.label} className="border-t border-white/[0.1] pt-4">
                  <div className="text-[1.15rem] font-medium tracking-tight text-white">
                    {metric.value}
                  </div>
                  <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/36">
                    {metric.label}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* ─── Right: animated terminal ────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
            className="relative"
          >
            <div className="relative mx-auto w-full max-w-[560px]">
              {/* Glow behind the terminal */}
              <div
                aria-hidden
                className="absolute -inset-6 rounded-3xl opacity-50 blur-2xl"
                style={{
                  background:
                    "radial-gradient(60% 60% at 50% 40%, rgba(0,149,255,0.35), transparent 70%)",
                }}
              />

              <div className="relative overflow-hidden rounded-xl border border-white/[0.08] bg-[#0b0d12] shadow-[0_24px_64px_rgba(0,0,0,0.45)]">
                {/* Window chrome */}
                <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
                  </div>
                  <div className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.16em] text-white/40">
                    <Terminal className="h-3 w-3" />
                    api.cs2hvh.com
                  </div>
                  <div className="w-12" />
                </div>

                {/* Terminal body */}
                <div className="px-5 py-5 font-mono text-[11.5px] leading-relaxed">
                  <pre className="whitespace-pre-wrap text-white/85">
                    <span className="text-[#8ecaff]">$ </span>
                    {TERMINAL_CMD.slice(0, cmdChars)}
                    {cmdChars < fullCmdLength && (
                      <span className="ml-px inline-block h-3.5 w-1.5 -translate-y-0.5 animate-pulse bg-white/60" />
                    )}
                  </pre>

                  {cmdChars >= fullCmdLength && responseLines > 0 && (
                    <div className="mt-3 border-t border-white/[0.06] pt-3">
                      {TERMINAL_RESPONSE.slice(0, responseLines).map((line, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.25 }}
                          className="text-white/70"
                        >
                          {line}
                        </motion.div>
                      ))}
                    </div>
                  )}

                  {/* Footer hint after both finish */}
                  {responseLines >= TERMINAL_RESPONSE.length && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.4, delay: 0.2 }}
                      className="mt-4 flex items-center gap-2 border-t border-white/[0.06] pt-3 text-[10px] uppercase tracking-[0.16em] text-white/40"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      200 OK · 412 ms · billed to platform
                    </motion.div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </Container>
    </section>
  );
}
