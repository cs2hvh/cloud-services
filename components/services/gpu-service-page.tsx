"use client";

// GpuServicePage — marketing page for the GPU cloud service.
// Built around our real GPU lineup (B200, B200, H100, A100, L40S) with
// per-hour pricing, a cream contrast section for workloads, and a
// multi-node cluster CTA for enterprise.

import Link from "next/link";
import { ArrowRight, Brain } from "lucide-react";
import {
    IconSparklesFilled,
    IconBoltFilled,
    IconPhotoFilled,
    IconReceiptFilled,
    IconCloudDataConnectionFilled,
    IconStackFilled,
    IconCloudComputingFilled,
} from "@tabler/icons-react";

import { AuthAwareServiceCta } from "@/components/services/auth-aware-service-cta";
import { NvidiaLogo } from "@/components/branding/nvidia-logo";
import { Container } from "@/components/ui/container";
import PixelBlast from "@/components/hero/pixel-blast";
import { ClustersSection } from "@/components/clusters-section";
import type { Tables } from "@/lib/supabase/types";

type Product = Tables<"products">;

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const BRAND = "#0095FF";

// ─── GPU lineup ────────────────────────────────────────────────
type GpuRow = {
    id: string;
    name: string;
    arch: string;
    archTier: "blackwell" | "hopper" | "ampere" | "ada";
    memory: string;
    memoryType: string;
    perfFp8: string;
    bandwidth: string;
    pricePerHour: number;
    stock: "available" | "limited" | "request";
    href: string;
    description: string;
    featured?: boolean;
};

const GPUS: GpuRow[] = [
    {
        id: "b200",
        name: "B200",
        arch: "Blackwell",
        archTier: "blackwell",
        memory: "192 GB",
        memoryType: "HBM3e",
        perfFp8: "10 PFLOPS",
        bandwidth: "8 TB/s",
        pricePerHour: 5.49,
        stock: "limited",
        href: "/dashboard/services/gpu/deploy?gpu=b200-180",
        description: "Frontier-grade Blackwell silicon for the largest training and inference runs.",
        featured: true,
    },
    {
        id: "b200 sxm",
        name: "B200 SXM",
        arch: "Hopper",
        archTier: "hopper",
        memory: "141 GB",
        memoryType: "HBM3e",
        perfFp8: "3,958 TFLOPS",
        bandwidth: "4.8 TB/s",
        pricePerHour: 3.99,
        stock: "limited",
        href: "/dashboard/services/gpu/deploy?gpu=b200-141",
        description: "Big-memory Hopper for retrieval-heavy training and long-context inference.",
    },
    {
        id: "h100-sxm",
        name: "H100 SXM",
        arch: "Hopper",
        archTier: "hopper",
        memory: "80 GB",
        memoryType: "HBM3",
        perfFp8: "3,958 TFLOPS",
        bandwidth: "3.35 TB/s",
        pricePerHour: 2.99,
        stock: "available",
        href: "/dashboard/services/gpu/deploy?gpu=h100-sxm-80",
        description: "The flagship workhorse — balanced for pretraining, fine-tuning, and serving.",
    },
    {
        id: "h100-nvl",
        name: "H100 NVL",
        arch: "Hopper",
        archTier: "hopper",
        memory: "94 GB",
        memoryType: "HBM3",
        perfFp8: "3,958 TFLOPS",
        bandwidth: "3.9 TB/s",
        pricePerHour: 2.59,
        stock: "available",
        href: "/dashboard/services/gpu/deploy?gpu=h100-nvl-94",
        description: "PCIe-form H100 paired for inference and mid-scale fine-tuning.",
    },
    {
        id: "a100",
        name: "A100 SXM",
        arch: "Ampere",
        archTier: "ampere",
        memory: "80 GB",
        memoryType: "HBM2e",
        perfFp8: "312 TFLOPS bf16",
        bandwidth: "2 TB/s",
        pricePerHour: 1.89,
        stock: "available",
        href: "/dashboard/services/gpu/deploy?gpu=a100-80",
        description: "Proven Ampere class for general-purpose AI and HPC workloads.",
    },
    {
        id: "l40s",
        name: "L40S",
        arch: "Ada Lovelace",
        archTier: "ada",
        memory: "48 GB",
        memoryType: "GDDR6",
        perfFp8: "733 TFLOPS",
        bandwidth: "864 GB/s",
        pricePerHour: 1.49,
        stock: "available",
        href: "/dashboard/services/gpu/deploy?gpu=l40s-48",
        description: "Cost-efficient Ada Lovelace for inference, embeddings, and diffusion.",
    },
];

