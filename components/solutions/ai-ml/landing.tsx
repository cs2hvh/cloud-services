"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight } from "lucide-react";

import { Container } from "@/components/ui/container";
import { ServiceHeroSection } from "@/components/services/service-hero-section";
import ServicesHomeSectionFive from "@/components/serviceshome/section-5";
import { NvidiaLogo } from "@/components/branding/nvidia-logo";
import { HeroStats } from "@/components/solutions/shared/hero-stats";
import { ACCENT_FONT, Aurora, Eclipse, PaperGrain } from "@/components/brand/atmosphere";
import { ModelTrainingPipelineSection } from "@/components/model-training-pipeline-section";

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

/* ──────────────────────────────────────────────────────────────
   Stack glyphs (32×32, layered + blue accent)
   ────────────────────────────────────────────────────────────── */

function GpuIcon() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            <rect x="3" y="9" width="13" height="14" rx="1.2" fill="#0095FF" fillOpacity="0.20" stroke="#0095FF" />
            <rect x="16" y="9" width="13" height="14" rx="1.2" fill="currentColor" fillOpacity="0.15" />
            <circle cx="6.5" cy="13" r="0.7" fill="#0095FF" />
            <circle cx="6.5" cy="16" r="0.7" fill="#0095FF" />
            <circle cx="6.5" cy="19" r="0.7" fill="#0095FF" />
            <circle cx="19.5" cy="13" r="0.7" fill="currentColor" />
            <circle cx="19.5" cy="16" r="0.7" fill="currentColor" />
            <circle cx="19.5" cy="19" r="0.7" fill="currentColor" />
            <path d="M16 16h0" strokeDasharray="1 1" strokeOpacity="0.7" />
            <path d="M9 9V6M22 9V6M9 23v3M22 23v3" strokeOpacity="0.4" />
        </svg>
    );
}

function TrainingIcon() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            <rect x="4" y="5" width="24" height="8" rx="1.5" fill="currentColor" fillOpacity="0.08" />
            <rect x="4" y="19" width="24" height="8" rx="1.5" fill="#0095FF" fillOpacity="0.18" stroke="#0095FF" />
            <circle cx="7" cy="9" r="0.9" fill="currentColor" />
            <circle cx="7" cy="23" r="0.9" fill="#0095FF" />
            <path d="M11 9h14M11 23h14" strokeOpacity="0.5" />
            <path d="M9 13l1 6M14 13l1 6M19 13l1 6M24 13l1 6" strokeOpacity="0.35" strokeDasharray="1.5 1.5" />
        </svg>
    );
}

function InferenceIcon() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            <path d="M3 16h4" strokeLinecap="round" />
            <rect x="7" y="12" width="6" height="8" rx="1" fill="#0095FF" fillOpacity="0.25" stroke="#0095FF" />
            <path d="M13 16h3M14 11.5l3-1.5M14 16h3M14 20.5l3 1.5" strokeOpacity="0.6" strokeLinecap="round" />
            <rect x="17" y="8" width="6" height="4" rx="0.6" fill="currentColor" fillOpacity="0.15" />
            <rect x="17" y="14" width="6" height="4" rx="0.6" fill="currentColor" fillOpacity="0.15" />
            <rect x="17" y="20" width="6" height="4" rx="0.6" fill="currentColor" fillOpacity="0.15" />
            <path d="M23 10h3M23 16h3M23 22h3" strokeLinecap="round" strokeOpacity="0.4" />
        </svg>
    );
}

function DataPlaneIcon() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            <ellipse cx="9" cy="8" rx="5" ry="2" fill="#0095FF" fillOpacity="0.20" stroke="#0095FF" />
            <path d="M4 8v8c0 1.1 2.2 2 5 2s5-0.9 5-2V8" stroke="#0095FF" />
            <path d="M4 16v8c0 1.1 2.2 2 5 2s5-0.9 5-2v-8" stroke="#0095FF" />
            <ellipse cx="23" cy="8" rx="5" ry="2" fill="currentColor" fillOpacity="0.10" />
            <path d="M18 8v8c0 1.1 2.2 2 5 2s5-0.9 5-2V8" />
            <path d="M18 16v8c0 1.1 2.2 2 5 2s5-0.9 5-2v-8" />
            <path d="M14 14h4M14 21h4" strokeOpacity="0.55" strokeDasharray="1.5 1.5" />
        </svg>
    );
}

function K8sIcon() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3} strokeLinejoin="round">
            <path d="M16 3l11 5.5v13L16 28.5 5 21.5v-13L16 3z" fill="currentColor" fillOpacity="0.08" />
            <path d="M16 10v12M10 13l12 6M22 13l-12 6" strokeOpacity="0.55" strokeLinecap="round" />
            <circle cx="16" cy="16" r="2.2" fill="#0095FF" fillOpacity="0.30" stroke="#0095FF" />
        </svg>
    );
}

function NetworkIcon() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3} strokeLinejoin="round">
            <path d="M16 3l11 4v8c0 6.5-4.5 11.5-11 13.5C9.5 26.5 5 21.5 5 15V7l11-4z" fill="currentColor" fillOpacity="0.08" />
            <circle cx="16" cy="15" r="3" fill="#0095FF" fillOpacity="0.25" stroke="#0095FF" />
            <path d="M16 9v3M16 18v3M10 15h3M19 15h3" strokeOpacity="0.6" />
            <circle cx="10" cy="9" r="0.8" fill="currentColor" />
            <circle cx="22" cy="9" r="0.8" fill="currentColor" />
            <circle cx="10" cy="21" r="0.8" fill="currentColor" />
            <circle cx="22" cy="21" r="0.8" fill="currentColor" />
        </svg>
    );
}

