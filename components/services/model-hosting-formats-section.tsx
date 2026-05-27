"use client";

import { motion, useScroll, useTransform } from "motion/react";
import { useRef, useState } from "react";
import {
  CheckCircle2,
  Container as ContainerIcon,
  FileCode2,
  Package,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Container } from "@/components/ui/container";

type Format = {
  id: string;
  title: string;
  blurb: string;
  icon: LucideIcon;
  accent: string;
  status: "live" | "soon";
  features: string[];
  snippet: { label: string; code: string };
};

const FORMATS: Format[] = [
  {
    id: "docker",
    title: "Docker image",
    blurb:
      "Push to any registry. We pull, register, and run it on autoscaling GPU workers. Your container, your serving code, any HTTP server.",
    icon: ContainerIcon,
    accent: "#33adff",
    status: "live",
    features: [
      "Any HTTP server on any port",
      "Image cached for sub-second cold start",
      "Full control over serving runtime",
      "Pin to specific GPU SKU",
    ],
    snippet: {
      label: "deploy.json",
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
    title: "HuggingFace model",
    blurb:
      "Drop in a model id. We provision a pre-built vLLM worker and load weights at boot — no Dockerfile to write, OpenAI-compatible out of the box.",
    icon: Package,
    accent: "#8ecaff",
    status: "live",
    features: [
      "Gated repos — HF token encrypted at rest",
      "vLLM with continuous batching",
      "OpenAI-compatible on /v1",
      "Zero-config serving",
    ],
    snippet: {
      label: "deploy.json",
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
    title: "Truss config",
    blurb:
      "Truss-style source builds — the paved path for custom Python serving, pre/post hooks, and multi-model routing.",
    icon: FileCode2,
    accent: "#a855f7",
    status: "soon",
    features: [
      "config.yaml + model/ folder layout",
      "Source build pipeline (OCI output)",
      "Custom pre/post processing hooks",
      "Early access — request the flag",
    ],
    snippet: {
      label: "config.yaml",
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
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const [activeTab, setActiveTab] = useState(0);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start 80%", "start 20%"],
  });

  const headerY = useTransform(scrollYProgress, [0, 1], [40, 0]);
  const headerOpacity = useTransform(scrollYProgress, [0, 0.5], [0, 1]);

  const activeFormat = FORMATS[activeTab]!;
  const Icon = activeFormat.icon;

  return (
    <section
      ref={sectionRef}
      className="relative isolate overflow-clip bg-[#04060a] py-28 sm:py-36"
    >
      {/* Atmospheric backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.18]"
        style={{
          background:
            "radial-gradient(55% 40% at 50% 20%, rgba(0,149,255,0.28), transparent 70%)",
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
        {/* Header */}
        <motion.div
          style={{ y: headerY, opacity: headerOpacity }}
          className="mx-auto max-w-3xl text-center"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.025] px-3.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.18em] text-white/55">
            <span
              aria-hidden
              className="block h-1.5 w-1.5 rounded-full bg-[#33adff]"
              style={{ boxShadow: "0 0 8px rgba(0,149,255,0.7)" }}
            />
            Source formats
          </div>
          <h2 className="mt-6 text-3xl font-[400] leading-[1.04] tracking-tight text-white sm:text-4xl lg:text-[3.6rem]">
            Bring it in{" "}
            <span className="text-[#8ecaff]">the shape you have it.</span>
          </h2>
          <p className="mt-6 text-[15px] leading-7 text-white/55 sm:text-[16.5px]">
            Docker for full control, HuggingFace for zero-config, Truss for the paved Python path.
          </p>
        </motion.div>

        {/* ─── Tab selector + content ─── */}
        <div className="mt-16 lg:mt-20">
          {/* Tab bar */}
          <div className="mx-auto flex max-w-2xl items-center justify-center gap-2">
            {FORMATS.map((f, i) => {
              const TabIcon = f.icon;
              const selected = i === activeTab;
              return (
                <button
                  key={f.id}
                  onClick={() => setActiveTab(i)}
                  className="group relative flex items-center gap-2.5 rounded-[10px] border px-5 py-3 font-mono text-[11.5px] uppercase tracking-[0.16em] transition-all duration-400"
                  style={{
                    borderColor: selected
                      ? `${f.accent}55`
                      : "rgba(255,255,255,0.07)",
                    background: selected
                      ? `${f.accent}08`
                      : "rgba(255,255,255,0.015)",
                    color: selected ? f.accent : "rgba(255,255,255,0.5)",
                  }}
                >
                  {selected && (
                    <motion.span
                      layoutId="format-tab-glow"
                      aria-hidden
                      className="pointer-events-none absolute inset-x-0 top-0 h-[2px] rounded-full"
                      style={{
                        background: `linear-gradient(90deg, transparent, ${f.accent}cc, transparent)`,
                        boxShadow: `0 0 14px ${f.accent}66`,
                      }}
                      transition={{ type: "spring", stiffness: 350, damping: 30 }}
                    />
                  )}
                  <TabIcon
                    className="h-3.5 w-3.5 transition-colors"
                    strokeWidth={1.8}
                  />
                  {f.title}
                  {f.status === "soon" && (
                    <span className="rounded-[3px] border border-violet-400/25 bg-violet-400/[0.06] px-1 py-px text-[8px] text-violet-300/80">
                      Soon
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Content: two columns — left blurb + features, right code */}
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 14, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-10"
          >
            {/* Left: description + features */}
            <div className="relative overflow-hidden rounded-[14px] border border-white/[0.08] bg-white/[0.015] p-7 sm:p-8">
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-[2px] opacity-70"
                style={{
                  background: `linear-gradient(90deg, transparent, ${activeFormat.accent}cc, transparent)`,
                  boxShadow: `0 0 16px ${activeFormat.accent}55`,
                }}
              />

              <div className="flex items-center justify-between">
                {/* Icon badge */}
                <div className="relative">
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -inset-3 rounded-2xl blur-xl"
                    style={{
                      background: `radial-gradient(50% 50% at 50% 50%, ${activeFormat.accent}40, transparent 70%)`,
                    }}
                  />
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -inset-[3px] rounded-[14px]"
                    style={{
                      background: `conic-gradient(from 140deg at 50% 50%, ${activeFormat.accent}55, ${activeFormat.accent}08, ${activeFormat.accent}55)`,
                    }}
                  />
                  <div
                    className="relative flex h-12 w-12 items-center justify-center rounded-[12px] border"
                    style={{
                      background: `linear-gradient(135deg, ${activeFormat.accent}30, ${activeFormat.accent}08)`,
                      borderColor: `${activeFormat.accent}50`,
                      boxShadow: `inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -8px 16px ${activeFormat.accent}18, 0 6px 20px ${activeFormat.accent}30`,
                    }}
                  >
                    <Icon className="h-5 w-5 text-white" strokeWidth={1.6} />
                  </div>
                </div>

                <span
                  className="rounded-[4px] border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.18em]"
                  style={
                    activeFormat.status === "live"
                      ? {
                          borderColor: "rgba(74,222,128,0.30)",
                          background: "rgba(74,222,128,0.06)",
                          color: "rgba(134,239,172,0.90)",
                        }
                      : {
                          borderColor: "rgba(168,85,247,0.30)",
                          background: "rgba(168,85,247,0.06)",
                          color: "rgba(216,180,254,0.85)",
                        }
                  }
                >
                  {activeFormat.status === "live" ? "Live" : "Coming soon"}
                </span>
              </div>

              <h3 className="mt-6 text-[22px] font-medium leading-tight tracking-tight text-white sm:text-[26px]">
                {activeFormat.title}
              </h3>
              <p className="mt-3 text-[14px] leading-relaxed text-white/55">
                {activeFormat.blurb}
              </p>

              <ul className="mt-7 space-y-3">
                {activeFormat.features.map((f, i) => (
                  <motion.li
                    key={f}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{
                      duration: 0.35,
                      delay: 0.15 + i * 0.06,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    className="flex items-start gap-2.5 text-[13px] leading-relaxed text-white/70"
                  >
                    <CheckCircle2
                      className="mt-0.5 h-3.5 w-3.5 shrink-0"
                      strokeWidth={1.8}
                      style={{ color: `${activeFormat.accent}cc` }}
                    />
                    <span>{f}</span>
                  </motion.li>
                ))}
              </ul>
            </div>

            {/* Right: code snippet */}
            <div className="relative overflow-hidden rounded-[14px] border border-white/[0.08] bg-[#0b0d12]">
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-[2px] opacity-70"
                style={{
                  background: `linear-gradient(90deg, transparent, ${activeFormat.accent}cc, transparent)`,
                  boxShadow: `0 0 16px ${activeFormat.accent}55`,
                }}
              />

              <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
                <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.18em] text-white/55">
                  <FileCode2 className="h-3.5 w-3.5" style={{ color: activeFormat.accent }} />
                  {activeFormat.snippet.label}
                </div>
                <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/30">
                  paste and deploy
                </span>
              </div>

              <div className="relative p-6">
                {/* Line numbers */}
                <div className="absolute left-6 top-6 flex flex-col items-end">
                  {activeFormat.snippet.code.split("\n").map((_, i) => (
                    <span
                      key={i}
                      className="block h-[20px] font-mono text-[11.5px] leading-[20px] text-white/15 tabular-nums"
                    >
                      {i + 1}
                    </span>
                  ))}
                </div>

                <pre className="overflow-x-auto pl-8 font-mono text-[11.5px] leading-[20px] text-white/85">
                  {activeFormat.snippet.code}
                </pre>
              </div>

              <div className="flex items-center justify-between border-t border-white/[0.06] px-5 py-3 font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/35">
                <span>
                  {activeFormat.snippet.code.split("\n").length} lines
                </span>
                <span style={{ color: `${activeFormat.accent}aa` }}>
                  {activeFormat.id === "docker"
                    ? "any OCI registry"
                    : activeFormat.id === "hf"
                      ? "zero-config"
                      : "source build"}
                </span>
              </div>
            </div>
          </motion.div>
        </div>
      </Container>
    </section>
  );
}