const ARCH_TONE: Record<GpuRow["archTier"], string> = {
    blackwell: "#a78bfa",
    hopper: "#0095FF",
    ampere: "#4ade80",
    ada: "#fbbf24",
};

const STOCK_META: Record<
    GpuRow["stock"],
    { color: string; label: string }
> = {
    available: { color: "#4ade80", label: "In stock" },
    limited: { color: "#fbbf24", label: "Limited" },
    request: { color: "#a78bfa", label: "On request" },
};

// ─── Workload categories (for the cream section) ──────────────
type Workload = {
    icon: React.ReactNode;
    accent: string;
    title: string;
    description: string;
    recommended: string[];
};

const WORKLOADS: Workload[] = [
    {
        icon: <Brain className="h-5 w-5" strokeWidth={1.7} />,
        accent: "#8B5CF6",
        title: "LLM training & pretraining",
        description:
            "Frontier model training, full fine-tunes, and large-scale pretraining on multi-node clusters with NVLink fabric.",
        recommended: ["B200", "B200 SXM"],
    },
    {
        icon: <IconSparklesFilled size={20} />,
        accent: "#0095FF",
        title: "Fine-tuning & adaptation",
        description:
            "LoRA, QLoRA, full-parameter tunes, and RLHF on 7B → 70B+ models with shared NVMe checkpoint volumes.",
        recommended: ["H100 SXM", "H100 NVL"],
    },
    {
        icon: <IconBoltFilled size={20} />,
        accent: "#F59E0B",
        title: "Production inference",
        description:
            "High-throughput LLM serving with vLLM, TGI, or TensorRT-LLM. Sub-100ms first-token latency at scale.",
        recommended: ["L40S", "H100 NVL", "B200 SXM"],
    },
    {
        icon: <IconPhotoFilled size={20} />,
        accent: "#10B981",
        title: "Diffusion, vision & multimodal",
        description:
            "SDXL, FLUX, SVD, vision encoders, and embedding pipelines on memory-flexible Ada and Hopper class GPUs.",
        recommended: ["L40S", "A100 SXM"],
    },
];

// ─── Platform features ────────────────────────────────────────
const PLATFORM_FEATURES: Array<{
    icon: React.ReactNode;
    accent: string;
    title: string;
    description: string;
}> = [
    {
        icon: <IconReceiptFilled size={20} />,
        accent: "#10B981",
        title: "Per-second billing",
        description:
            "Pay only for time the GPU is up. Stop a pod, billing stops within the second.",
    },
    {
        icon: <IconCloudDataConnectionFilled size={20} />,
        accent: "#0095FF",
        title: "NVLink + InfiniBand fabric",
        description:
            "900 GB/s GPU-to-GPU bandwidth on SXM nodes, 3.2 Tbps east-west on reserved clusters.",
    },
    {
        icon: <IconStackFilled size={20} />,
        accent: "#F59E0B",
        title: "Persistent NVMe volumes",
        description:
            "Checkpoint, dataset, and weight volumes that survive pod restarts and follow your jobs.",
    },
    {
        icon: <IconCloudComputingFilled size={20} />,
        accent: "#8B5CF6",
        title: "Single pod to 1,000+ GPUs",
        description:
            "Start with a single accelerator, scale into reserved multi-node clusters when you need to.",
    },
];