function ObjectStorageIcon() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3} strokeLinejoin="round">
            <path d="M5 9h22l-2 18a1.3 1.3 0 0 1-1.3 1.2H8.3A1.3 1.3 0 0 1 7 27L5 9z" fill="currentColor" fillOpacity="0.08" />
            <path d="M5 9h22" />
            <path d="M11 9V6.5a5 5 0 0 1 10 0V9" />
            <circle cx="12" cy="17" r="1.5" fill="#0095FF" fillOpacity="0.30" stroke="#0095FF" />
            <circle cx="18" cy="22" r="1.3" fill="currentColor" fillOpacity="0.3" />
            <circle cx="22" cy="15" r="1.3" fill="currentColor" fillOpacity="0.3" />
        </svg>
    );
}

/* ──────── Workload glyphs (cream section) ──────── */

function LLMGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            {[8, 12, 16, 20, 24].map((y, i) => (
                <line key={y} x1="3" y1={y} x2="29" y2={y} strokeOpacity={0.30 + i * 0.06} />
            ))}
            <circle cx="8" cy="8" r="1.3" fill="currentColor" />
            <circle cx="14" cy="12" r="1.3" fill="#0095FF" />
            <circle cx="19" cy="16" r="1.3" fill="currentColor" />
            <circle cx="24" cy="20" r="1.3" fill="#0095FF" />
            <circle cx="27" cy="24" r="1.3" fill="currentColor" />
        </svg>
    );
}

function VisionGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            <rect x="3" y="6" width="26" height="20" rx="1.5" fill="currentColor" fillOpacity="0.08" />
            <path d="M3 11h26M3 22h26M11 6v20M22 6v20" strokeOpacity="0.3" />
            <circle cx="16" cy="16" r="4" fill="#0095FF" fillOpacity="0.25" stroke="#0095FF" />
            <circle cx="16" cy="16" r="1.4" fill="#0095FF" />
        </svg>
    );
}

function AudioGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 16h2l1.5-7 3 14 3-10 2 6 2-4 2 2 3 0" />
            <circle cx="3" cy="16" r="0.9" fill="currentColor" />
            <circle cx="22" cy="17" r="1.2" fill="#0095FF" />
            <circle cx="27" cy="13" r="0.9" fill="currentColor" />
        </svg>
    );
}

function RagGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            <circle cx="16" cy="16" r="11" strokeOpacity="0.4" />
            <circle cx="7" cy="13" r="1.4" fill="currentColor" />
            <circle cx="13" cy="6" r="1.4" fill="currentColor" />
            <circle cx="22" cy="9" r="1.4" fill="currentColor" />
            <circle cx="25" cy="17" r="1.4" fill="currentColor" />
            <circle cx="21" cy="24" r="1.4" fill="currentColor" />
            <circle cx="11" cy="22" r="1.4" fill="currentColor" />
            <circle cx="16" cy="16" r="2.5" fill="#0095FF" fillOpacity="0.30" stroke="#0095FF" />
            <path d="M16 16l-3-9M16 16l9-1M16 16l-5 6M16 16l6 6" strokeOpacity="0.3" />
        </svg>
    );
}

function AgentGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3} strokeLinejoin="round" strokeLinecap="round">
            <circle cx="16" cy="16" r="3" fill="#0095FF" fillOpacity="0.30" stroke="#0095FF" />
            <path d="M16 5v4M16 23v4M5 16h4M23 16h4M8.5 8.5l3 3M20.5 20.5l3 3M8.5 23.5l3-3M20.5 11.5l3-3" />
        </svg>
    );
}

function RankingGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            <rect x="3" y="5" width="26" height="3.5" rx="0.6" fill="currentColor" />
            <rect x="3" y="11" width="20" height="3.5" rx="0.6" fill="#0095FF" />
            <rect x="3" y="17" width="14" height="3.5" rx="0.6" fill="currentColor" fillOpacity="0.55" />
            <rect x="3" y="23" width="8" height="3.5" rx="0.6" fill="currentColor" fillOpacity="0.35" />
        </svg>
    );
}

/* ──────── Lifecycle flow nodes ──────── */

