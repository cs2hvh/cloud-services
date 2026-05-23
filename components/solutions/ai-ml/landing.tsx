"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Container } from "@/components/ui/container";
import { AuthAwareServiceCta } from "@/components/services/auth-aware-service-cta";
import ServicesHomeSectionFive from "@/components/serviceshome/section-5";

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

/* ──────────────────────────────────────────────────────────────
   Custom inline glyphs (24×24 viewBox, stroke-based)
   ────────────────────────────────────────────────────────────── */

function TrainGlyph() {
    // Concentric ring of nodes — distributed training
    return (
        <svg viewBox="0 0 24 24" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4}>
            <circle cx="12" cy="12" r="2" fill="currentColor" />
            {[0, 60, 120, 180, 240, 300].map((deg) => {
                const r = 8.5;
                const x = 12 + r * Math.cos((deg * Math.PI) / 180);
                const y = 12 + r * Math.sin((deg * Math.PI) / 180);
                return (
                    <g key={deg}>
                        <line x1="12" y1="12" x2={x} y2={y} strokeOpacity="0.45" />
                        <circle cx={x} cy={y} r="1.6" />
                    </g>
                );
            })}
        </svg>
    );
}

function FinetuneGlyph() {
    // Base model + delta adapter overlay
    return (
        <svg viewBox="0 0 24 24" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4}>
            <rect x="3" y="6" width="13" height="13" rx="1.5" />
            <path d="M5 10h9M5 13h7M5 16h9" strokeOpacity="0.55" />
            <rect x="13" y="3" width="8" height="8" rx="1.5" fill="currentColor" fillOpacity="0.18" />
            <path d="M15 5l4 4M15 9l4-4" strokeLinecap="round" />
        </svg>
    );
}

function InferenceGlyph() {
    // Request → router → fanout to workers
    return (
        <svg viewBox="0 0 24 24" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4}>
            <path d="M2 12h4" strokeLinecap="round" />
            <rect x="6" y="9" width="5" height="6" rx="1" fill="currentColor" fillOpacity="0.18" />
            <path d="M11 12h3M14 8.5l3-2M14 12h3M14 15.5l3 2" strokeLinecap="round" strokeOpacity="0.6" />
            <rect x="17" y="4.5" width="4" height="4" rx="0.8" />
            <rect x="17" y="10" width="4" height="4" rx="0.8" />
            <rect x="17" y="15.5" width="4" height="4" rx="0.8" />
        </svg>
    );
}

function RagGlyph() {
    // Q → embedding → vector store → context → answer
    return (
        <svg viewBox="0 0 24 24" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="4" cy="12" r="1.6" />
            <path d="M5.5 12h2.5" />
            <rect x="8" y="9" width="4" height="6" rx="0.6" />
            <circle cx="10" cy="11" r="0.4" fill="currentColor" />
            <circle cx="10" cy="13" r="0.4" fill="currentColor" />
            <path d="M12 12h2" />
            <rect x="14" y="7" width="5" height="10" rx="0.6" fill="currentColor" fillOpacity="0.18" />
            <path d="M16 10h1.5M16 12h1.5M16 14h1.5" strokeOpacity="0.7" />
            <path d="M19 12h2.5" />
            <circle cx="22" cy="12" r="1.2" fill="currentColor" />
        </svg>
    );
}

function LLMGlyph() {
    // Token stream → layers
    return (
        <svg viewBox="0 0 24 24" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4}>
            {[7, 10, 13, 16].map((y) => (
                <line key={y} x1="3" y1={y} x2="21" y2={y} strokeOpacity="0.55" />
            ))}
            <circle cx="6" cy="7" r="1" fill="currentColor" />
            <circle cx="11" cy="10" r="1" fill="currentColor" />
            <circle cx="14" cy="13" r="1" fill="currentColor" />
            <circle cx="18" cy="16" r="1" fill="currentColor" />
        </svg>
    );
}

function VisionGlyph() {
    // Frame with focal grid
    return (
        <svg viewBox="0 0 24 24" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4}>
            <rect x="3" y="5" width="18" height="14" rx="1.5" />
            <path d="M3 9h18M3 15h18M9 5v14M15 5v14" strokeOpacity="0.3" />
            <circle cx="12" cy="12" r="2.4" fill="currentColor" fillOpacity="0.2" />
            <circle cx="12" cy="12" r="2.4" />
        </svg>
    );
}

function AudioGlyph() {
    // Waveform with cursor
    return (
        <svg viewBox="0 0 24 24" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round">
            <path d="M3 12h2l1.5-5 3 10 2.5-7 2 5 2-3h5" />
            <circle cx="20" cy="9" r="0.8" fill="currentColor" />
        </svg>
    );
}