// ─── FAQ ──────────────────────────────────────────────────────
const FAQS = [
    {
        question: "How fast can I get a GPU?",
        answer:
            "On-demand pods provision in under 90 seconds for available capacity (H100, A100, L40S). Limited-stock SKUs like B200 and B200 typically provision in a few minutes. Reserved multi-node clusters are provisioned in under 24 hours after sales handoff.",
    },
    {
        question: "What's included in the per-hour price?",
        answer:
            "The GPU(s), bundled vCPU and system RAM, the container disk, public IP, ingress and egress bandwidth (with a generous monthly allowance), and persistent NVMe storage up to a quota. Egress beyond the allowance and reserved capacity are billed separately.",
    },
    {
        question: "Can I run multi-node training jobs?",
        answer:
            "Yes. SXM nodes are NVLink-fabric-connected within a chassis (900 GB/s GPU-to-GPU). Reserved clusters add InfiniBand or RoCE east-west networking (up to 3.2 Tbps) across nodes — purpose-built for distributed training with FSDP, DeepSpeed, or NVIDIA's Megatron-LM stack.",
    },
    {
        question: "How does reserved pricing work?",
        answer:
            "Commit to capacity for 1 month to 3 years and save up to 60% off the on-demand rate. Reserved capacity is dedicated, region-pinned, and SLA-backed. Talk to sales for a quote tailored to your training schedule.",
    },
    {
        question: "Do you support spot pricing for interruptible jobs?",
        answer:
            "Yes. Spot pods are roughly 50–70% cheaper than on-demand and are interruptible with 60 seconds of notice. Best fit for fault-tolerant training with checkpointing, hyperparameter sweeps, and batch inference.",
    },
    {
        question: "Which frameworks are pre-installed?",
        answer:
            "CUDA 12.4, PyTorch 2.x, JAX, TensorFlow, vLLM, TGI, TensorRT-LLM, and common scientific stacks ship in base images. You can also bring your own Docker image from any public or private registry.",
    },
];

// ─── Subcomponents ────────────────────────────────────────────