function NodeData() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4}>
            <rect x="5" y="6" width="22" height="20" rx="1.5" />
            <path d="M5 11h22M5 17h22M5 23h22" strokeOpacity="0.45" />
            <circle cx="9" cy="8.5" r="0.6" fill="currentColor" />
        </svg>
    );
}
function NodePretrain() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4}>
            <rect x="5" y="6" width="22" height="8" rx="1.5" />
            <rect x="5" y="18" width="22" height="8" rx="1.5" />
            <circle cx="9" cy="10" r="0.7" fill="currentColor" />
            <circle cx="9" cy="22" r="0.7" fill="currentColor" />
            <path d="M13 10h12M13 22h12" strokeOpacity="0.5" />
        </svg>
    );
}
function NodeFinetune() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round">
            <rect x="4" y="9" width="14" height="14" rx="1.5" />
            <path d="M7 14h8M7 17h6M7 20h8" strokeOpacity="0.55" />
            <rect x="17" y="4" width="11" height="11" rx="1.5" fill="currentColor" fillOpacity="0.25" />
            <path d="M19 8l7 7M19 13l7-5" strokeLinecap="round" />
        </svg>
    );
}
function NodeCheckpoint() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round">
            <path d="M5 10h22l-2 16a1.2 1.2 0 0 1-1.2 1H8.2A1.2 1.2 0 0 1 7 26L5 10z" />
            <path d="M11 10V7a5 5 0 0 1 10 0v3" />
        </svg>
    );
}
function NodeEval() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="6" width="22" height="20" rx="1.5" />
            <path d="M9 12l3 3 5-7" />
            <path d="M9 19l3 3 5-7" strokeOpacity="0.5" />
            <path d="M21 14h4M21 21h4" strokeOpacity="0.45" />
        </svg>
    );
}
function NodeOptimize() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4}>
            <circle cx="16" cy="16" r="4" />
            <path d="M16 5v3M16 24v3M5 16h3M24 16h3M8.5 8.5l2 2M21.5 21.5l2 2M8.5 23.5l2-2M21.5 10.5l2-2" strokeLinecap="round" />
        </svg>
    );
}
function NodeServe() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4}>
            <path d="M3 16h4" strokeLinecap="round" />
            <rect x="7" y="12" width="6" height="8" rx="1" />
            <path d="M13 16h4M14 12l3-2M14 20l3 2" strokeLinecap="round" strokeOpacity="0.6" />
            <rect x="17" y="7" width="5" height="5" rx="0.6" />
            <rect x="17" y="13.5" width="5" height="5" rx="0.6" />
            <rect x="17" y="20" width="5" height="5" rx="0.6" />
        </svg>
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

type Scenario = {
    name: string;
    persona: string;
    description: string;
    monthly: string;
    suffix?: string;
    services: { glyph: React.ReactNode; label: string }[];
    specs: { label: string; value: string }[];
    cta: { label: string; href: string };
    featured?: boolean;
};

const SCENARIOS: Scenario[] = [
    {
        name: "On-demand inference pod",
        persona: "Demos, prototypes, hobby",
        description: "Spin a single GPU in under two minutes. Use what you need; shut it down when you're done.",
        monthly: "$0.65",
        suffix: "/hr",
        services: [
            { glyph: <GpuIcon />, label: "1× A10 or L40S" },
            { glyph: <InferenceIcon />, label: "Inference runtime" },
            { glyph: <ObjectStorageIcon />, label: "Weight cache" },
        ],
        specs: [
            { label: "GPU", value: "1 × A10 (24 GB) or L40S (48 GB)" },
            { label: "Runtime", value: "vLLM · TGI · custom OCI" },
            { label: "Storage", value: "Object cache for weights" },
        ],
        cta: { label: "Try a pod", href: "/services/gpu" },
    },
    {
        name: "Fine-tune an open model",
        persona: "Specialize Llama · Mistral · SDXL",
        description: "Single 8-GPU H100 or H200 node with NVLink. LoRA, QLoRA, DPO, full fine-tunes — all with checkpoint streaming to object storage.",
        monthly: "$2.49",
        suffix: "/hr / GPU",
        services: [
            { glyph: <GpuIcon />, label: "8× H100 NVLink" },
            { glyph: <TrainingIcon />, label: "Distributed training" },
            { glyph: <ObjectStorageIcon />, label: "Checkpoints" },
            { glyph: <DataPlaneIcon />, label: "Postgres + Redis" },
            { glyph: <K8sIcon />, label: "Kubernetes" },
        ],
        specs: [
            { label: "GPUs", value: "8 × H100 (80 GB) · NVLink island" },
            { label: "Frameworks", value: "Axolotl · Unsloth · DeepSpeed" },
            { label: "Checkpoints", value: "Streamed to object store" },
        ],
        cta: { label: "Recommended", href: "/services/gpu" },
        featured: true,
    },
    {
        name: "Pretrain at scale",
        persona: "Foundation models, 7B–400B+",
        description: "Multi-node H200 or B200 clusters with 3.2 Tbps InfiniBand, NCCL-tuned topo, resume across regions.",
        monthly: "$3.40",
        suffix: "+/hr / GPU",
        services: [
            { glyph: <GpuIcon />, label: "Multi-node H200/B200" },
            { glyph: <NetworkIcon />, label: "InfiniBand 3.2 Tbps" },
            { glyph: <ObjectStorageIcon />, label: "Dataset + ckpt" },
            { glyph: <K8sIcon />, label: "Job scheduler" },
            { glyph: <TrainingIcon />, label: "FSDP · Megatron" },
        ],
        specs: [
            { label: "Topology", value: "32–256 GPUs · NCCL-tuned" },
            { label: "Interconnect", value: "InfiniBand 3.2 Tbps" },
            { label: "Frameworks", value: "FSDP · Megatron · DeepSpeed" },
        ],
        cta: { label: "Compose cluster", href: "/contact" },
    },
    {
        name: "Reserved enterprise cluster",
        persona: "Production AI platforms",
        description: "Dedicated capacity, multi-region, SOC 2, audit, SSO. Reserved 3-, 6-, or 12-month terms with up to 50% off.",
        monthly: "Custom",
        services: [
            { glyph: <GpuIcon />, label: "Dedicated GPU" },
            { glyph: <K8sIcon />, label: "Multi-region K8s" },
            { glyph: <NetworkIcon />, label: "Private peering" },
            { glyph: <ObjectStorageIcon />, label: "Replicated store" },
            { glyph: <DataPlaneIcon />, label: "Sharded DB" },
            { glyph: <InferenceIcon />, label: "Edge inference" },
        ],
        specs: [
            { label: "Capacity", value: "Dedicated · reserved terms" },
            { label: "Compliance", value: "SOC 2 · audit · SSO · RBAC" },
            { label: "Support", value: "Dedicated AI SRE · 24×7" },
        ],
        cta: { label: "Talk to sales", href: "/contact" },
    },
];

