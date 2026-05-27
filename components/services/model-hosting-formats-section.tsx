"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Container as ContainerIcon, FileCode2, Package } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Container } from "@/components/ui/container";

type Format = {
  id: string;
  eyebrow: string;
  title: string;
  blurb: string;
  icon: LucideIcon;
  accent: string;
  status: "live" | "soon";
  bullets: string[];
  snippet: { lang: string; code: string };
};

const FORMATS: Format[] = [
  {
    id: "docker",
    eyebrow: "Source",
    title: "Docker image",
    blurb:
      "Push to GHCR / ECR / DockerHub. We pull, register, and run it as an autoscaling endpoint. Your container, your serving code.",
    icon: ContainerIcon,
    accent: "#0095FF",
    status: "live",
    bullets: [
      "Any HTTP server on a chosen port",
      "GPU SKU and worker bounds picked per deploy",
      "Image cached at the edge for sub-second cold start",
    ],
    snippet: {
      lang: "deploy.json",
      code: `{
  "source": "docker",
  "image":  "ghcr.io/acme/llm-serving:0.4.1",
  "port":   8000,
  "gpu":    "A100_80GB",
  "scale":  { "min": 0, "max": 4, "idle_seconds": 300 }
}`,
    },
  },
  {
    id: "hf",
    eyebrow: "Source",
    title: "HuggingFace model",
    blurb:
      "Drop in a HF model id. We provision a pre-built vLLM worker and load the weights at boot — no Dockerfile to write.",
    icon: Package,
    accent: "#33adff",
    status: "live",
    bullets: [
      "Gated repos supported — your HF token, encrypted at rest",
      "vLLM with continuous batching + paged attention",
      "OpenAI-compatible on the same /v1 surface",
    ],
    snippet: {
      lang: "deploy.json",
      code: `{
  "source":      "huggingface",
  "model_id":    "meta-llama/Llama-3.3-8B-Instruct",
  "gpu":         "A100_80GB",
  "hf_token_id": "tok_9f2a…",
  "scale":       { "min": 0, "max": 4 }
}`,
    },
  },
  {
    id: "truss",
    eyebrow: "Source",
    title: "Truss config",
    blurb:
      "Truss-style source build — paved path for custom serving, pre/post hooks, multi-model routing.",
    icon: FileCode2,
    accent: "#a855f7",
    status: "soon",
    bullets: [
      "config.yaml + model/ folder layout",
      "Source build pipeline (OCI output)",
      "Ships behind a feature flag — early access on request",
    ],
    snippet: {
      lang: "config.yaml",
      code: `model_name:  my-rerank-stack
python_version: py311
requirements:
  - sentence-transformers==3.0.1
resources:
  accelerator: A40
  cpu: "4"
  memory: 16Gi`,
    },
  },
];

export default function ModelHostingFormatsSection() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (!ref.current || inView) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setInView(true);
      },
      { threshold: 0.12 }
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [inView]);

  return (
    <section
      ref={ref}
      className="relative isolate overflow-hidden bg-[#04060a] py-24 sm:py-32"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.20]"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 30%, rgba(0,149,255,0.18), transparent 70%)",
        }}
      />

      <Container className="relative z-10">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
            Source formats
          </p>
          <h2 className="mt-4 text-3xl font-[400] leading-[1.05] tracking-tight text-white sm:text-4xl lg:text-[3.4rem]">
            Bring it in{" "}
            <span className="text-[#8ecaff]">the shape you have it.</span>
          </h2>
          <p className="mt-5 text-[15px] leading-7 text-white/55 sm:text-[16px]">
            Docker for full control, HuggingFace for zero-config, Truss for the paved Python path.
          </p>
        </div>

        <div className="mt-16 grid gap-4 lg:grid-cols-3">
          {FORMATS.map((f, i) => {
            const Icon = f.icon;
            const isSoon = f.status === "soon";
            return (
              <motion.div
                key={f.id}
                initial={{ opacity: 0, y: 16 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{
                  duration: 0.55,
                  ease: [0.16, 1, 0.3, 1],
                  delay: 0.05 + i * 0.08,
                }}
                className={`group relative flex flex-col overflow-hidden rounded-[10px] border p-6 transition-colors ${
                  isSoon
                    ? "border-white/[0.06] bg-white/[0.01] hover:border-white/[0.12]"
                    : "border-white/[0.08] bg-white/[0.02] hover:border-white/[0.18]"
                }`}
              >
                {/* Top accent stripe */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 h-[2px] opacity-80"
                  style={{
                    background: `linear-gradient(90deg, transparent, ${f.accent}cc, transparent)`,
                    boxShadow: `0 0 16px ${f.accent}66`,
                    opacity: isSoon ? 0.35 : 0.8,
                  }}
                />

                <div className="flex items-start justify-between">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-[6px] border text-white"
                    style={{
                      background: `linear-gradient(135deg, ${f.accent}40, ${f.accent}10)`,
                      borderColor: `${f.accent}55`,
                      boxShadow: `inset 0 1px 0 rgba(255,255,255,0.10), 0 4px 14px ${f.accent}33`,
                    }}
                  >
                    <Icon className="h-4 w-4" strokeWidth={1.75} />
                  </div>
                  <span
                    className="rounded-[3px] border px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.16em]"
                    style={
                      isSoon
                        ? {
                            borderColor: "rgba(168,85,247,0.30)",
                            background: "rgba(168,85,247,0.06)",
                            color: "rgba(216,180,254,0.85)",
                          }
                        : {
                            borderColor: "rgba(74,222,128,0.30)",
                            background: "rgba(74,222,128,0.06)",
                            color: "rgba(134,239,172,0.90)",
                          }
                    }
                  >
                    {isSoon ? "Coming soon" : "Live"}
                  </span>
                </div>

                <h3 className="mt-5 text-[20px] font-semibold leading-tight tracking-tight text-white">
                  {f.title}
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-white/55">
                  {f.blurb}
                </p>

                {/* Code preview */}
                <div className="mt-5 overflow-hidden rounded-[6px] border border-white/[0.06] bg-black/40">
                  <div className="border-b border-white/[0.04] px-3 py-1.5">
                    <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-white/35">
                      {f.snippet.lang}
                    </span>
                  </div>
                  <pre className="px-4 py-3 font-mono text-[10.5px] leading-relaxed text-white/80">
                    {f.snippet.code}
                  </pre>
                </div>

                <ul className="mt-5 space-y-2">
                  {f.bullets.map((b) => (
                    <li
                      key={b}
                      className="flex items-start gap-2 text-[12.5px] leading-relaxed text-white/65"
                    >
                      <span
                        aria-hidden
                        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{
                          background: f.accent,
                          boxShadow: `0 0 6px ${f.accent}99`,
                        }}
                      />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