function GpuCard({ gpu, index }: { gpu: GpuRow; index: number }) {
    const tone = ARCH_TONE[gpu.archTier];
    const stock = STOCK_META[gpu.stock];
    return (
      <article
        className={`group relative flex flex-col rounded-[8px] border p-7 transition-colors hover:bg-[#161A1F] ${
          gpu.featured
            ? "border-white/[0.18] bg-[#13161B]"
            : "border-white/[0.10] bg-[#111316]"
        }`}
        style={{
          boxShadow: gpu.featured
            ? "inset 0 1px 0 rgba(255,255,255,0.07), 0 12px 32px -12px rgba(0,0,0,0.75)"
            : "inset 0 1px 0 rgba(255,255,255,0.05), 0 10px 28px -12px rgba(0,0,0,0.65)",
        }}
      >
        {/* Blue left accent — appears on hover */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-[2px] rounded-l-[8px] opacity-0 transition-opacity duration-200 group-hover:opacity-100"
          style={{ background: BRAND }}
        />

        {/* Header — index + name */}
        <div className="flex items-start justify-between">
          <span
            className={`${MONO} text-[10.5px] tabular-nums text-white/30`}
          >
            {String(index + 1).padStart(2, "0")}
          </span>

          <h3 className="text-[26px] font-semibold leading-none tracking-[-0.02em] text-white">
            {gpu.name}
          </h3>
        </div>

        <p
          className={`${MONO} mt-2 text-[10.5px] uppercase tracking-[0.16em] text-white/45`}
        >
          {gpu.memory} {gpu.memoryType}
        </p>

        <p className="mt-4 text-[13px] leading-[1.6] text-white/60">
          {gpu.description}
        </p>

        {/* Spec rows */}
        <ul className="mt-5 space-y-2 border-t border-white/[0.06] pt-4">
          <li className="flex items-baseline justify-between">
            <span
              className={`${MONO} text-[10px] uppercase tracking-[0.16em] text-white/40`}
            >
              Performance
            </span>
            <span className={`${MONO} text-[12px] tabular-nums text-white/85`}>
              {gpu.perfFp8}
            </span>
          </li>
          <li className="flex items-baseline justify-between">
            <span
              className={`${MONO} text-[10px] uppercase tracking-[0.16em] text-white/40`}
            >
              Bandwidth
            </span>
            <span className={`${MONO} text-[12px] tabular-nums text-white/85`}>
              {gpu.bandwidth}
            </span>
          </li>
        </ul>

        {/* Footer — price + stock + CTA */}
        <div className="mt-6 flex items-end justify-between gap-3 border-t border-white/[0.06] pt-5">
          <div>
            <p
              className={`${MONO} text-[9.5px] font-semibold uppercase tracking-[0.22em] text-white/45`}
            >
              From
            </p>
            <p
              className={`${MONO} mt-1 text-[26px] font-bold leading-none tabular-nums text-white`}
            >
              ${gpu.pricePerHour.toFixed(2)}
              <span className="ml-1 text-[11px] font-normal text-white/55">
                /GPU·hr
              </span>
            </p>
            <p
              className={`${MONO} mt-2 inline-flex items-center gap-1.5 text-[9.5px] uppercase tracking-[0.14em]`}
              style={{ color: stock.color }}
            >
              <span
                className="h-1 w-1 rounded-full"
                style={{
                  background: stock.color,
                  boxShadow: `0 0 4px ${stock.color}`,
                }}
              />
              {stock.label}
            </p>
          </div>
          <Link
            href={gpu.href}
            className={`${MONO} inline-flex h-10 items-center justify-center gap-1.5 border border-white/25 bg-transparent px-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-white transition-colors group-hover:border-white group-hover:bg-white group-hover:text-black`}
          >
            Deploy
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </article>
    );
}

function WorkloadCard({ w, index }: { w: Workload; index: number }) {
    return (
        <article
            className="group relative flex flex-col gap-5 overflow-hidden rounded-[10px] border border-black/10 bg-[#EEECE4] p-7 transition-colors hover:border-black/20"
        >
            {/* Accent hover glow */}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                style={{ background: `radial-gradient(circle at 30% 0%, ${w.accent}12, transparent 60%)` }}
            />

            <div className="relative flex items-start justify-between">
                <div
                    className="inline-flex h-11 w-11 items-center justify-center rounded-[6px] border transition-all group-hover:brightness-110"
                    style={{ background: `${w.accent}18`, borderColor: `${w.accent}40`, color: w.accent }}
                >
                    {w.icon}
                </div>
                <span
                    className={`${MONO} text-[10.5px] tabular-nums`}
                    style={{ color: `${w.accent}70` }}
                >
                    {String(index + 1).padStart(2, "0")}
                </span>
            </div>
            <div className="relative">
                <h3 className="text-[18px] font-semibold leading-tight tracking-[-0.01em] text-[#1A1814]">
                    {w.title}
                </h3>
                <p className="mt-2.5 text-[13.5px] leading-[1.6] text-black/60">
                    {w.description}
                </p>
            </div>
            <div className="relative mt-auto flex items-center gap-2 border-t border-black/10 pt-4">
                <span
                    className={`${MONO} text-[9.5px] font-semibold uppercase tracking-[0.18em] text-black/45`}
                >
                    Recommended
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                    {w.recommended.map((gpu) => (
                        <span
                            key={gpu}
                            className={`${MONO} inline-flex items-center gap-1 rounded-[3px] border border-black/15 bg-black/[0.03] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-black/75`}
                        >
                            <NvidiaLogo width={10} height={7} className="opacity-90" />
                            {gpu}
                        </span>
                    ))}
                </div>
            </div>
        </article>
    );
}

// ─── Main page ────────────────────────────────────────────────

export function GpuServicePage(
//     {
//     featuredProducts: _featuredProducts,
// }: {
//     featuredProducts?: Product[];
// }
) {
    //commented out featuredProducts for now since the GPU lineup is curated from real SKUs and doesn't need to be overridden from the database. Can re-add as a prop if we want to do limited-time promotions or highlight specific SKUs in the future, but for now it's simpler to keep the source of truth for the lineup in this component.
    // featuredProducts kept in signature for backwards-compat with the page route;
    // current lineup is curated from real GPU presets shipped in the dashboard.

    return (
        <main className="bg-[#04060a] text-white">
            {/* ─── 1. HERO ──────────────────────────────────────────── */}
            <section className="relative isolate flex min-h-screen flex-col justify-center overflow-hidden bg-[#04060a] pb-16 pt-28 sm:pb-20 sm:pt-32 lg:pb-24">
                {/* PixelBlast brand-blue ambient backdrop */}
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
                    <div className="mx-auto max-w-[920px] text-center">
                        <p
                            className={`${MONO} mb-6 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-white/65`}
                        >
                            GPU Cloud
                        </p>
                        <h1 className="text-5xl font-semibold leading-[0.95] tracking-[-0.035em] text-white sm:text-6xl lg:text-[80px]">
                            The AI developer
                            <br />
                            <span className="text-white/55">cloud, <span className="text-blue-500">on demand.</span></span>
                        </h1>
                        <p className="mx-auto mt-7 max-w-[660px] text-[15px] leading-[1.6] text-white/65 sm:text-[17px]">
                            Pods for building. Clusters for scaling. Reserved capacity for
                            shipping. B200, B200 SXM, H100, A100, and L40S — billed by the
                            second, NVLink-ready, in 12 regions.
                        </p>

                        <div className="cursor-pointer mt-10 flex flex-wrap items-center justify-center gap-3">
                            <AuthAwareServiceCta
                                service="gpu"
                                intent="new"
                                className={`${MONO} inline-flex h-12 items-center justify-center gap-2 border border-white bg-white px-6 text-[12px] font-semibold uppercase tracking-[0.16em] text-black transition-colors hover:bg-white/90`}
                            >
                                Launch a GPU
                                <ArrowRight className="h-4 w-4" />
                            </AuthAwareServiceCta>
                            <Link
                                href="#lineup"
                                className={`${MONO} inline-flex h-12 items-center justify-center gap-2 border border-white/20 bg-transparent px-6 text-[12px] font-semibold uppercase tracking-[0.16em] text-white transition-colors hover:border-white/40 hover:bg-white/[0.04]`}
                            >
                                See the lineup
                            </Link>
                        </div>

                        {/* Stat strip */}
                        <div className="mx-auto mt-14 grid max-w-[820px] grid-cols-2 gap-px overflow-hidden rounded-[6px] border border-white/[0.08] bg-white/[0.08] sm:grid-cols-4">
                            {[
                                { value: "<90s", label: "Provisioning" },
                                { value: "12", label: "Regions" },
                                { value: "99.99%", label: "Uptime SLA" },
                                { value: "1s", label: "Billing increment" },
                            ].map((s) => (
                                <div
                                    key={s.label}
                                    className="flex flex-col items-center gap-2 bg-[#04060a] px-4 py-5"
                                >
                                    <span
                                        className={`${MONO} text-[22px] font-bold leading-none tabular-nums text-white sm:text-[26px]`}
                                    >
                                        {s.value}
                                    </span>
                                    <span
                                        className={`${MONO} text-[10px] font-semibold uppercase tracking-[0.18em] text-white/50`}
                                    >
                                        {s.label}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </Container>
            </section>

            {/* ─── 2. GPU LINEUP ────────────────────────────────────── */}
            <section
                id="lineup"
                className="relative overflow-hidden bg-[#0D0D0F] py-20 sm:py-24 lg:py-28"
            >
                <div
                    aria-hidden="true"
                    className="absolute top-0 left-1/2 h-px w-[60%] -translate-x-1/2 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                />
                <Container className="relative z-10">
                    <div className="mx-auto max-w-[760px] text-center">
                        <p
                            className={`${MONO} mb-5 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-white/50`}
                        >
                            The lineup
                        </p>
                        <h2 className="text-3xl font-semibold leading-[1.05] tracking-[-0.02em] text-white sm:text-4xl lg:text-[44px]">
                            Every NVIDIA class,{" "}
                            <span className="text-[#0095FF]">ready to deploy</span>
                        </h2>
                        <p className="mx-auto mt-5 max-w-[600px] text-[15px] leading-[1.6] text-white/60 sm:text-[16px]">
                            From Ada Lovelace inference at $1.49 / GPU·hr to Blackwell B200 for
                            frontier training — every node is NVLink-capable, NVMe-backed, and
                            billed by the second.
                        </p>
                    </div>

                    <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 lg:gap-5">
                        {GPUS.map((gpu, i) => (
                            <GpuCard key={gpu.id} gpu={gpu} index={i} />
                        ))}
                    </div>

                    <div className="mt-10 flex flex-col items-center justify-center gap-3 border-t border-white/[0.08] pt-8 sm:flex-row sm:gap-5">
                        <p
                            className={`${MONO} text-[10.5px] uppercase tracking-[0.18em] text-white/45`}
                        >
                            Reserved capacity available · 1mo+ commitments
                        </p>
                        <Link
                            href="/dashboard/services/gpu/enterprise"
                            className={`${MONO} group inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-white transition-opacity hover:opacity-80`}
                        >
                            Talk to sales
                            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                        </Link>
                    </div>
                </Container>
            </section>

            {/* ─── 3. HOW IT WORKS ──────────────────────────────────── */}
            <section className="relative overflow-hidden bg-[#0D0D0F] py-20 sm:py-24 lg:py-28">
                <div
                    aria-hidden="true"
                    className="absolute top-0 left-1/2 h-px w-[60%] -translate-x-1/2 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                />
                <Container className="relative z-10">
                    <div className="mx-auto max-w-[760px] text-center">
                        <p
                            className={`${MONO} mb-5 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-white/50`}
                        >
                            How it works
                        </p>
                        <h2 className="text-3xl font-semibold leading-[1.05] tracking-[-0.02em] text-white sm:text-4xl lg:text-[44px]">
                            From zero to inference in four steps
                        </h2>
                        <p className="mx-auto mt-5 max-w-[600px] text-[15px] leading-[1.6] text-white/60 sm:text-[16px]">
                            No replatforming. No lock-in. No hyperscaler tax. Bring your
                            container, your framework, your code — we handle the rest.
                        </p>
                    </div>

                  <div className="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-[8px] border border-white/[0.10] bg-white/[0.08] md:grid-cols-2 lg:grid-cols-4">
                        {[
                            {
                                step: "01",
                                title: "Spin up",
                                description:
                                    "Pick a GPU, pick a region, pick a base image. Pod is ready with SSH and a public IP in under 90 seconds.",
                            },
                            {
                                step: "02",
                                title: "Build",
                                description:
                                    "Train, fine-tune, or batch-process. Your containers, your framework, your weights — persistent NVMe volumes follow your jobs.",
                            },
                            {
                                step: "03",
                                title: "Deploy",
                                description:
                                    "Push to production with templated inference endpoints, blue-green rollouts, and built-in TLS + auto-scaling.",
                            },
                            {
                                step: "04",
                                title: "Scale",
                                description:
                                    "Single pod to thousand-GPU clusters across 12 regions. Reserve capacity for predictable load, burst on demand for spikes.",
                            },
                        ].map((s) => (
                            <article
                                key={s.step}
                                className="flex flex-col gap-4 bg-[#0D0D0F] p-7"
                            >
                                <p
                                    className={`${MONO} text-[10.5px] font-semibold uppercase tracking-[0.24em] text-white/45 tabular-nums`}
                                >
                                    {s.step}
                                </p>
                                <h3 className="text-[18px] font-semibold leading-tight tracking-[-0.01em] text-white">
                                    {s.title}
                                </h3>
                                <p className="text-[13px] leading-[1.6] text-white/60">
                                    {s.description}
                                </p>
                            </article>
                        ))}
                    </div> 
                    {/* <ProcessFlow/> */}
                </Container>
            </section>

            {/* ─── 4. WHITE/CREAM CONTRAST — WORKLOADS ──────────────── */}
            <section className="relative overflow-hidden bg-[#E6E4DC] py-20 text-[#1A1814] sm:py-24 lg:py-32">
                <Container className="relative z-10">
                    <div className="mx-auto max-w-[760px] text-center">
                        <p
                            className={`${MONO} mb-5 inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-black/55`}
                        >
                            <span className="h-1.5 w-1.5 rounded-full bg-[#0095FF]" />
                            Workloads
                        </p>
                        <h2 className="text-3xl font-semibold leading-[1.05] tracking-[-0.02em] text-[#1A1814] sm:text-4xl lg:text-[46px]">
                            Picked for the work you actually do
                        </h2>
                        <p className="mx-auto mt-5 max-w-[600px] text-[15px] leading-[1.6] text-black/60 sm:text-[16px]">
                            Not sure which GPU to start with? Match the workload to the
                            silicon — and start with a single node, scale to a cluster
                            when the job demands it.
                        </p>
                    </div>

                    <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2 lg:gap-5">
                        {WORKLOADS.map((w, i) => (
                            <WorkloadCard key={w.title} w={w} index={i} />
                        ))}
                    </div>

                    {/* Inline platform features strip on cream bg */}
                    <div className="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-[10px] border border-black/10 bg-black/10 sm:grid-cols-2 lg:grid-cols-4">
                        {PLATFORM_FEATURES.map((f) => (
                                <div
                                    key={f.title}
                                    className="flex flex-col gap-3 bg-[#EEECE4] p-6"
                                >
                                    <div
                                        className="inline-flex h-10 w-10 items-center justify-center rounded-[6px] border"
                                        style={{ background: `${f.accent}18`, borderColor: `${f.accent}40`, color: f.accent }}
                                    >
                                        {f.icon}
                                    </div>
                                    <h4 className="text-[15px] font-semibold leading-tight tracking-[-0.01em] text-black">
                                        {f.title}
                                    </h4>
                                    <p className="text-[12.5px] leading-[1.55] text-black/60">
                                        {f.description}
                                    </p>
                                </div>
                        ))}
                    </div>
                </Container>
            </section>

            {/* ─── 4. CLUSTERS / ENTERPRISE — shared homepage section ── */}
            <ClustersSection />

            {/* ─── 5. FAQ ───────────────────────────────────────────── */}
            <section className="relative overflow-hidden bg-[#0D0D0F] py-20 sm:py-24 lg:py-28">
                <div
                    aria-hidden="true"
                    className="absolute top-0 left-1/2 h-px w-[60%] -translate-x-1/2 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                />
                <Container className="relative z-10">
                    <div className="mx-auto max-w-[760px] text-center">
                        <p
                            className={`${MONO} mb-5 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-white/50`}
                        >
                            FAQ
                        </p>
                        <h2 className="text-3xl font-semibold leading-[1.05] tracking-[-0.02em] text-white sm:text-4xl lg:text-[44px]">
                            Common questions
                        </h2>
                    </div>

                    <div className="mx-auto mt-12 max-w-[840px] divide-y divide-white/[0.06] border-y border-white/[0.06]">
                        {FAQS.map((f, i) => (
                            <details
                                key={f.question}
                                className="group px-2 py-5 sm:px-4"
                                open={i === 0}
                            >
                                <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                                    <div className="flex items-center gap-4">
                                        <span
                                            className={`${MONO} w-6 shrink-0 text-[11px] tabular-nums text-white/30`}
                                        >
                                            {String(i + 1).padStart(2, "0")}
                                        </span>
                                        <span className="text-[14.5px] font-medium text-white/90 sm:text-[15.5px]">
                                            {f.question}
                                        </span>
                                    </div>
                                    <ArrowRight className="h-4 w-4 shrink-0 text-white/30 transition-transform group-open:rotate-90" />
                                </summary>
                                <div className="mt-3 pl-10 pr-6">
                                    <p className="text-[13.5px] leading-[1.7] text-white/55">
                                        {f.answer}
                                    </p>
                                </div>
                            </details>
                        ))}
                    </div>
                </Container>
            </section>

            {/* ─── 6. FINAL CTA ─────────────────────────────────────── */}
            <section className="relative overflow-hidden bg-[#04060a] py-20 sm:py-24 lg:py-28">
                {/* Subtle PixelBlast accent */}
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 z-0 opacity-[0.35]"
                >
                    <PixelBlast
                        variant="circle"
                        color={BRAND}
                        pixelSize={5}
                        patternScale={3}
                        patternDensity={0.55}
                        enableRipples={false}
                        speed={0.25}
                        edgeFade={0.5}
                        transparent
                    />
                </div>

                <Container className="relative z-10">
                    <div className="mx-auto max-w-[760px] text-center">
                        <p
                            className={`${MONO} mb-5 inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-white/65`}
                        >
                            <NvidiaLogo width={16} height={11} className="opacity-95" />
                            Ready when you are
                        </p>
                        <h2 className="text-3xl font-semibold leading-[1.05] tracking-[-0.02em] text-white sm:text-4xl lg:text-[48px]">
                            The AI developer cloud
                        </h2>
                        <p className="mx-auto mt-5 max-w-[580px] text-[15px] leading-[1.6] text-white/60 sm:text-[16px]">
                            No replatforming. No lock-in. No hyperscaler tax. Pick a GPU,
                            pick a region, and you&apos;re running.
                        </p>

                        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
                            <AuthAwareServiceCta
                                service="gpu"
                                intent="new"
                                className={`${MONO} inline-flex h-12 items-center justify-center gap-2 border border-white bg-white px-6 text-[12px] font-semibold uppercase tracking-[0.16em] text-black transition-colors hover:bg-white/90`}
                            >
                                Get started
                                <ArrowRight className="h-4 w-4" />
                            </AuthAwareServiceCta>
                            <Link
                                href="/dashboard/services/gpu/enterprise"
                                className={`${MONO} inline-flex h-12 items-center justify-center gap-2 border border-white/20 bg-transparent px-6 text-[12px] font-semibold uppercase tracking-[0.16em] text-white transition-colors hover:border-white/40 hover:bg-white/[0.04]`}
                            >
                                Request a demo
                            </Link>
                        </div>
                    </div>
                </Container>
            </section>
        </main>
    );
}

export default GpuServicePage;