type FlowNode = { icon: React.ReactNode; label: string; sub: string };

const FLOW: FlowNode[] = [
    { icon: <NodeData />, label: "Dataset", sub: "Object storage" },
    { icon: <NodePretrain />, label: "Pretrain", sub: "Multi-node GPUs" },
    { icon: <NodeFinetune />, label: "Fine-tune", sub: "LoRA · QLoRA · DPO" },
    { icon: <NodeCheckpoint />, label: "Checkpoint", sub: "Streamed · resumable" },
    { icon: <NodeEval />, label: "Eval", sub: "Harness · golden sets" },
    { icon: <NodeOptimize />, label: "Optimize", sub: "Quantize · distill" },
    { icon: <NodeServe />, label: "Serve", sub: "vLLM · TGI · Triton" },
];

type GpuRow = {
    model: string;
    vram: string;
    vramBar: number;
    flops: string;
    flopsBar: number;
    from: string;
    badge?: string;
};

const GPU_LINEUP: GpuRow[] = [
    { model: "B200", vram: "192 GB", vramBar: 1.0, flops: "2.25 PF", flopsBar: 1.0, from: "$5.90", badge: "Frontier" },
    { model: "H200", vram: "141 GB", vramBar: 0.73, flops: "989 TF", flopsBar: 0.44, from: "$3.40" },
    { model: "H100", vram: "80 GB", vramBar: 0.42, flops: "989 TF", flopsBar: 0.44, from: "$2.49", badge: "Workhorse" },
    { model: "A100", vram: "80 GB", vramBar: 0.42, flops: "312 TF", flopsBar: 0.14, from: "$1.49" },
    { model: "L40S", vram: "48 GB", vramBar: 0.25, flops: "362 TF", flopsBar: 0.16, from: "$1.15" },
    { model: "A10", vram: "24 GB", vramBar: 0.13, flops: "125 TF", flopsBar: 0.06, from: "$0.65" },
];

type StackPiece = {
    icon: React.ReactNode;
    title: string;
    description: string;
    role: string;
    capabilities: string[];
};

const STACK_TRAIN: StackPiece = {
    icon: <TrainingIcon />,
    title: "Distributed training",
    description: "Multi-node jobs with InfiniBand and NCCL-tuned topology. DeepSpeed, FSDP, Megatron-LM as supported reference stacks. Resume across regions.",
    role: "Training",
    capabilities: ["NCCL-tuned", "InfiniBand 3.2 Tbps", "FSDP · DeepSpeed", "Megatron-LM"],
};
const STACK_INFER: StackPiece = {
    icon: <InferenceIcon />,
    title: "Inference serving",
    description: "Autoscaling endpoints behind a global edge. Warm pools keep first-token latency stable; quantization and tensor parallelism land out of the box.",
    role: "Serving",
    capabilities: ["vLLM · TGI · Triton", "Warm pools", "Tensor parallel", "Edge cache"],
};
const STACK_DATA: StackPiece = {
    icon: <DataPlaneIcon />,
    title: "Data plane",
    description: "Object storage for datasets, weights, checkpoints. Managed Postgres + Redis for metadata, eval results, queues, pgvector for retrieval.",
    role: "Data",
    capabilities: ["S3-compatible", "Postgres + Redis", "pgvector + HNSW", "Cross-region copy"],
};
const STACK_K8S: StackPiece = {
    icon: <K8sIcon />,
    title: "Orchestration on Kubernetes",
    description: "Run distributed training jobs, autoscaling inference pools, and batch evals on the same cluster — GPU-aware scheduler, MIG slicing, preemption-safe.",
    role: "Orchestration",
    capabilities: ["GPU-aware scheduler", "MIG slicing", "Spot + reserved", "Preemption-safe"],
};
const STACK_NET: StackPiece = {
    icon: <NetworkIcon />,
    title: "Private network & VPC",
    description: "Every component on the same VPC with sub-ms latency. Traffic between training, eval, and serving services never leaves the private network.",
    role: "Network",
    capabilities: ["Private VPC", "Zero in-region egress", "Sub-ms hops", "VPC peering"],
};

type Workload = { glyph: React.ReactNode; metric: string; title: string; description: string };