function RagWorkloadGlyph() {
    // Knowledge graph
    return (
        <svg viewBox="0 0 24 24" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4}>
            <circle cx="6" cy="6" r="1.8" />
            <circle cx="18" cy="6" r="1.8" />
            <circle cx="12" cy="13" r="2.2" fill="currentColor" fillOpacity="0.2" />
            <circle cx="6" cy="19" r="1.8" />
            <circle cx="18" cy="19" r="1.8" />
            <path d="M7.5 7.2L10.5 11.5M16.5 7.2L13.5 11.5M7.5 17.5L10.5 14.5M16.5 17.5L13.5 14.5" strokeOpacity="0.5" />
        </svg>
    );
}

function AgentGlyph() {
    // Looped tool-use
    return (
        <svg viewBox="0 0 24 24" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="2.2" fill="currentColor" fillOpacity="0.2" />
            <path d="M12 4v3M12 17v3M4 12h3M17 12h3M6.4 6.4l2.1 2.1M15.5 15.5l2.1 2.1M6.4 17.6l2.1-2.1M15.5 8.5l2.1-2.1" />
        </svg>
    );
}

function RankingGlyph() {
    // Sorted bars descending
    return (
        <svg viewBox="0 0 24 24" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4}>
            <rect x="3" y="4" width="18" height="2.4" rx="0.5" fill="currentColor" />
            <rect x="3" y="9" width="14" height="2.4" rx="0.5" fill="currentColor" fillOpacity="0.7" />
            <rect x="3" y="14" width="10" height="2.4" rx="0.5" fill="currentColor" fillOpacity="0.45" />
            <rect x="3" y="19" width="6" height="2.4" rx="0.5" fill="currentColor" fillOpacity="0.3" />
        </svg>
    );
}

/* ──────────────────────────────────────────────────────────────
   Hero visualization — 8-GPU NVLink island
   ────────────────────────────────────────────────────────────── */

function GpuIslandVisual() {
    // 8 GPUs in two rows of 4, full mesh NVLink lines
    const positions: { x: number; y: number; label: string }[] = [
        { x: 60, y: 60, label: "G0" },
        { x: 140, y: 60, label: "G1" },
        { x: 220, y: 60, label: "G2" },
        { x: 300, y: 60, label: "G3" },
        { x: 60, y: 180, label: "G4" },
        { x: 140, y: 180, label: "G5" },
        { x: 220, y: 180, label: "G6" },
        { x: 300, y: 180, label: "G7" },
    ];

    return (
        <svg viewBox="0 0 360 240" className="h-full w-full" aria-hidden="true">
            <defs>
                <linearGradient id="link" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="rgba(255,255,255,0.06)" />
                    <stop offset="50%" stopColor="rgba(0,149,255,0.35)" />
                    <stop offset="100%" stopColor="rgba(255,255,255,0.06)" />
                </linearGradient>
            </defs>

            {/* NVLink full mesh — connect every pair */}
            {positions.map((a, i) =>
                positions.slice(i + 1).map((b, j) => (
                    <line
                        key={`${i}-${j}`}
                        x1={a.x}
                        y1={a.y}
                        x2={b.x}
                        y2={b.y}
                        stroke="url(#link)"
                        strokeWidth="0.7"
                        strokeOpacity="0.6"
                    />
                )),
            )}

            {/* GPU nodes */}
            {positions.map((p) => (
                <g key={p.label}>
                    <rect
                        x={p.x - 26}
                        y={p.y - 18}
                        width="52"
                        height="36"
                        rx="3"
                        fill="rgba(17,19,22,0.95)"
                        stroke="rgba(255,255,255,0.22)"
                        strokeWidth="1"
                    />
                    <text
                        x={p.x}
                        y={p.y - 2}
                        textAnchor="middle"
                        className={MONO}
                        fontSize="9"
                        fontWeight="700"
                        fill="rgba(255,255,255,0.92)"
                    >
                        H100
                    </text>
                    <text
                        x={p.x}
                        y={p.y + 10}
                        textAnchor="middle"
                        className={MONO}
                        fontSize="7"
                        fill="rgba(255,255,255,0.45)"
                    >
                        {p.label}
                    </text>
                </g>
            ))}

            {/* Caption */}
            <text x="180" y="225" textAnchor="middle" className={MONO} fontSize="8" fontWeight="600" fill="rgba(255,255,255,0.45)" letterSpacing="2">
                NVLINK · 900 GB/s · 8× H100 · ONE NODE
            </text>
        </svg>
    );
}

