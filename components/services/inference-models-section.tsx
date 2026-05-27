"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

import { Container } from "@/components/ui/container";

// 12 providers we have models from today. Listed in rough "headline value"
// order so the eye lands on the frontier names first. Featured count is
// representative — the model catalog has the canonical list.
const PROVIDERS: Array<{
  name: string;
  count: string;
  featured: string;
  accent: string;
}> = [
  { name: "OpenAI",     count: "12 models", featured: "gpt-4o · o3 · o1",                  accent: "#10a37f" },
  { name: "Anthropic",  count: "6 models",  featured: "Claude 4.7 Opus · 4.5 Sonnet",       accent: "#d97706" },
  { name: "Google",     count: "8 models",  featured: "Gemini 2.5 Pro · 2.5 Flash",         accent: "#4285f4" },
  { name: "Meta",       count: "6 models",  featured: "Llama 4 Scout · Llama 4 Maverick",   accent: "#0866ff" },
  { name: "Mistral",    count: "5 models",  featured: "Mistral Large · Codestral",          accent: "#fa520f" },
  { name: "DeepSeek",   count: "4 models",  featured: "DeepSeek-V3 · DeepSeek-Coder",       accent: "#7c3aed" },
  { name: "Qwen",       count: "5 models",  featured: "Qwen 3 · Qwen-Coder",                accent: "#615ced" },
  { name: "Cohere",     count: "3 models",  featured: "Command R+ · Embed",                 accent: "#ec4899" },
  { name: "xAI",        count: "2 models",  featured: "Grok 3",                              accent: "#a3a3a3" },
  { name: "Perplexity", count: "2 models",  featured: "Sonar Reasoning",                     accent: "#22d3ee" },
  { name: "Together",   count: "Open",      featured: "Llama, DeepSeek, Mixtral",            accent: "#4ade80" },
  { name: "Fireworks",  count: "Open",      featured: "Llama, Mistral, Phi",                 accent: "#fb923c" },
];

export default function InferenceModelsSection() {
  // Run the entry animation once the section is in view, not on mount —
  // otherwise it plays above the fold and the user misses it scrolling
  // down from the hero.
  const ref = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (!ref.current || inView) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setInView(true);
      },
      { threshold: 0.15 }
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [inView]);

  return (
    <section ref={ref} className="relative isolate overflow-hidden bg-[#0E0F0F] py-24 sm:py-32">
      {/* Subtle radial wash so the section breaks visually from the hero */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.18]"
        style={{
          background:
            "radial-gradient(80% 50% at 50% 0%, rgba(0,149,255,0.18), transparent 70%)",
        }}
      />

      <Container className="relative z-10">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
            One catalog
          </p>
          <h2 className="mt-4 text-3xl font-[400] leading-tight tracking-tight text-white sm:text-4xl lg:text-[3.25rem]">
            50+ models from{" "}
            <span className="text-[#8ecaff]">12 providers.</span>
          </h2>
          <p className="mt-5 text-[15px] leading-7 text-white/55 sm:text-[16px]">
            Switch providers with a string change, not a code rewrite. Every model in the catalog
            is reachable through the same OpenAI- or Anthropic-compatible endpoint with the same
            key, same billing, same observability.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {PROVIDERS.map((p, i) => (
            <motion.div
              key={p.name}
              initial={{ opacity: 0, y: 12 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{
                duration: 0.5,
                ease: [0.16, 1, 0.3, 1],
                delay: 0.04 * i,
              }}
              className="group relative overflow-hidden rounded-[6px] border border-white/[0.08] bg-white/[0.015] p-5 transition-colors duration-300 hover:border-white/[0.18] hover:bg-white/[0.04]"
            >
              {/* Color accent stripe on hover */}
              <span
                aria-hidden
                className="absolute inset-x-0 top-0 h-[2px] origin-left scale-x-0 transition-transform duration-500 group-hover:scale-x-100"
                style={{
                  background: `linear-gradient(90deg, ${p.accent}, transparent 80%)`,
                  boxShadow: `0 0 12px ${p.accent}`,
                }}
              />

              <div className="flex items-center justify-between">
                <h3 className="text-[15px] font-semibold tracking-tight text-white">{p.name}</h3>
                <span
                  className="h-1.5 w-1.5 rounded-full transition-shadow duration-300 group-hover:shadow-[0_0_8px_currentColor]"
                  style={{ background: p.accent, color: p.accent }}
                />
              </div>
              <p className="mt-1.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-white/40">
                {p.count}
              </p>
              <p className="mt-3 text-[12px] leading-relaxed text-white/55">{p.featured}</p>
            </motion.div>
          ))}
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-[11px] font-medium text-white/40">
          <span>Streaming on every chat model</span>
          <span className="text-white/15">·</span>
          <span>Tool calling where supported</span>
          <span className="text-white/15">·</span>
          <span>JSON mode where supported</span>
          <span className="text-white/15">·</span>
          <span>Vision on multi-modal models</span>
        </div>
      </Container>
    </section>
  );
}