const WORKLOADS: Workload[] = [
    {
        glyph: <LLMGlyph />,
        metric: "Foundation",
        title: "LLM training and fine-tuning",
        description: "Pretrain or specialize models from 7B to 400B+. NVLink islands, optimized data loaders, and checkpoint-resume across regions.",
    },
    {
        glyph: <VisionGlyph />,
        metric: "Vision",
        title: "Computer vision and multimodal",
        description: "Detection, segmentation, video understanding, and image generation on memory-rich GPUs sized for high-resolution input.",
    },
    {
        glyph: <AudioGlyph />,
        metric: "Audio",
        title: "Speech, audio, and voice agents",
        description: "Low-latency TTS and STT, voice cloning, and real-time conversational pipelines with sub-100ms inference loops.",
    },
    {
        glyph: <RagGlyph />,
        metric: "Retrieval",
        title: "Retrieval-augmented generation",
        description: "pgvector, Qdrant, or your embedding store of choice — collocated with GPU inference and the rest of your stack.",
    },
    {
        glyph: <AgentGlyph />,
        metric: "Agents",
        title: "Agent and tool-use systems",
        description: "Long-running agents with tool calling, state management, and scheduled execution — wired into managed databases.",
    },
    {
        glyph: <RankingGlyph />,
        metric: "Ranking",
        title: "Recommendation and ranking",
        description: "Two-tower models, deep learning rankers, and feature stores backed by Postgres and Redis on the same private network.",
    },
];

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

/* ──────────────────────────────────────────────────────────────
   Sections
   ────────────────────────────────────────────────────────────── */