/* Stack architecture diagram — layered */
function StackDiagram() {
    const layers = [
        { key: "control", label: "Control planes", sub: "MLflow · Dashboards · Eval UIs", role: "App platform" },
        { key: "orch", label: "Orchestration", sub: "Training jobs · Inference pools · Batch evals", role: "Kubernetes" },
        { key: "compute", label: "GPU compute", sub: "B200 · H200 · H100 · A100 · L40S · A10", role: "Bare-metal GPU" },
        { key: "data", label: "Data plane", sub: "Postgres · Redis · pgvector · Queues", role: "Managed databases" },
        { key: "storage", label: "Storage & artifacts", sub: "Datasets · Checkpoints · Model registry", role: "Object storage" },
    ];

    return (
        <div className="relative mx-auto max-w-[920px]">
            {/* Private network spine (right side) */}
            <div className="pointer-events-none absolute right-0 top-6 hidden h-[calc(100%-3rem)] w-[180px] rounded-[6px] border border-dashed border-[#0095FF]/30 bg-[#0095FF]/[0.03] lg:block">
                <div className={`${MONO} absolute inset-x-0 top-3 text-center text-[9px] font-semibold uppercase tracking-[0.18em] text-white/55`}>
                    <span className="inline-flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#0095FF]" />
                        Private network
                    </span>
                </div>
                <div className={`${MONO} absolute inset-x-0 bottom-3 text-center text-[9px] uppercase tracking-[0.16em] text-white/40`}>
                    0 egress · sub-ms hop
                </div>
            </div>

            <div className="flex flex-col gap-2 lg:pr-[200px]">
                {layers.map((l, i) => (
                    <div
                        key={l.key}
                        className="group relative flex items-center gap-4 rounded-[6px] border border-white/[0.10] bg-[#111316] px-5 py-4 transition-colors hover:border-white/[0.20]"
                    >
                        {/* Layer index */}
                        <span
                            className={`${MONO} flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px] border border-white/[0.10] bg-white/[0.03] text-[10.5px] font-semibold tabular-nums text-white/55`}
                        >
                            L{i + 1}
                        </span>

                        {/* Layer body */}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-baseline justify-between gap-3">
                                <h4 className="text-[15px] font-semibold tracking-[-0.01em] text-white">
                                    {l.label}
                                </h4>
                                <span
                                    className={`${MONO} hidden text-[9.5px] font-semibold uppercase tracking-[0.16em] text-white/40 sm:inline`}
                                >
                                    {l.role}
                                </span>
                            </div>
                            <p
                                className={`${MONO} mt-1 truncate text-[11.5px] uppercase tracking-[0.10em] text-white/45`}
                            >
                                {l.sub}
                            </p>
                        </div>

                        {/* Right tick into network */}
                        <span className="hidden h-px w-6 bg-[#0095FF]/45 lg:block" />
                    </div>
                ))}
            </div>
        </div>
    );
}

/* ──────────────────────────────────────────────────────────────
   Data
   ────────────────────────────────────────────────────────────── */

const HERO_STATS = [
    { value: "6", label: "GPU classes" },
    { value: "<2 min", label: "To first pod" },
    { value: "12", label: "Regions" },
    { value: "99.9%", label: "GPU availability" },
];

type Workflow = {
    glyph: React.ReactNode;
    title: string;
    description: string;
    tags: string[];
};

const FINETUNE: Workflow = {
    glyph: <FinetuneGlyph />,
    title: "Fine-tune open models",
    description:
        "LoRA, QLoRA, DPO, and full fine-tunes on Llama, Mistral, Qwen, and SDXL. High-memory GPUs sized for context up to 128k tokens.",
    tags: ["LoRA", "QLoRA", "Axolotl", "Unsloth"],
};

const INFERENCE: Workflow = {
    glyph: <InferenceGlyph />,
    title: "Serve inference at scale",
    description:
        "Autoscaling endpoints behind a global edge. Warm pools keep first-token latency stable; quantization and tensor parallelism land out of the box.",
    tags: ["vLLM", "TGI", "Triton"],
};

const RAG: Workflow = {
    glyph: <RagGlyph />,
    title: "Build RAG and agents",
    description:
        "Vector storage, managed Postgres, GPU inference, and tool orchestration on one private network. Sub-millisecond hop between every component.",
    tags: ["pgvector", "Qdrant", "Ray"],
};

const GPU_LINEUP: {
    model: string;
    vram: string;
    vramBar: number;
    flops: string;
    flopsBar: number;
    interconnect: string;
    from: string;
    best: string;
}[] = [
    { model: "B200", vram: "192 GB", vramBar: 1.0, flops: "2.25 PF", flopsBar: 1.0, interconnect: "NVLink 5 · 1.8 TB/s", from: "$5.90", best: "Frontier training" },
    { model: "H200", vram: "141 GB", vramBar: 0.73, flops: "989 TF", flopsBar: 0.44, interconnect: "NVLink · 900 GB/s", from: "$3.40", best: "Long-context serving" },
    { model: "H100", vram: "80 GB", vramBar: 0.42, flops: "989 TF", flopsBar: 0.44, interconnect: "NVLink · 900 GB/s", from: "$2.49", best: "Balanced workhorse" },
    { model: "A100", vram: "80 GB", vramBar: 0.42, flops: "312 TF", flopsBar: 0.14, interconnect: "NVLink · 600 GB/s", from: "$1.49", best: "Cost-efficient training" },
    { model: "L40S", vram: "48 GB", vramBar: 0.25, flops: "362 TF", flopsBar: 0.16, interconnect: "PCIe Gen4", from: "$1.15", best: "Vision & multimodal" },
    { model: "A10", vram: "24 GB", vramBar: 0.13, flops: "125 TF", flopsBar: 0.06, interconnect: "PCIe Gen4", from: "$0.65", best: "Small-model inference" },
];

