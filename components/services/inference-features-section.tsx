"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Bell,
  KeyRound,
  Layers,
  Lock,
  ShieldCheck,
  Sparkles,
  TrendingDown,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Container } from "@/components/ui/container";

type Feature = {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  body: string;
  /** Tag chips rendered under the body. Optional. */
  tags?: string[];
};

const FEATURES: Feature[] = [
  {
    icon: Layers,
    eyebrow: "Drop-in",
    title: "OpenAI- and Anthropic-compatible",
    body:
      "Point your existing SDK at our base URL and your existing code works unchanged. Streaming, tool calling, JSON mode, multi-modal — all of it.",
    tags: ["OpenAI SDK", "Anthropic SDK", "LangChain", "LlamaIndex"],
  },
  {
    icon: KeyRound,
    eyebrow: "BYOK",
    title: "Bring your own provider key",
    body:
      "Run requests through your own OpenAI / OpenRouter / Anthropic account so they bill to you. Stored encrypted at rest with AES-256-GCM; decrypted at the edge per request.",
    tags: ["AES-GCM", "Edge-decrypted", "Multi-provider"],
  },
  {
    icon: TrendingDown,
    eyebrow: "Cache",
    title: "Semantic cache cuts duplicate spend",
    body:
      "Embeds your prompt and serves cached responses for near-duplicates within a tunable cosine threshold. Opt-in per key, ZDR-aware, customer-side hit-rate visibility.",
    tags: ["Vector-similarity", "1h TTL", "Per-key opt-in"],
  },
  {
    icon: ShieldCheck,
    eyebrow: "Spend control",
    title: "Per-key and org-level hard caps",
    body:
      "Set monthly hard caps at both levels; the gateway returns 402 the moment either fires. Configurable rate limits per key. Automatic alerts at 80% / 90% / 100%.",
    tags: ["Per-key cap", "Org cap", "Spend alerts"],
  },
  {
    icon: Lock,
    eyebrow: "Privacy",
    title: "Zero Data Retention, per key",
    body:
      "Flip ZDR on for a key and prompts/responses are never logged anywhere on the platform. Caches skip entirely. Only billing metadata is retained.",
    tags: ["Per-key toggle", "No prompt logging", "RLS isolated"],
  },
  {
    icon: Activity,
    eyebrow: "Observability",
    title: "Per-key usage + audit out of the box",
    body:
      "Daily spend, latency p50/p95/p99, top models, per-key breakdown with cache-hit rate, CSV export for finance. Append-only audit log on every mutating action.",
    tags: ["CSV export", "Cache hit rate", "Audit log"],
  },
  {
    icon: Sparkles,
    eyebrow: "Routing",
    title: "Presets + fallback chains",
    body:
      "Save named routing configs (provider order, price ceiling, fallbacks) and apply via one header. One 5xx upstream doesn't take your app down.",
    tags: ["X-Ahura-Preset", "Failover", "Cost-first"],
  },
  {
    icon: Bell,
    eyebrow: "Webhooks",
    title: "Outbound HMAC-signed webhooks",
    body:
      "Get notified on every inference event (FT done, batch done, spend threshold, hosted serving ready) via in-app, email, or signed POST to your URL.",
    tags: ["HMAC-SHA256", "Per-org config", "Delivery audit log"],
  },
];

export default function InferenceFeaturesSection() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (!ref.current || inView) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setInView(true);
      },
      { threshold: 0.1 }
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [inView]);

  return (
    <section ref={ref} className="relative isolate overflow-hidden bg-[#04060a] py-24 sm:py-32">
      <Container className="relative z-10">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
            Built for production
          </p>
          <h2 className="mt-4 text-3xl font-[400] leading-tight tracking-tight text-white sm:text-4xl lg:text-[3.25rem]">
            The chrome you&apos;d{" "}
            <span className="text-[#8ecaff]">build yourself</span>{" "}
            — already there.
          </h2>
          <p className="mt-5 text-[15px] leading-7 text-white/55 sm:text-[16px]">
            We started with the assumption that you&apos;ll put real customer traffic on this.
            Spend caps, BYOK, ZDR, semantic cache, audit log, signed webhooks — table-stakes for
            an enterprise inference platform, working day one.
          </p>
        </div>

        <div className="mt-16 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 16 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{
                  duration: 0.5,
                  ease: [0.16, 1, 0.3, 1],
                  delay: 0.05 * i,
                }}
                className="group relative flex flex-col rounded-[6px] border border-white/[0.08] bg-white/[0.015] p-5 transition-all duration-300 hover:border-white/[0.18] hover:bg-white/[0.04]"
              >
                <div className="flex items-center justify-between">
                  <div className="flex h-8 w-8 items-center justify-center rounded-[5px] border border-white/[0.08] bg-white/[0.03] text-[#33adff] transition-colors group-hover:border-[#33adff]/40 group-hover:bg-[#0095FF]/[0.08]">
                    <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </div>
                  <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/40">
                    {feature.eyebrow}
                  </p>
                </div>

                <h3 className="mt-4 text-[14.5px] font-semibold leading-snug tracking-tight text-white">
                  {feature.title}
                </h3>
                <p className="mt-2 flex-1 text-[12px] leading-relaxed text-white/55">
                  {feature.body}
                </p>

                {feature.tags && feature.tags.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {feature.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-[3px] border border-white/[0.06] bg-white/[0.02] px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-white/45"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