function Scenarios() {
    const featured = SCENARIOS.find((s) => s.featured)!;
    const others = SCENARIOS.filter((s) => !s.featured);

    return (
        <section className="relative overflow-hidden bg-[#E6E4DC] py-20 text-[#1A1814] sm:py-24 lg:py-28">
            {/* ─── Warm paper grain — texture only, no ornament ─── */}
            <PaperGrain opacity={0.07} />

            <Container className="relative z-10">
                <div className="mx-auto flex max-w-[1180px] flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-[680px]">
                        <p className={`${MONO} mb-5 inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-black/55`}>
                            <span className="h-1.5 w-1.5 rounded-full bg-[#0095FF]" />
                            Composed AI stacks
                        </p>
                        <h2 className="text-3xl font-semibold leading-[1.05] tracking-[-0.02em] text-[#1A1814] sm:text-4xl lg:text-[48px]">
                            One recommended stack.{" "}
                            <span style={ACCENT_FONT} className="text-[#0066B3]">
                                Three alternatives.
                            </span>
                        </h2>
                    </div>
                    <p className="max-w-[360px] text-[14.5px] leading-[1.65] text-black/60">
                        Real cluster shapes — pick the one that matches your workload.
                    </p>
                </div>

                <article className="relative mx-auto mt-12 max-w-[1180px] overflow-hidden rounded-[12px] border-2 border-[#1A1814] bg-[#1A1814] text-[#EEECE4]">
                    {/* Eclipse — soft halo behind the featured card */}
                    <Eclipse position="top-right" size={520} intensity={0.18} color="#0095FF" />
                    <Eclipse position="bottom-left" size={420} intensity={0.10} color="#0095FF" blur={80} />

                    <div className="absolute right-5 top-5 z-10">
                        <div className={`${MONO} inline-flex items-center gap-1.5 rounded-full bg-[#0095FF] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-white`}>
                            <span className="h-1 w-1 rounded-full bg-white" />
                            Recommended
                        </div>
                    </div>

                    <div className="relative grid gap-10 p-8 sm:p-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-center lg:gap-14 lg:p-12">
                        <div>
                            <p className={`${MONO} mb-3 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/55`}>
                                <span className="h-1 w-1 rounded-full bg-[#0095FF]" />
                                {featured.persona}
                            </p>
                            <h3 className="text-[24px] font-semibold leading-[1.15] tracking-[-0.01em] text-white sm:text-[28px]">
                                {featured.name}
                            </h3>
                            <p className="mt-3 max-w-[440px] text-[13.5px] leading-[1.6] text-white/65">
                                {featured.description}
                            </p>
                            <div className="mt-6 flex items-baseline gap-2">
                                <span className={`${MONO} text-[40px] font-bold tabular-nums leading-none text-white`}>
                                    {featured.monthly}
                                </span>
                                {featured.suffix && (
                                    <span className={`${MONO} text-[12px] text-white/55`}>{featured.suffix}</span>
                                )}
                            </div>
                            <Link
                                href={featured.cta.href}
                                className={`${MONO} mt-6 inline-flex h-11 items-center gap-1.5 rounded-[5px] bg-white px-6 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#1A1814] transition-colors hover:bg-[#0095FF] hover:text-white`}
                            >
                                {featured.cta.label}
                                <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                        </div>

                        <div className="flex flex-col gap-6">
                            <div>
                                <p className={`${MONO} mb-3 text-[9.5px] font-semibold uppercase tracking-[0.18em] text-white/45`}>
                                    Composed of
                                </p>
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                    {featured.services.map((svc) => (
                                        <div
                                            key={svc.label}
                                            className="flex items-center gap-2.5 rounded-[6px] border border-white/[0.10] bg-white/[0.04] px-3 py-2.5"
                                        >
                                            <div className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] text-white/85">
                                                <div className="h-[16px] w-[16px]">{svc.glyph}</div>
                                            </div>
                                            <span className="truncate text-[11px] text-white/80">{svc.label}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-px overflow-hidden rounded-[6px] border border-white/[0.08] bg-white/[0.08]">
                                {featured.specs.map((sp) => (
                                    <div key={sp.label} className="flex items-baseline justify-between gap-4 bg-[#1A1814] px-4 py-3">
                                        <span className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/45`}>
                                            {sp.label}
                                        </span>
                                        <span className="text-right text-[12.5px] text-white/85">{sp.value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </article>

                <div className="mx-auto mt-5 grid max-w-[1180px] grid-cols-1 gap-5 sm:grid-cols-3">
                    {others.map((s) => (
                        <article
                            key={s.name}
                            className="relative flex flex-col overflow-hidden rounded-[10px] border border-black/[0.10] bg-[#EEECE4] text-[#1A1814] transition-all duration-300 hover:-translate-y-1 hover:border-[#0095FF] hover:shadow-lg"
                        >
                            <div className="border-b border-black/[0.08] p-6">
                                <p className={`${MONO} mb-2.5 inline-flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-[0.18em] text-black/45`}>
                                    <span className="h-1 w-1 rounded-full bg-[#0095FF]" />
                                    {s.persona}
                                </p>
                                <h3 className="text-[16px] font-semibold leading-[1.2] tracking-[-0.01em] text-[#1A1814]">
                                    {s.name}
                                </h3>
                                <p className="mt-2 text-[12px] leading-[1.55] text-black/60">{s.description}</p>
                                <div className="mt-4 flex items-baseline gap-1.5">
                                    <span className={`${MONO} text-[24px] font-bold tabular-nums text-[#1A1814]`}>
                                        {s.monthly}
                                    </span>
                                    {s.suffix && (
                                        <span className={`${MONO} text-[11px] text-black/45`}>{s.suffix}</span>
                                    )}
                                </div>
                            </div>

                            <div className="flex flex-1 flex-col gap-4 p-6">
                                <div className="flex flex-wrap gap-1.5">
                                    {s.services.map((svc) => (
                                        <div
                                            key={svc.label}
                                            title={svc.label}
                                            className="inline-flex h-7 w-7 items-center justify-center rounded-[5px] border border-black/[0.10] bg-white/60 text-[#1A1814]"
                                        >
                                            <div className="h-[14px] w-[14px]">{svc.glyph}</div>
                                        </div>
                                    ))}
                                </div>

                                <div className="flex flex-col gap-1.5 border-t border-black/[0.06] pt-4">
                                    {s.specs.slice(0, 2).map((sp) => (
                                        <div key={sp.label} className="flex items-baseline justify-between gap-2">
                                            <span className={`${MONO} text-[9.5px] uppercase tracking-[0.14em] text-black/45`}>
                                                {sp.label}
                                            </span>
                                            <span className="text-right text-[11.5px] text-black/75">{sp.value}</span>
                                        </div>
                                    ))}
                                </div>

                                <Link
                                    href={s.cta.href}
                                    className={`${MONO} mt-auto inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-[5px] border border-[#1A1814] bg-transparent text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#1A1814] transition-colors hover:bg-[#1A1814] hover:text-[#EEECE4]`}
                                >
                                    {s.cta.label}
                                    <ArrowRight className="h-3 w-3" />
                                </Link>
                            </div>
                        </article>
                    ))}
                </div>

                <p className={`${MONO} mx-auto mt-10 text-center text-[10.5px] uppercase tracking-[0.18em] text-black/40`}>
                    Hourly · reserved &amp; spot available
                </p>
            </Container>
        </section>
    );
}

/* ───────── Stack section: GPU featured card (with embedded NVIDIA lineup)
   followed by 5 layer cards in a varied grid. Different from kubernetes bento
   — single hero across the top, varied 3+2 below. ───────── */

function StackLayerCard({ piece, index }: { piece: StackPiece; index: number }) {
    return (
        <article className="group relative flex flex-col gap-4 rounded-[10px] border border-white/[0.10] bg-[#0F1114] p-6 transition-colors hover:border-white/[0.22] sm:p-7">
            <div className="relative flex items-start justify-between">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-[8px] border border-white/[0.12] bg-white/[0.03] text-white/85">
                    <div className="h-[26px] w-[26px]">{piece.icon}</div>
                </div>
                <div className="flex items-center gap-2">
                    <span className={`${MONO} inline-flex items-center gap-1.5 rounded-full border border-white/[0.10] bg-white/[0.03] px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-white/55`}>
                        <span className="h-1 w-1 rounded-full bg-[#0095FF]" />
                        {piece.role}
                    </span>
                    <span className={`${MONO} text-[10.5px] tabular-nums text-white/30`}>
                        {String(index + 1).padStart(2, "0")}
                    </span>
                </div>
            </div>

            <div>
                <h3 className="text-[17px] font-semibold leading-[1.2] tracking-[-0.01em] text-white">{piece.title}</h3>
                <p className="mt-2.5 text-[12.5px] leading-[1.6] text-white/60">{piece.description}</p>
            </div>

            <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
                {piece.capabilities.map((c) => (
                    <span key={c} className={`${MONO} inline-flex items-center rounded-[3px] border border-white/[0.10] bg-white/[0.03] px-2 py-0.5 text-[10px] uppercase tracking-[0.10em] text-white/70`}>
                        {c}
                    </span>
                ))}
            </div>
        </article>
    );
}

function Stack() {
    return (
        <section id="stack" className="relative overflow-hidden bg-[#0D0D0F] py-20 sm:py-24 lg:py-28">
            <div aria-hidden className="absolute top-0 left-1/2 h-px w-[60%] -translate-x-1/2 bg-gradient-to-r from-transparent via-white/10 to-transparent" />

            <Container className="relative z-10">
                <div className="mx-auto flex max-w-[1180px] flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-[640px]">
                        <p className={`${MONO} mb-5 inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-white/50`}>
                            <span className="h-1.5 w-1.5 rounded-full bg-[#0095FF]" />
                            Platform anatomy
                        </p>
                        <h2 className="text-3xl font-semibold leading-[1.05] tracking-[-0.02em] text-white sm:text-4xl lg:text-[44px]">
                            GPUs plus everything around them.
                        </h2>
                    </div>
                    <p className="max-w-[380px] text-[14px] leading-[1.6] text-white/55">
                        GPUs alone don&apos;t ship an AI product. Storage, data, orchestration,
                        and network sit on the same private VPC — no egress between
                        them.
                    </p>
                </div>

                {/* Featured GPU hero card — full-width, contains inline NVIDIA lineup */}
                <article className="relative mx-auto mt-14 max-w-[1180px] overflow-hidden rounded-[12px] border border-[#0095FF]/40 bg-[linear-gradient(180deg,#13161B_0%,#0F1114_100%)] p-7 sm:p-9 lg:p-10"
                    style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05), 0 32px 80px -40px rgba(0,149,255,0.30)" }}
                >
                    <div aria-hidden className="pointer-events-none absolute -right-32 -top-32 h-80 w-80 rounded-full bg-[#0095FF]/[0.10] blur-3xl" />
                    <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.04]" style={{
                        backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,1) 1px, transparent 0)",
                        backgroundSize: "20px 20px",
                    }} />

                    <div className="relative grid gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.3fr)] lg:items-start lg:gap-12">
                        <div>
                            <div className="flex items-center gap-3">
                                <div className="inline-flex h-12 w-12 items-center justify-center rounded-[8px] border border-white/[0.12] bg-white/[0.03] text-white/85">
                                    <div className="h-[26px] w-[26px]"><GpuIcon /></div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={`${MONO} inline-flex items-center gap-1.5 rounded-full border border-white/[0.10] bg-white/[0.03] px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-white/55`}>
                                        <span className="h-1 w-1 rounded-full bg-[#0095FF]" />
                                        Compute
                                    </span>
                                    <span className={`${MONO} text-[10.5px] tabular-nums text-white/30`}>01</span>
                                </div>
                            </div>

                            <div className="mt-5 flex items-center gap-3">
                                <h3 className="text-[22px] font-semibold leading-[1.15] tracking-[-0.01em] text-white sm:text-[26px]">
                                    GPU compute
                                </h3>
                                <div className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.10] bg-white/[0.04] px-2 py-1 text-white/85">
                                    <span className={`${MONO} text-[8.5px] font-semibold uppercase tracking-[0.16em] text-white/55`}>
                                        Powered by
                                    </span>
                                    <NvidiaLogo width={42} height={11} />
                                </div>
                            </div>

                            <p className="mt-3 max-w-[440px] text-[13.5px] leading-[1.6] text-white/60">
                                Six NVIDIA GPU classes from B200 down to A10, available
                                on-demand, reserved, and (for select classes) spot.
                                Drivers, CUDA, NCCL, and DCGM exporters pre-baked into
                                every image.
                            </p>

                            <div className="mt-5 flex flex-wrap gap-1.5">
                                {["B200 · H200 · H100", "A100 · L40S · A10", "NVLink islands", "MIG slicing"].map((c) => (
                                    <span key={c} className={`${MONO} inline-flex items-center rounded-[3px] border border-white/[0.10] bg-white/[0.03] px-2 py-0.5 text-[10px] uppercase tracking-[0.10em] text-white/70`}>
                                        {c}
                                    </span>
                                ))}
                            </div>

                            <Link
                                href="/services/gpu"
                                className={`${MONO} mt-6 inline-flex h-10 items-center gap-1.5 rounded-[5px] bg-white px-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#1A1814] transition-colors hover:bg-white/90`}
                            >
                                See full GPU pricing
                                <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                        </div>

                        {/* GPU lineup grid */}
                        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-[8px] border border-white/[0.08] bg-white/[0.08] sm:grid-cols-2 lg:grid-cols-3">
                            {GPU_LINEUP.map((g) => (
                                <div
                                    key={g.model}
                                    className="relative flex flex-col gap-3 bg-[#0F1114] p-4"
                                >
                                    <div className="flex items-baseline justify-between gap-2">
                                        <span className={`${MONO} text-[15px] font-bold tabular-nums text-white`}>
                                            {g.model}
                                        </span>
                                        {g.badge && (
                                            <span className={`${MONO} inline-flex items-center rounded-[3px] bg-[#0095FF]/[0.18] px-1.5 py-0.5 text-[8.5px] font-semibold uppercase tracking-[0.12em] text-[#0095FF]`}>
                                                {g.badge}
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex flex-col gap-1.5">
                                        <div className="flex items-center gap-2">
                                            <span className={`${MONO} w-9 text-[9px] uppercase tracking-[0.14em] text-white/40`}>VRAM</span>
                                            <span className={`${MONO} w-[52px] text-[11px] tabular-nums text-white/75`}>{g.vram}</span>
                                            <span className="relative h-1 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
                                                <span className="absolute inset-y-0 left-0 rounded-full bg-white/70" style={{ width: `${g.vramBar * 100}%` }} />
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className={`${MONO} w-9 text-[9px] uppercase tracking-[0.14em] text-white/40`}>FP16</span>
                                            <span className={`${MONO} w-[52px] text-[11px] tabular-nums text-white/75`}>{g.flops}</span>
                                            <span className="relative h-1 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
                                                <span className="absolute inset-y-0 left-0 rounded-full bg-[#0095FF]" style={{ width: `${g.flopsBar * 100}%` }} />
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex items-baseline justify-between border-t border-white/[0.06] pt-2.5">
                                        <span className={`${MONO} text-[9px] uppercase tracking-[0.14em] text-white/40`}>From</span>
                                        <div>
                                            <span className={`${MONO} text-[14px] font-bold tabular-nums text-white`}>{g.from}</span>
                                            <span className="ml-0.5 text-[10px] text-white/40">/hr</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </article>

                {/* 5 layer cards in 3+2 grid */}
                <div className="mx-auto mt-5 grid max-w-[1180px] grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="lg:col-span-1"><StackLayerCard piece={STACK_TRAIN} index={1} /></div>
                    <div className="lg:col-span-1"><StackLayerCard piece={STACK_INFER} index={2} /></div>
                    <div className="lg:col-span-1"><StackLayerCard piece={STACK_DATA} index={3} /></div>
                </div>
                <div className="mx-auto mt-5 grid max-w-[1180px] grid-cols-1 gap-5 lg:grid-cols-2">
                    <StackLayerCard piece={STACK_K8S} index={4} />
                    <StackLayerCard piece={STACK_NET} index={5} />
                </div>
            </Container>
        </section>
    );
}

function Workloads() {
    const [gridHovered, setGridHovered] = useState(false);
    return (
        <section className="relative overflow-hidden bg-[#E6E4DC] py-20 text-[#1A1814] sm:py-24 lg:py-28">
            {/* ─── Warm paper grain ─── */}
            <PaperGrain opacity={0.07} />

            <Container className="relative z-10">
                <div className="mx-auto max-w-[760px] text-center">
                    <p className={`${MONO} mb-5 inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-black/55`}>
                        <span className="h-1.5 w-1.5 rounded-full bg-[#0095FF]" />
                        Workloads
                    </p>
                    <h2 className={`text-3xl font-semibold leading-[1.05] tracking-[-0.02em] transition-colors duration-300 sm:text-4xl lg:text-[48px] ${gridHovered ? "text-[#0095FF]" : "text-[#1A1814]"}`}>
                        Sized to what AI teams{" "}
                        <span style={ACCENT_FONT} className={gridHovered ? "text-[#0095FF]" : "text-[#0066B3]"}>
                            actually run.
                        </span>
                    </h2>
                </div>

                <div
                    className="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-[8px] border border-black/[0.10] bg-black/[0.10] sm:grid-cols-2 lg:grid-cols-3"
                    onMouseEnter={() => setGridHovered(true)}
                    onMouseLeave={() => setGridHovered(false)}
                >
                    {WORKLOADS.map((w, i) => (
                        <article key={w.title} className="flex flex-col gap-4 bg-[#EEECE4] p-7">
                            <div className="flex items-start justify-between">
                                <div className="inline-flex h-12 w-12 items-center justify-center rounded-[7px] border border-black/[0.12] bg-[#1A1814] text-[#EEECE4]">
                                    <div className="h-[26px] w-[26px]">{w.glyph}</div>
                                </div>
                                <span className={`${MONO} text-[10.5px] tabular-nums text-black/30`}>
                                    {String(i + 1).padStart(2, "0")}
                                </span>
                            </div>
                            <div>
                                <p className={`${MONO} mb-2 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-black/50`}>
                                    <span className="h-1 w-1 rounded-full bg-[#0095FF]" />
                                    {w.metric}
                                </p>
                                <h3 className="text-[18px] font-semibold leading-[1.25] tracking-[-0.01em] text-[#1A1814]">{w.title}</h3>
                                <p className="mt-2 text-[13.5px] leading-[1.6] text-black/60">{w.description}</p>
                            </div>
                        </article>
                    ))}
                </div>
            </Container>
        </section>
    );
}

/* ──────────────────────────────────────────────────────────────
   Page
   ────────────────────────────────────────────────────────────── */

export function AiMlLanding() {
    return (
        <main className="bg-[#0D0D0F]">
            <ServiceHeroSection
                badge="AI / ML"
                title={<>Infrastructure for the full <span className="text-[#0095FF]">AI lifecycle.</span></>}
                description="Training, fine-tuning, and inference on NVIDIA GPUs — with the data layer wired in."
                primaryAction={{ label: "Talk to AI engineering", href: "/contact" }}
                secondaryAction={{ label: "Browse GPU lineup", href: "/services/gpu" }}
                backgroundImage={{ src: "/images/hero/service-hero-bg.png", alt: "" }}
                illustration={{
                    src: "/images/main-page/gpu aniamtion resized.png",
                    alt: "GPU cluster",
                    priority: true,
                }}
            />
            <HeroStats metrics={HERO_STATS} eyebrow="GPU platform" />
            <ModelTrainingPipelineSection />
            <Scenarios />
            <Workloads />
            <ServicesHomeSectionFive title="Frequently asked questions" faqs={FAQS} />
        </main>
    );
}