type Workload = {
    glyph: React.ReactNode;
    metric: string;
    title: string;
    description: string;
};

const WORKLOADS: Workload[] = [
    {
        glyph: <LLMGlyph />,
        metric: "Foundation",
        title: "LLM training and fine-tuning",
        description:
            "Pretrain or specialize models from 7B to 400B+. NVLink islands, optimized data loaders, and checkpoint-resume across regions.",
    },
    {
        glyph: <VisionGlyph />,
        metric: "Vision",
        title: "Computer vision and multimodal",
        description:
            "Detection, segmentation, video understanding, and image generation on memory-rich GPUs sized for high-resolution input.",
    },
    {
        glyph: <AudioGlyph />,
        metric: "Audio",
        title: "Speech, audio, and voice agents",
        description:
            "Low-latency TTS and STT, voice cloning, and real-time conversational pipelines with sub-100ms inference loops.",
    },
    {
        glyph: <RagWorkloadGlyph />,
        metric: "Retrieval",
        title: "Retrieval-augmented generation",
        description:
            "pgvector, Qdrant, or your embedding store of choice — collocated with GPU inference and the rest of your stack.",
    },
    {
        glyph: <AgentGlyph />,
        metric: "Agents",
        title: "Agent and tool-use systems",
        description:
            "Long-running agents with tool calling, state management, and scheduled execution — wired into managed databases.",
    },
    {
        glyph: <RankingGlyph />,
        metric: "Ranking",
        title: "Recommendation and ranking",
        description:
            "Two-tower models, deep learning rankers, and feature stores backed by Postgres and Redis on the same private network.",
    },
];

/* ──────────────────────────────────────────────────────────────
   Sections
   ────────────────────────────────────────────────────────────── */

function Hero() {
    return (
        <section className="relative isolate flex min-h-[760px] flex-col justify-center overflow-hidden bg-[#04060a] pb-20 pt-32 sm:pb-24 sm:pt-36 lg:min-h-[860px] lg:pb-28 lg:pt-40">
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 z-0 opacity-[0.04]"
                style={{
                    backgroundImage:
                        "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
                    backgroundSize: "120px 120px",
                }}
            />
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 h-[55%] bg-[radial-gradient(ellipse_at_top,rgba(0,149,255,0.10),transparent_60%)]"
            />

            <Container className="relative z-10">
                <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-16">
                    {/* Left: copy */}
                    <div>
                        <p
                            className={`${MONO} mb-6 inline-flex items-center gap-2 rounded-[4px] border border-white/[0.12] bg-white/[0.04] px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-white/65`}
                        >
                            <span className="h-1.5 w-1.5 rounded-full bg-[#0095FF]" />
                            AI / ML Solutions
                        </p>

                        <h1 className="text-4xl font-semibold leading-[1.02] tracking-[-0.02em] text-white sm:text-5xl lg:text-[68px]">
                            Infrastructure for the
                            <span className="block text-white/70">AI lifecycle.</span>
                        </h1>

                        <p className="mt-6 max-w-[520px] text-[15px] leading-[1.65] text-white/60 sm:text-[17px]">
                            One platform for training, fine-tuning, inference, and the
                            data layer around them — wired in from the first pod.
                        </p>

                        <div className="mt-9 flex flex-wrap items-center gap-3">
                            <AuthAwareServiceCta
                                service="ai-agents"
                                intent="main"
                                className={`${MONO} inline-flex h-11 items-center gap-2 rounded-[5px] border border-white bg-white px-6 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-black transition-colors hover:bg-white/90`}
                            >
                                <span className="flex items-center gap-2">
                                    Talk to AI engineering
                                    <ArrowRight className="h-3.5 w-3.5" />
                                </span>
                            </AuthAwareServiceCta>
                            <Link
                                href="/services/gpu"
                                className={`${MONO} inline-flex h-11 items-center gap-2 rounded-[5px] border border-white/[0.18] bg-white/[0.04] px-6 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-white/85 transition-colors hover:border-white/40 hover:bg-white/[0.09] hover:text-white`}
                            >
                                Browse GPU lineup
                                <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                        </div>

                        {/* Stat strip */}
                        <div className="mt-12 grid grid-cols-2 gap-px overflow-hidden rounded-[6px] border border-white/[0.08] bg-white/[0.08] sm:grid-cols-4">
                            {HERO_STATS.map((s) => (
                                <div
                                    key={s.label}
                                    className="flex flex-col items-start gap-1.5 bg-[#04060a] px-4 py-4"
                                >
                                    <span
                                        className={`${MONO} text-[20px] font-bold leading-none tabular-nums text-white`}
                                    >
                                        {s.value}
                                    </span>
                                    <span
                                        className={`${MONO} text-[9.5px] font-semibold uppercase tracking-[0.16em] text-white/50`}
                                    >
                                        {s.label}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Right: GPU island visual */}
                    <div className="relative">
                        <div className="relative rounded-[10px] border border-white/[0.10] bg-[#0A0B0D] p-5 sm:p-6">
                            {/* Top label */}
                            <div className="mb-4 flex items-center justify-between">
                                <span
                                    className={`${MONO} inline-flex items-center gap-2 text-[9.5px] font-semibold uppercase tracking-[0.18em] text-white/50`}
                                >
                                    <span className="h-1 w-1 rounded-full bg-[#0095FF]" />
                                    cluster.h100-8x.us-east-1
                                </span>
                                <span
                                    className={`${MONO} inline-flex items-center gap-1.5 rounded-[3px] border border-emerald-400/30 bg-emerald-400/[0.08] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-emerald-300/85`}
                                >
                                    <span className="h-1 w-1 rounded-full bg-emerald-300" />
                                    healthy
                                </span>
                            </div>

                            <GpuIslandVisual />

                            {/* Bottom metric chips */}
                            <div className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-[5px] border border-white/[0.08] bg-white/[0.08]">
                                {[
                                    { v: "640 GB", l: "VRAM" },
                                    { v: "3.2 Tb/s", l: "Interconnect" },
                                    { v: "7912 TF", l: "FP16" },
                                ].map((c) => (
                                    <div
                                        key={c.l}
                                        className="flex flex-col items-center gap-1 bg-[#0A0B0D] px-2 py-2.5"
                                    >
                                        <span
                                            className={`${MONO} text-[12px] font-bold tabular-nums text-white`}
                                        >
                                            {c.v}
                                        </span>
                                        <span
                                            className={`${MONO} text-[8.5px] font-semibold uppercase tracking-[0.14em] text-white/45`}
                                        >
                                            {c.l}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Floating annotation */}
                        <div
                            className={`${MONO} pointer-events-none absolute -bottom-3 -right-3 hidden rounded-[4px] border border-[#0095FF]/40 bg-[#0095FF]/[0.10] px-2.5 py-1.5 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-[#9fcbff] backdrop-blur-sm sm:block`}
                        >
                            NVLink full mesh
                        </div>
                    </div>
                </div>
            </Container>
        </section>
    );
}

function Workflows() {
    return (
        <section className="relative overflow-hidden bg-[#0D0D0F] py-20 sm:py-24 lg:py-28">
            <div
                aria-hidden="true"
                className="absolute top-0 left-1/2 h-px w-[60%] -translate-x-1/2 bg-gradient-to-r from-transparent via-white/10 to-transparent"
            />

            <Container className="relative z-10">
                <div className="mx-auto max-w-[760px] text-center">
                    <p
                        className={`${MONO} mb-5 inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-white/50`}
                    >
                        <span className="h-1.5 w-1.5 rounded-full bg-[#0095FF]" />
                        What you can do
                    </p>
                    <h2 className="text-3xl font-semibold leading-[1.05] tracking-[-0.02em] text-white sm:text-4xl lg:text-[46px]">
                        Four motions. One platform.
                    </h2>
                </div>

                {/* Bento: big train card + 3 smaller stacked */}
                <div className="mt-14 grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
                    {/* Large train card */}
                    <article
                        className="relative flex flex-col overflow-hidden rounded-[10px] border border-white/[0.10] bg-[#111316] p-8 lg:row-span-3 lg:p-10"
                        style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05), 0 12px 32px -14px rgba(0,0,0,0.7)" }}
                    >
                        <div className="flex items-start justify-between">
                            <span
                                className={`${MONO} inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/50`}
                            >
                                <span className="h-1.5 w-1.5 rounded-full bg-[#0095FF]" />
                                Training motion
                            </span>
                            <span className={`${MONO} text-[10.5px] tabular-nums text-white/30`}>
                                01
                            </span>
                        </div>

                        {/* Custom training topology visual */}
                        <div className="relative mt-7 aspect-[5/3] overflow-hidden rounded-[6px] border border-white/[0.08] bg-[#0A0B0D]">
                            <div className="absolute inset-0 flex items-center justify-center p-4">
                                <div className="h-full w-full text-white/85">
                                    <TrainGlyph />
                                </div>
                            </div>
                            <span
                                className={`${MONO} absolute bottom-2 left-3 text-[8.5px] font-semibold uppercase tracking-[0.16em] text-white/35`}
                            >
                                NCCL ring · 32 GPUs · 1 region
                            </span>
                        </div>

                        <h3 className="mt-7 text-[22px] font-semibold leading-[1.2] tracking-[-0.01em] text-white sm:text-[26px]">
                            Train models from scratch.
                        </h3>
                        <p className="mt-3 max-w-[440px] text-[14px] leading-[1.6] text-white/65">
                            Multi-node training jobs with InfiniBand interconnect and
                            NCCL-tuned topologies. Checkpoints stream to object storage
                            automatically — resume on any cluster, any region.
                        </p>

                        <div className="mt-auto flex flex-wrap gap-1.5 pt-7">
                            {["NCCL", "InfiniBand", "DeepSpeed", "Megatron-LM", "FSDP"].map((t) => (
                                <span
                                    key={t}
                                    className={`${MONO} inline-flex items-center rounded-[3px] border border-white/[0.10] bg-white/[0.03] px-2 py-0.5 text-[10px] uppercase tracking-[0.10em] text-white/65`}
                                >
                                    {t}
                                </span>
                            ))}
                        </div>
                    </article>

                    {/* Three smaller cards */}
                    {[FINETUNE, INFERENCE, RAG].map((w, idx) => (
                        <article
                            key={w.title}
                            className="relative flex flex-col gap-4 overflow-hidden rounded-[8px] border border-white/[0.10] bg-[#111316] p-6 transition-colors hover:border-white/[0.22]"
                        >
                            <div className="flex items-start justify-between">
                                <div className="relative inline-flex h-11 w-11 items-center justify-center rounded-[6px] border border-white/[0.12] bg-white/[0.04] text-white/85">
                                    <div className="h-[22px] w-[22px]">{w.glyph}</div>
                                    <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-[#0095FF]" />
                                </div>
                                <span className={`${MONO} text-[10.5px] tabular-nums text-white/30`}>
                                    0{idx + 2}
                                </span>
                            </div>

                            <div>
                                <h3 className="text-[17px] font-semibold leading-[1.25] tracking-[-0.01em] text-white">
                                    {w.title}
                                </h3>
                                <p className="mt-2 text-[13px] leading-[1.55] text-white/60">
                                    {w.description}
                                </p>
                            </div>

                            <div className="mt-auto flex flex-wrap gap-1.5 border-t border-white/[0.06] pt-3">
                                {w.tags.map((t) => (
                                    <span
                                        key={t}
                                        className={`${MONO} inline-flex items-center rounded-[3px] border border-white/[0.10] bg-white/[0.03] px-2 py-0.5 text-[9.5px] uppercase tracking-[0.10em] text-white/65`}
                                    >
                                        {t}
                                    </span>
                                ))}
                            </div>
                        </article>
                    ))}
                </div>
            </Container>
        </section>
    );
}

function GpuLineup() {
    return (
        <section className="relative overflow-hidden bg-[#E6E4DC] py-20 text-[#1A1814] sm:py-24 lg:py-28">
            <Container>
                <div className="mx-auto max-w-[760px] text-center">
                    <p
                        className={`${MONO} mb-5 inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-black/55`}
                    >
                        <span className="h-1.5 w-1.5 rounded-full bg-[#0095FF]" />
                        GPU lineup
                    </p>
                    <h2 className="text-3xl font-semibold leading-[1.05] tracking-[-0.02em] text-[#1A1814] sm:text-4xl lg:text-[46px]">
                        Pick the GPU that fits the job.
                    </h2>
                </div>

                {/* Card with visual table */}
                <article className="mx-auto mt-12 max-w-[1080px] overflow-hidden rounded-[10px] border border-black/10 bg-[#EEECE4]">
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[860px]">
                            <thead>
                                <tr className="bg-[#E6E4DC]">
                                    {["GPU", "VRAM", "FP16 throughput", "Interconnect", "From $/hr", "Best for"].map((h) => (
                                        <th
                                            key={h}
                                            className={`${MONO} border-b border-black/10 px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-black/50`}
                                        >
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {GPU_LINEUP.map((g, i) => (
                                    <tr
                                        key={g.model}
                                        className={i < GPU_LINEUP.length - 1 ? "border-b border-black/[0.06]" : ""}
                                    >
                                        <td className="px-5 py-4">
                                            <span className={`${MONO} text-[15px] font-bold tabular-nums text-[#1A1814]`}>
                                                {g.model}
                                            </span>
                                        </td>
                                        {/* VRAM with bar */}
                                        <td className="px-5 py-4">
                                            <div className="flex items-center gap-2.5">
                                                <span className={`${MONO} w-[58px] text-[12.5px] tabular-nums text-black/70`}>
                                                    {g.vram}
                                                </span>
                                                <span className="relative h-1 w-20 overflow-hidden rounded-full bg-black/10">
                                                    <span
                                                        className="absolute inset-y-0 left-0 rounded-full bg-[#1A1814]"
                                                        style={{ width: `${g.vramBar * 100}%` }}
                                                    />
                                                </span>
                                            </div>
                                        </td>
                                        {/* FP16 with bar */}
                                        <td className="px-5 py-4">
                                            <div className="flex items-center gap-2.5">
                                                <span className={`${MONO} w-[60px] text-[12.5px] tabular-nums text-black/70`}>
                                                    {g.flops}
                                                </span>
                                                <span className="relative h-1 w-20 overflow-hidden rounded-full bg-black/10">
                                                    <span
                                                        className="absolute inset-y-0 left-0 rounded-full bg-[#1A1814]"
                                                        style={{ width: `${g.flopsBar * 100}%` }}
                                                    />
                                                </span>
                                            </div>
                                        </td>
                                        <td className={`${MONO} px-5 py-4 text-[12px] tabular-nums text-black/65`}>
                                            {g.interconnect}
                                        </td>
                                        <td className="px-5 py-4">
                                            <span className={`${MONO} text-[14px] font-bold tabular-nums text-[#1A1814]`}>
                                                {g.from}
                                            </span>
                                            <span className="ml-0.5 text-[10.5px] text-black/45">/hr</span>
                                        </td>
                                        <td className="px-5 py-4 text-[13px] text-black/70">
                                            {g.best}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </article>

                <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                    <Link
                        href="/services/gpu"
                        className={`${MONO} inline-flex h-10 items-center gap-1.5 rounded-[5px] border border-[#1A1814] bg-[#1A1814] px-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#EEECE4] transition-colors hover:bg-black`}
                    >
                        See full GPU pricing
                        <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                    <Link
                        href="/contact"
                        className={`${MONO} inline-flex h-10 items-center gap-1.5 rounded-[5px] border border-black/15 bg-transparent px-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-black/80 transition-colors hover:border-black/35 hover:bg-black/[0.04] hover:text-[#1A1814]`}
                    >
                        Reserved capacity
                        <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                </div>
            </Container>
        </section>
    );
}

function Stack() {
    return (
        <section className="relative overflow-hidden bg-[#0D0D0F] py-20 sm:py-24 lg:py-28">
            <div
                aria-hidden="true"
                className="absolute top-0 left-1/2 h-px w-[60%] -translate-x-1/2 bg-gradient-to-r from-transparent via-white/10 to-transparent"
            />

            <Container className="relative z-10">
                <div className="mx-auto max-w-[760px] text-center">
                    <p
                        className={`${MONO} mb-5 inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-white/50`}
                    >
                        <span className="h-1.5 w-1.5 rounded-full bg-[#0095FF]" />
                        The stack
                    </p>
                    <h2 className="text-3xl font-semibold leading-[1.05] tracking-[-0.02em] text-white sm:text-4xl lg:text-[46px]">
                        Every layer in one network.
                    </h2>
                    <p className="mx-auto mt-5 max-w-[600px] text-[15px] leading-[1.6] text-white/60 sm:text-[16.5px]">
                        GPUs alone do not ship an AI product. Datasets, metadata,
                        orchestration, and control planes all live on the same private
                        network — no egress between them.
                    </p>
                </div>

                <div className="mt-14">
                    <StackDiagram />
                </div>
            </Container>
        </section>
    );
}

function Workloads() {
    return (
        <section className="relative overflow-hidden bg-[#E6E4DC] py-20 text-[#1A1814] sm:py-24 lg:py-28">
            <Container>
                <div className="mx-auto max-w-[760px] text-center">
                    <p
                        className={`${MONO} mb-5 inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-black/55`}
                    >
                        <span className="h-1.5 w-1.5 rounded-full bg-[#0095FF]" />
                        Workloads
                    </p>
                    <h2 className="text-3xl font-semibold leading-[1.05] tracking-[-0.02em] text-[#1A1814] sm:text-4xl lg:text-[46px]">
                        Sized to what AI teams actually run.
                    </h2>
                </div>

                <div className="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-[8px] border border-black/[0.10] bg-black/[0.10] sm:grid-cols-2 lg:grid-cols-3">
                    {WORKLOADS.map((w, i) => (
                        <article
                            key={w.title}
                            className="flex flex-col gap-4 bg-[#EEECE4] p-7"
                        >
                            <div className="flex items-start justify-between">
                                <div className="inline-flex h-11 w-11 items-center justify-center rounded-[6px] border border-black/[0.12] bg-[#1A1814] text-[#EEECE4]">
                                    <div className="h-[22px] w-[22px]">{w.glyph}</div>
                                </div>
                                <span
                                    className={`${MONO} text-[10.5px] tabular-nums text-black/30`}
                                >
                                    {String(i + 1).padStart(2, "0")}
                                </span>
                            </div>
                            <div>
                                <p
                                    className={`${MONO} mb-2 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-black/50`}
                                >
                                    <span className="h-1 w-1 rounded-full bg-[#0095FF]" />
                                    {w.metric}
                                </p>
                                <h3 className="text-[18px] font-semibold leading-[1.25] tracking-[-0.01em] text-[#1A1814]">
                                    {w.title}
                                </h3>
                                <p className="mt-2 text-[13.5px] leading-[1.6] text-black/60">
                                    {w.description}
                                </p>
                            </div>
                        </article>
                    ))}
                </div>
            </Container>
        </section>
    );
}

function FinalCta() {
    return (
        <section className="relative overflow-hidden bg-[#0D0D0F] py-20 sm:py-24 lg:py-28">
            <div
                aria-hidden="true"
                className="absolute top-0 left-1/2 h-px w-[60%] -translate-x-1/2 bg-gradient-to-r from-transparent via-white/12 to-transparent"
            />

            <Container className="relative z-10">
                <div className="mx-auto max-w-[920px] rounded-[12px] border border-white/[0.10] bg-[#111316] p-10 sm:p-12 lg:p-14">
                    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-center lg:gap-14">
                        <div>
                            <p
                                className={`${MONO} mb-4 inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-white/50`}
                            >
                                <span className="h-1.5 w-1.5 rounded-full bg-[#0095FF]" />
                                Build your AI platform
                            </p>
                            <h2 className="text-3xl font-semibold leading-[1.05] tracking-[-0.02em] text-white sm:text-4xl lg:text-[42px]">
                                A blueprint review with the team that runs it.
                            </h2>
                            <p className="mt-4 max-w-[440px] text-[14.5px] leading-[1.6] text-white/60">
                                Send the workload shape, target GPU class, and rollout
                                window. We come back with a sized cluster and a path to
                                production.
                            </p>
                        </div>

                        <div className="flex flex-col gap-3">
                            <Link
                                href="/contact"
                                className={`${MONO} inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-[5px] border border-white bg-white text-[11px] font-semibold uppercase tracking-[0.14em] text-black transition-colors hover:bg-white/90`}
                            >
                                Talk to AI engineering
                                <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                            <Link
                                href="/services/gpu"
                                className={`${MONO} inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-[5px] border border-white/[0.14] bg-transparent text-[11px] font-semibold uppercase tracking-[0.14em] text-white/75 transition-colors hover:border-white/35 hover:bg-white/[0.04] hover:text-white`}
                            >
                                View GPU pricing
                                <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                        </div>
                    </div>
                </div>
            </Container>
        </section>
    );
}

/* ──────────────────────────────────────────────────────────────
   Page
   ────────────────────────────────────────────────────────────── */

const FAQS = [
    {
        question: "How quickly can I provision a GPU?",
        answer:
            "On-demand single-GPU pods launch in under two minutes. Multi-node clusters sized up to 256 GPUs are typically available within an hour. Reserved capacity is provisioned to the schedule you agree with the team.",
    },
    {
        question: "Do you support multi-node distributed training?",
        answer:
            "Yes. Multi-node clusters use 3.2 Tbps non-blocking InfiniBand between GPUs and NCCL topologies tuned for the underlying fabric. DeepSpeed, FSDP, and Megatron-LM ship as supported reference stacks.",
    },
    {
        question: "Which inference runtimes are supported?",
        answer:
            "vLLM, TGI, Triton, and TensorRT-LLM are first-class on the platform. Custom runtimes ship as container images; autoscaling, warm pools, and rate limiting work the same for all of them.",
    },
    {
        question: "How is data egress priced for AI workloads?",
        answer:
            "Traffic between services in the same region is free. Cross-region replication is metered at standard rates. Inference egress to your customers is billed against your plan's monthly allowance.",
    },
    {
        question: "Can I bring my own container image?",
        answer:
            "Yes. Any OCI-compliant image runs on the platform. Public registries, your private registry, and signed images are all supported, with the same NVIDIA driver stack mounted across every GPU class.",
    },
    {
        question: "Do you offer spot or reserved pricing?",
        answer:
            "Spot pricing is available on A100, H100, and L40S classes at up to 70% discount, with two-minute preemption notice. Reserved capacity contracts are offered for one-, three-, and twelve-month terms.",
    },
];

export function AiMlLanding() {
    return (
        <main className="bg-[#0D0D0F]">
            <Hero />
            <Workflows />
            <GpuLineup />
            <Stack />
            <Workloads />
            <ServicesHomeSectionFive
                title="Frequently asked questions"
                faqs={FAQS}
            />
            <FinalCta />
        </main>
    );
}
