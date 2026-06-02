"use client";
import { assetUrl } from "@/lib/asset-url";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Container } from "@/components/ui/container";
import { ServiceHeroSection } from "@/components/services/service-hero-section";
import ServicesHomeSectionFive from "@/components/serviceshome/section-5";
import { HeroStats } from "@/components/solutions/shared/hero-stats";
import { ACCENT_FONT, Aurora, Eclipse, PaperGrain } from "@/components/brand/atmosphere";

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const CDN = "https://ahurasense.cs2hvh.com/images/2026-06";

/* ──────────────────────────────────────────────────────────────
   Stack glyphs (32×32, layered + blue accent)
   ────────────────────────────────────────────────────────────── */

function ControlPlaneIcon() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3} strokeLinejoin="round">
            <path d="M16 3l11 5.5v13L16 28.5 5 21.5v-13L16 3z" fill="currentColor" fillOpacity="0.08" />
            <circle cx="16" cy="15" r="3" fill="#0095FF" fillOpacity="0.30" stroke="#0095FF" />
            <circle cx="10" cy="20" r="1.4" fill="currentColor" />
            <circle cx="22" cy="20" r="1.4" fill="currentColor" />
            <circle cx="16" cy="8" r="1.4" fill="currentColor" />
            <path d="M16 11v1.4M11 19l3-2.2M21 19l-3-2.2" strokeOpacity="0.55" />
        </svg>
    );
}

function WorkersIcon() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            <rect x="3" y="5" width="9" height="9" rx="1" fill="currentColor" fillOpacity="0.10" />
            <rect x="14" y="5" width="9" height="9" rx="1" fill="currentColor" fillOpacity="0.10" />
            <rect x="3" y="16" width="9" height="9" rx="1" fill="#0095FF" fillOpacity="0.20" stroke="#0095FF" />
            <rect x="14" y="16" width="9" height="9" rx="1" fill="currentColor" fillOpacity="0.10" />
            <rect x="25" y="5" width="4" height="20" rx="0.6" fill="currentColor" fillOpacity="0.18" />
            <circle cx="6" cy="8" r="0.6" fill="currentColor" />
            <circle cx="17" cy="8" r="0.6" fill="currentColor" />
            <circle cx="6" cy="19" r="0.6" fill="#0095FF" />
            <circle cx="17" cy="19" r="0.6" fill="currentColor" />
        </svg>
    );
}

function GpuPoolIcon() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            <rect x="3" y="9" width="12" height="14" rx="1.2" fill="#0095FF" fillOpacity="0.20" stroke="#0095FF" />
            <rect x="17" y="9" width="12" height="14" rx="1.2" fill="currentColor" fillOpacity="0.18" />
            <circle cx="6" cy="13" r="0.7" fill="#0095FF" />
            <circle cx="6" cy="16" r="0.7" fill="#0095FF" />
            <circle cx="6" cy="19" r="0.7" fill="#0095FF" />
            <circle cx="20" cy="13" r="0.7" fill="currentColor" />
            <circle cx="20" cy="16" r="0.7" fill="currentColor" />
            <circle cx="20" cy="19" r="0.7" fill="currentColor" />
            <path d="M15 16h2" strokeOpacity="0.55" strokeDasharray="1 1" />
            <path d="M9 9V6M23 9V6M9 23v3M23 23v3" strokeOpacity="0.4" />
        </svg>
    );
}

function NetworkIcon() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            <circle cx="16" cy="16" r="3.4" fill="#0095FF" fillOpacity="0.30" stroke="#0095FF" />
            <circle cx="6" cy="6" r="2" fill="currentColor" fillOpacity="0.10" stroke="currentColor" />
            <circle cx="26" cy="6" r="2" fill="currentColor" fillOpacity="0.10" stroke="currentColor" />
            <circle cx="6" cy="26" r="2" fill="currentColor" fillOpacity="0.10" stroke="currentColor" />
            <circle cx="26" cy="26" r="2" fill="currentColor" fillOpacity="0.10" stroke="currentColor" />
            <path d="M7.5 7.5l6 6M24.5 7.5l-6 6M7.5 24.5l6-6M24.5 24.5l-6-6" strokeOpacity="0.6" />
        </svg>
    );
}

function StorageIcon() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            <ellipse cx="16" cy="6" rx="10" ry="2.4" fill="currentColor" fillOpacity="0.10" />
            <path d="M6 6v6c0 1.4 4.5 2.5 10 2.5s10-1.1 10-2.5V6" />
            <path d="M6 12v6c0 1.4 4.5 2.5 10 2.5s10-1.1 10-2.5v-6" />
            <path d="M6 18v6c0 1.4 4.5 2.5 10 2.5s10-1.1 10-2.5v-6" />
            <circle cx="22" cy="11" r="0.9" fill="#0095FF" />
            <circle cx="22" cy="17" r="0.9" fill="#0095FF" />
            <circle cx="22" cy="23" r="0.9" fill="#0095FF" />
        </svg>
    );
}

function ObservabilityIcon() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="26" height="22" rx="1.5" fill="currentColor" fillOpacity="0.08" />
            <path d="M3 21l5-6 4 3 5-9 4 6 8-4" />
            <circle cx="8" cy="15" r="1.2" fill="currentColor" />
            <circle cx="12" cy="18" r="1.2" fill="currentColor" />
            <circle cx="17" cy="9" r="1.2" fill="#0095FF" />
            <circle cx="21" cy="15" r="1.2" fill="currentColor" />
            <circle cx="29" cy="11" r="1.2" fill="#0095FF" />
        </svg>
    );
}

/* ──────── Workload glyphs ──────── */

function MicroservicesGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            <rect x="3" y="3" width="8" height="8" rx="1" fill="currentColor" fillOpacity="0.15" />
            <rect x="13" y="3" width="8" height="8" rx="1" fill="#0095FF" fillOpacity="0.25" stroke="#0095FF" />
            <rect x="23" y="3" width="6" height="8" rx="1" fill="currentColor" fillOpacity="0.15" />
            <rect x="3" y="13" width="6" height="8" rx="1" fill="currentColor" fillOpacity="0.15" />
            <rect x="11" y="13" width="10" height="8" rx="1" fill="currentColor" fillOpacity="0.18" />
            <rect x="23" y="13" width="6" height="8" rx="1" fill="#0095FF" fillOpacity="0.25" stroke="#0095FF" />
            <rect x="3" y="23" width="11" height="6" rx="1" fill="currentColor" fillOpacity="0.15" />
            <rect x="16" y="23" width="13" height="6" rx="1" fill="currentColor" fillOpacity="0.15" />
        </svg>
    );
}

function AiWorkloadGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            {[8, 12, 16, 20, 24].map((y, i) => (
                <line key={y} x1="3" y1={y} x2="29" y2={y} strokeOpacity={0.35 + i * 0.05} />
            ))}
            <circle cx="8" cy="8" r="1.3" fill="currentColor" />
            <circle cx="14" cy="12" r="1.3" fill="#0095FF" />
            <circle cx="18" cy="16" r="1.3" fill="currentColor" />
            <circle cx="22" cy="20" r="1.3" fill="#0095FF" />
            <circle cx="26" cy="24" r="1.3" fill="currentColor" />
        </svg>
    );
}

function BatchGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3} strokeLinejoin="round">
            <rect x="3" y="7" width="22" height="5" rx="0.6" fill="currentColor" fillOpacity="0.15" />
            <rect x="3" y="14" width="26" height="5" rx="0.6" fill="#0095FF" fillOpacity="0.25" stroke="#0095FF" />
            <rect x="3" y="21" width="18" height="5" rx="0.6" fill="currentColor" fillOpacity="0.15" />
            <circle cx="6" cy="9.5" r="0.6" fill="currentColor" />
            <circle cx="6" cy="16.5" r="0.6" fill="#0095FF" />
            <circle cx="6" cy="23.5" r="0.6" fill="currentColor" />
        </svg>
    );
}

function StatefulGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            <rect x="3" y="3" width="9" height="26" rx="1" fill="currentColor" fillOpacity="0.10" />
            <rect x="14" y="3" width="9" height="26" rx="1" fill="#0095FF" fillOpacity="0.20" stroke="#0095FF" />
            <ellipse cx="7.5" cy="9" rx="3.5" ry="1.2" />
            <path d="M4 9v12c0 0.7 1.6 1.2 3.5 1.2s3.5-0.5 3.5-1.2V9" />
            <ellipse cx="18.5" cy="9" rx="3.5" ry="1.2" stroke="#0095FF" />
            <path d="M15 9v12c0 0.7 1.6 1.2 3.5 1.2s3.5-0.5 3.5-1.2V9" stroke="#0095FF" />
            <rect x="25" y="6" width="4" height="20" rx="0.5" fill="currentColor" fillOpacity="0.18" />
        </svg>
    );
}

function EdgeWorkloadGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            <circle cx="16" cy="16" r="11" strokeOpacity="0.4" />
            <circle cx="16" cy="16" r="7" strokeOpacity="0.55" />
            <circle cx="16" cy="16" r="2.5" fill="#0095FF" fillOpacity="0.30" stroke="#0095FF" />
            <rect x="3" y="3" width="3" height="3" rx="0.4" fill="currentColor" />
            <rect x="26" y="3" width="3" height="3" rx="0.4" fill="currentColor" />
            <rect x="3" y="26" width="3" height="3" rx="0.4" fill="currentColor" />
            <rect x="26" y="26" width="3" height="3" rx="0.4" fill="currentColor" />
        </svg>
    );
}

function CiCdGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="7" cy="7" r="2.2" fill="currentColor" fillOpacity="0.18" />
            <circle cx="7" cy="25" r="2.2" fill="currentColor" fillOpacity="0.18" />
            <circle cx="25" cy="16" r="2.4" fill="#0095FF" fillOpacity="0.30" stroke="#0095FF" />
            <path d="M7 9.2v13.6" />
            <path d="M7 16c0-3.5 5-3.5 9-3.5 4 0 6-2 6.5-2.5" strokeOpacity="0.7" />
            <path d="M7 16c0 3.5 5 3.5 9 3.5 4 0 6 2 6.5 2.5" strokeOpacity="0.4" />
        </svg>
    );
}

/* ──────── Request-flow nodes (pod lifecycle) ──────── */

function NodeCode() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="5" width="24" height="22" rx="1.5" />
            <path d="M11 12l-3 4 3 4M21 12l3 4-3 4M18 11l-4 10" />
        </svg>
    );
}
function NodeBuild() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round">
            <circle cx="16" cy="16" r="4" />
            <path d="M16 4v3M16 25v3M4 16h3M25 16h3M7.6 7.6l2 2M22.4 22.4l-2-2M7.6 24.4l2-2M22.4 9.6l-2 2" strokeLinecap="round" />
        </svg>
    );
}
function NodeImage() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round">
            <path d="M16 4l11 6v12l-11 6-11-6V10l11-6z" />
            <path d="M5 10l11 6 11-6M16 16v12" strokeOpacity="0.55" />
        </svg>
    );
}
function NodeRegistry() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4}>
            <rect x="5" y="7" width="22" height="6" rx="1" />
            <rect x="5" y="15" width="22" height="6" rx="1" />
            <rect x="5" y="23" width="22" height="4" rx="1" />
            <circle cx="8" cy="10" r="0.6" fill="currentColor" />
            <circle cx="8" cy="18" r="0.6" fill="currentColor" />
        </svg>
    );
}
function NodeScheduler() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="16" cy="16" r="10" />
            <path d="M16 9v7l5 3" />
            <path d="M7 16h2M23 16h2M16 7v2M16 23v2" />
        </svg>
    );
}
function NodePod() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round">
            <path d="M16 4l11 6v12l-11 6-11-6V10l11-6z" />
            <circle cx="16" cy="16" r="3" fill="currentColor" fillOpacity="0.4" />
        </svg>
    );
}
function NodeMesh() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4}>
            <circle cx="16" cy="16" r="3" />
            <circle cx="6" cy="6" r="2" />
            <circle cx="26" cy="6" r="2" />
            <circle cx="6" cy="26" r="2" />
            <circle cx="26" cy="26" r="2" />
            <path d="M7.5 7.5l6 6M24.5 7.5l-6 6M7.5 24.5l6-6M24.5 24.5l-6-6" strokeOpacity="0.55" />
        </svg>
    );
}

/* ──────────────────────────────────────────────────────────────
   Data
   ────────────────────────────────────────────────────────────── */

const HERO_STATS = [
    { value: "<60s", label: "Pod schedule" },
    { value: "99.95%", label: "Control plane SLA" },
    { value: "6", label: "GPU classes" },
    { value: "12", label: "Regions" },
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
        name: "Dev / staging cluster",
        persona: "Internal envs, PoCs",
        description: "Single-zone managed cluster for testing manifests and Helm charts. No HA, sized for spend.",
        monthly: "$45",
        suffix: "/mo",
        services: [
            { glyph: <ControlPlaneIcon />, label: "Managed control plane" },
            { glyph: <WorkersIcon />, label: "1 node pool" },
            { glyph: <StorageIcon />, label: "Block storage" },
        ],
        specs: [
            { label: "Nodes", value: "2 × 2 vCPU / 8 GB" },
            { label: "Topology", value: "Single AZ" },
            { label: "Storage", value: "100 GB block · CSI" },
        ],
        cta: { label: "Spin one up", href: "/services/kubernetes" },
    },
    {
        name: "Production microservices",
        persona: "50+ services live",
        description: "HA control plane, 3-zone worker pools, service mesh, ingress, observability, and GitOps deploys.",
        monthly: "$480",
        suffix: "–$960/mo",
        services: [
            { glyph: <ControlPlaneIcon />, label: "HA control plane" },
            { glyph: <WorkersIcon />, label: "Auto-scale pools" },
            { glyph: <NetworkIcon />, label: "Service mesh" },
            { glyph: <StorageIcon />, label: "Block + object" },
            { glyph: <ObservabilityIcon />, label: "Prom + Grafana" },
            { glyph: <CiCdGlyph />, label: "GitOps (Flux)" },
        ],
        specs: [
            { label: "Nodes", value: "9 × 4 vCPU / 16 GB · 3 AZ" },
            { label: "Mesh", value: "mTLS · canary · circuit break" },
            { label: "Observability", value: "Prom + Loki + Tempo" },
        ],
        cta: { label: "Recommended", href: "/services/kubernetes" },
        featured: true,
    },
    {
        name: "GPU & AI cluster",
        persona: "Training + inference",
        description: "Mixed CPU + GPU pools (H100/H200/A100), MIG slicing, autoscaler keyed to queue depth.",
        monthly: "$1,800",
        suffix: "–$4,200/mo",
        services: [
            { glyph: <ControlPlaneIcon />, label: "HA control plane" },
            { glyph: <GpuPoolIcon />, label: "GPU node pool" },
            { glyph: <StorageIcon />, label: "Fast object" },
            { glyph: <NetworkIcon />, label: "Service mesh" },
            { glyph: <ObservabilityIcon />, label: "GPU metrics" },
        ],
        specs: [
            { label: "GPU pool", value: "4× H100 · MIG-sliced" },
            { label: "CPU pool", value: "Auto-scale · queue-driven" },
            { label: "Storage", value: "NVMe · object · S3-compat" },
        ],
        cta: { label: "Compose stack", href: "/contact" },
    },
    {
        name: "Multi-region enterprise",
        persona: "Compliance, global",
        description: "Dedicated capacity, multi-region clusters, audited GitOps, SSO, contractual SLAs.",
        monthly: "Custom",
        services: [
            { glyph: <ControlPlaneIcon />, label: "Dedicated CP" },
            { glyph: <WorkersIcon />, label: "Multi-region" },
            { glyph: <NetworkIcon />, label: "Cross-region mesh" },
            { glyph: <StorageIcon />, label: "Replicated storage" },
            { glyph: <CiCdGlyph />, label: "Audited GitOps" },
            { glyph: <ObservabilityIcon />, label: "Audit + SSO" },
        ],
        specs: [
            { label: "Topology", value: "Multi-region · multi-cluster" },
            { label: "Compliance", value: "SOC 2 · audit · RBAC" },
            { label: "Support", value: "Dedicated SRE · 24×7" },
        ],
        cta: { label: "Talk to sales", href: "/contact" },
    },
];

type FlowNode = { icon: React.ReactNode; label: string; sub: string };

const FLOW: FlowNode[] = [
    { icon: <Image src={`${CDN}/cE8QY0xcPujT.png`} alt="" width={42} height={42} className="h-[42px] w-[42px] object-contain" />, label: "git push", sub: "Source of truth" },
    { icon: <Image src={`${CDN}/J9AYbboJ01ws.png`} alt="" width={42} height={42} className="h-[42px] w-[42px] object-contain" />, label: "Build", sub: "Buildpack · Docker" },
    { icon: <Image src={`${CDN}/NK4IVIM5SyCj.png`} alt="" width={42} height={42} className="h-[42px] w-[42px] object-contain" />, label: "Image", sub: "Signed · scanned" },
    { icon: <Image src={`${CDN}/pY9A6E-4WQ36.png`} alt="" width={42} height={42} className="h-[42px] w-[42px] object-contain" />, label: "Registry", sub: "Private · cached" },
    { icon: <Image src={`${CDN}/DdAI95G-7CND.png`} alt="" width={42} height={42} className="h-[42px] w-[42px] object-contain" />, label: "Scheduler", sub: "Pick the right node" },
    { icon: <Image src={`${CDN}/UA5xOZdoiNZr.png`} alt="" width={42} height={42} className="h-[42px] w-[42px] object-contain" />, label: "Pod", sub: "Healthy · routable" },
    { icon: <Image src={`${CDN}/gCeeq2Zaw69B.png`} alt="" width={42} height={42} className="h-[42px] w-[42px] object-contain" />, label: "Service mesh", sub: "mTLS · routed" },
];

type BoundaryItem = { title: string; detail: string };

const WE_OPERATE: BoundaryItem[] = [
    {
        title: "Control plane",
        detail: "API server, scheduler, controller-manager — patched, upgraded, observable.",
    },
    {
        title: "etcd quorum",
        detail: "3-node HA, encrypted backups, recovery drills you don't have to schedule.",
    },
    {
        title: "Node lifecycle",
        detail: "Worker images, kernel patches, NVIDIA driver stack, drain-safe pool upgrades.",
    },
    {
        title: "Networking baseline",
        detail: "eBPF CNI, ingress controller, regional load balancer, mesh if you want one.",
    },
    {
        title: "Storage baseline",
        detail: "CSI block storage, dynamic PVCs, volume snapshots, cross-AZ replication.",
    },
    {
        title: "Observability + policy",
        detail: "Prom + Loki + Tempo wired in, OPA admission defaults, audit logs streamed.",
    },
];

const YOU_SHIP: BoundaryItem[] = [
    {
        title: "Container images",
        detail: "Your code, your registry, your software supply chain.",
    },
    {
        title: "Helm charts & manifests",
        detail: "What runs, where, how many — declarative and version-controlled.",
    },
    {
        title: "Application logic",
        detail: "Services, business rules, integrations — the actual product.",
    },
    {
        title: "Ingress & TLS hostnames",
        detail: "Your domains, your routing rules, your certificate sources.",
    },
    {
        title: "GitOps pipelines",
        detail: "Flux or Argo CD, drift detection, your approval flow.",
    },
    {
        title: "Custom CRDs & operators",
        detail: "Domain extensions and controllers — first-class on every cluster.",
    },
];

type Workload = { glyph: React.ReactNode; metric: string; title: string; description: string };

const WORKLOADS: Workload[] = [
    {
        glyph: <Image src={`${CDN}/8rebbH60LsGR.png`} alt="" width={26} height={26} className="h-full w-full object-contain" />,
        metric: "Services",
        title: "Production microservices",
        description: "50+ services with mTLS, canary rollouts, ingress, and per-namespace quotas. SRE-friendly defaults from day one.",
    },
    {
        glyph: <Image src={`${CDN}/4htLSu3rX6Lw.png`} alt="" width={26} height={26} className="h-full w-full object-contain" />,
        metric: "AI / ML",
        title: "Training and inference fleets",
        description: "Distributed training on InfiniBand-tuned topologies, autoscaling inference pools, GPU-aware schedulers, weight cache in object storage.",
    },
    {
        glyph: <Image src={`${CDN}/YNyFlFIDdvJb.png`} alt="" width={26} height={26} className="h-full w-full object-contain" />,
        metric: "Batch",
        title: "Batch jobs and pipelines",
        description: "Argo Workflows, Airflow on K8s, parallel jobs with retry semantics — backed by spot node pools where it makes sense.",
    },
    {
        glyph: <Image src={`${CDN}/md4uQBHMIx8Z.png`} alt="" width={26} height={26} className="h-full w-full object-contain" />,
        metric: "Stateful",
        title: "StatefulSets and operators",
        description: "Run Postgres, Kafka, Elasticsearch, and your own operators with first-class PVCs, headless services, and pod-disruption budgets.",
    },
    {
        glyph: <Image src={`${CDN}/V6oCfyxsVA9S.png`} alt="" width={26} height={26} className="h-full w-full object-contain" />,
        metric: "Edge",
        title: "Edge and regional fanout",
        description: "Multi-cluster federation across regions, mesh peering, and policy that follows the workload — for low-latency global apps.",
    },
    {
        glyph: <Image src={`${CDN}/3qUfmBw68G3d.png`} alt="" width={26} height={26} className="h-full w-full object-contain" />,
        metric: "GitOps",
        title: "GitOps & platform delivery",
        description: "Flux or Argo CD wired in, Helm and Kustomize-aware, drift detection per app — your platform team ships through the same pipe.",
    },
];

const FAQS = [
    {
        question: "Is the control plane truly managed?",
        answer:
            "Yes. API server, scheduler, controller-manager, and a 3-node etcd quorum are operated by us, with version upgrades, patching, and 99.95% SLA. You bring the workloads, the namespaces, and the manifests.",
    },
    {
        question: "Do you support GPU workloads?",
        answer:
            "Yes. Provision GPU node pools (H100, H200, A100, L40S, A10) with the NVIDIA device plugin, drivers, and DCGM exporters pre-installed. MIG slicing lets a single H100 serve multiple smaller inference jobs.",
    },
    {
        question: "How does autoscaling work?",
        answer:
            "Cluster autoscaler grows and shrinks node pools based on pending pods and pool min/max. HPA scales replicas on CPU, RAM, or custom metrics. KEDA is supported for event-driven scaling on queues, topics, and HTTP RPS.",
    },
    {
        question: "Can I run a service mesh?",
        answer:
            "Yes. Optional managed service mesh provides mTLS between pods, canary and traffic splitting, circuit breakers, and per-route policy. You can also bring your own (Istio, Linkerd, Cilium service mesh) — we won't fight you on it.",
    },
    {
        question: "What about GitOps and policy?",
        answer:
            "Flux and Argo CD are first-class. OPA/Gatekeeper and Kyverno admission policies are supported, with sensible defaults shipped per cluster. Audit logs stream into the observability stack alongside metrics and traces.",
    },
    {
        question: "How is storage handled?",
        answer:
            "CSI block storage backs PVCs with dynamic provisioning, volume snapshots, and cross-AZ replication. S3-compatible object storage sits next to the cluster on the private VPC — same network, no egress.",
    },
];

/* ──────────────────────────────────────────────────────────────
   Sections
   ────────────────────────────────────────────────────────────── */

function RequestFlow() {
    return (
        <section className="relative overflow-hidden bg-[#0D0D0F] py-20 sm:py-24 lg:py-28">
            <div aria-hidden className="absolute top-0 left-1/2 h-px w-[60%] -translate-x-1/2 bg-gradient-to-r from-transparent via-white/10 to-transparent" />

            <Aurora intensity="medium" />
            <Eclipse position="top" size={780} intensity={0.10} blur={90} />

            <Container className="relative z-10">
                <div className="mx-auto max-w-[760px] text-center">
                    <p className={`${MONO} mb-5 inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-white/50`}>
                        <span className="h-1.5 w-1.5 rounded-full bg-[#0095FF]" />
                        Pod lifecycle
                    </p>
                    <h2 className="text-3xl font-semibold leading-[1.05] tracking-[-0.02em] text-white sm:text-4xl lg:text-[52px]">
                        git push to ready pod,{" "}
                        <span style={ACCENT_FONT} className="text-[#82adfb]">
                            in under a minute.
                        </span>
                    </h2>
                </div>

                <div className="relative mx-auto mt-14 max-w-[1180px] overflow-x-auto">
                    <div className="relative flex min-w-[860px] items-stretch justify-between gap-4 px-2">
                        <div aria-hidden className="pointer-events-none absolute left-[4%] right-[4%] top-[44px] h-px bg-gradient-to-r from-white/0 via-white/20 to-white/0" />
                        <div aria-hidden className="pointer-events-none absolute left-[4%] right-[4%] top-[44px] h-px overflow-hidden">
                            <span className="absolute -left-10 top-0 h-px w-24 bg-gradient-to-r from-transparent via-[#0095FF] to-transparent animate-[flowdash_3.6s_linear_infinite]" />
                        </div>

                        {FLOW.map((n, i) => (
                            <div key={n.label} className="relative z-10 flex flex-1 flex-col items-center gap-3">
                                <div className="relative flex h-[88px] w-[88px] items-center justify-center rounded-full border border-white/[0.12] bg-[#111316] text-white/85"
                                    style={{ boxShadow: "0 12px 30px -16px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)" }}>
                                    <div className="h-[42px] w-[42px]">{n.icon}</div>
                                    <span className="absolute -bottom-1 -right-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/[0.12] bg-[#0D0D0F] text-[9px] font-bold text-white/55"
                                        style={{ fontFamily: "var(--font-geist-mono),ui-monospace,monospace" }}>
                                        {String(i + 1).padStart(2, "0")}
                                    </span>
                                </div>
                                <div className="text-center">
                                    <p className="text-[12.5px] font-semibold tracking-[-0.005em] text-white">{n.label}</p>
                                    <p className={`${MONO} mt-0.5 text-[10px] uppercase tracking-[0.14em] text-white/45`}>{n.sub}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="mx-auto mt-12 grid max-w-[1080px] grid-cols-1 gap-px overflow-hidden rounded-[6px] border border-white/[0.08] bg-white/[0.08] sm:grid-cols-3">
                    {[
                        { v: "<60s", l: "Pod schedule" },
                        { v: "<5min", l: "Push to live" },
                        { v: "Zero", l: "Downtime deploys" },
                    ].map((m) => (
                        <div key={m.l} className="group relative flex items-baseline justify-center gap-2 overflow-hidden bg-[#0D0D0F] px-4 py-5">
                            <span className={`${MONO} text-[18px] font-bold tabular-nums text-white`}>{m.v}</span>
                            <span className={`${MONO} text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45`}>{m.l}</span>
                            <span aria-hidden className="pointer-events-none absolute bottom-0 left-1/2 h-[2px] w-0 -translate-x-1/2 bg-[#0095FF] transition-[width] duration-300 group-hover:w-1/2" />
                        </div>
                    ))}
                </div>
            </Container>

            <style jsx>{`
                @keyframes flowdash {
                    0% { transform: translateX(0); }
                    100% { transform: translateX(1200px); }
                }
            `}</style>
        </section>
    );
}

function Scenarios() {
    const featured = SCENARIOS.find((s) => s.featured)!;
    const others = SCENARIOS.filter((s) => !s.featured);

    return (
        <section className="relative overflow-hidden bg-[#E6E4DC] py-20 text-[#1A1814] sm:py-24 lg:py-28">
            <PaperGrain opacity={0.07} />

            <Container className="relative z-10">
                <div className="mx-auto flex max-w-[1180px] flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-[680px]">
                        <p className={`${MONO} mb-5 inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-black/55`}>
                            <span className="h-1.5 w-1.5 rounded-full bg-[#0095FF]" />
                            Composed clusters
                        </p>
                        <h2 className="text-3xl font-semibold leading-[1.05] tracking-[-0.02em] text-[#1A1814] sm:text-4xl lg:text-[48px]">
                            One recommended cluster.{" "}
                            <span style={ACCENT_FONT} className="text-[#0066B3]">
                                Three alternatives.
                            </span>
                        </h2>
                    </div>
                    <p className="max-w-[360px] text-[14.5px] leading-[1.65] text-black/60">
                        Real cluster topologies — pick the one that matches your environment.
                    </p>
                </div>

                <article className="relative mx-auto mt-12 max-w-[1180px] overflow-hidden rounded-[12px] border-2 border-[#1A1814] bg-[#1A1814] text-[#EEECE4]">
                    <Eclipse position="top-right" size={520} intensity={0.18} color="#0095FF" />
                    <Eclipse position="bottom-left" size={420} intensity={0.10} color="#0095FF" blur={80} />

                    <div className={`${MONO} absolute right-5 top-5 z-10 inline-flex items-center gap-1.5 rounded-full bg-[#0095FF] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-white`}>
                        <span className="h-1 w-1 rounded-full bg-white" />
                        Recommended
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
                            className="relative flex flex-col overflow-hidden rounded-[10px] border border-black/[0.10] bg-[#EEECE4] text-[#1A1814] transition-all duration-200 hover:-translate-y-1 hover:border-[#0095FF]"
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
                                    className={`${MONO} mt-auto inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-[5px] border border-[#1A1814] bg-transparent text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#1A1814] transition-colors hover:border-black hover:bg-black hover:text-white`}
                                >
                                    {s.cta.label}
                                    <ArrowRight className="h-3 w-3" />
                                </Link>
                            </div>
                        </article>
                    ))}
                </div>

                <p className={`${MONO} mx-auto mt-10 max-w-[640px] text-center text-[10.5px] uppercase tracking-[0.18em] text-black/40`}>
                    Prices are indicative
                </p>
            </Container>
        </section>
    );
}

/* ──── Operational boundary: WE OPERATE / YOU SHIP ──── */

function BoundaryColumn({
    side,
    eyebrow,
    title,
    description,
    items,
    tag,
}: {
    side: "left" | "right";
    eyebrow: string;
    title: string;
    description: string;
    items: BoundaryItem[];
    tag: string;
}) {
    const isLeft = side === "left";
    return (
        <div
            className={`relative flex flex-col p-7 sm:p-9 lg:p-10 ${
                isLeft ? "lg:border-r lg:border-white/[0.06]" : ""
            }`}
        >
            {/* Side accent */}
            <div
                aria-hidden
                className={`absolute top-0 ${isLeft ? "left-0" : "right-0"} h-full w-[2px] ${
                    isLeft ? "bg-[#0095FF]" : "bg-white/25"
                }`}
            />

            <div className="flex items-baseline gap-3">
                <span
                    className={`${MONO} inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] ${
                        isLeft ? "text-[#0095FF]" : "text-white/60"
                    }`}
                >
                    <span className={`h-1 w-1 rounded-full ${isLeft ? "bg-[#0095FF]" : "bg-white/45"}`} />
                    {eyebrow}
                </span>
                <span className={`${MONO} text-[10px] tabular-nums text-white/30`}>
                    {String(items.length).padStart(2, "0")}
                </span>
            </div>

            <h3 className="mt-4 text-[22px] font-semibold leading-[1.2] tracking-[-0.01em] text-white sm:text-[26px]">
                {title}
            </h3>
            <p className="mt-2.5 max-w-[420px] text-[13px] leading-[1.6] text-white/55">
                {description}
            </p>

            <ul className="mt-8 flex flex-col">
                {items.map((it, i) => (
                    <li
                        key={it.title}
                        className={`group/row relative grid grid-cols-[28px_1fr_auto] items-start gap-4 py-4 ${
                            i > 0 ? "border-t border-white/[0.05]" : ""
                        }`}
                    >
                        <span className={`${MONO} pt-0.5 text-[10px] tabular-nums text-white/30`}>
                            {String(i + 1).padStart(2, "0")}
                        </span>
                        <div className="min-w-0">
                            <p className="text-[14px] font-semibold tracking-[-0.005em] text-white">
                                {it.title}
                            </p>
                            <p className="mt-1 text-[12.5px] leading-[1.55] text-white/55">
                                {it.detail}
                            </p>
                        </div>
                        <span
                            className={`${MONO} mt-1 inline-flex items-center rounded-[3px] border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] ${
                                isLeft
                                    ? "border-[#0095FF]/30 bg-[#0095FF]/[0.10] text-[#0095FF]"
                                    : "border-white/[0.12] bg-white/[0.04] text-white/65"
                            }`}
                        >
                            {tag}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function Stack() {
    return (
        <section id="stack" className="relative overflow-hidden bg-[#0D0D0F] py-20 sm:py-24 lg:py-28">
            <div aria-hidden className="absolute top-0 left-1/2 h-px w-[60%] -translate-x-1/2 bg-gradient-to-r from-transparent via-white/10 to-transparent" />

            <Aurora intensity="soft" />

            <Container className="relative z-10">
                <div className="mx-auto flex max-w-[1180px] flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-[680px]">
                        <p className={`${MONO} mb-5 inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-white/50`}>
                            <span className="h-1.5 w-1.5 rounded-full bg-[#0095FF]" />
                            Operational boundary
                        </p>
                        <h2 className="text-3xl font-semibold leading-[1.05] tracking-[-0.02em] text-white sm:text-4xl lg:text-[48px]">
                            We run the cluster.
                            <br />
                            <span style={ACCENT_FONT} className="text-[#82adfb]">
                                You ship the workloads.
                            </span>
                        </h2>
                    </div>
                    <p className="max-w-[360px] text-[14.5px] leading-[1.65] text-white/55">
                        A clean line between substrate and application — your team stays on product.
                    </p>
                </div>

                {/* Split table */}
                <div
                    className="mx-auto mt-14 max-w-[1180px] overflow-hidden rounded-[12px] border border-white/[0.10] bg-[#0F1114]"
                    style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 24px 60px -32px rgba(0,0,0,0.7)" }}
                >
                    <div className="grid grid-cols-1 lg:grid-cols-2">
                        <BoundaryColumn
                            side="left"
                            eyebrow="We operate"
                            title="The cluster substrate."
                            description="Everything below the workload boundary — managed, patched, monitored, on-call."
                            items={WE_OPERATE}
                            tag="Managed"
                        />
                        <BoundaryColumn
                            side="right"
                            eyebrow="You ship"
                            title="The application."
                            description="Everything above the boundary — your code, your shape, your release cadence."
                            items={YOU_SHIP}
                            tag="Yours"
                        />
                    </div>

                    {/* Footer commitments */}
                    <div className="grid grid-cols-1 gap-px border-t border-white/[0.08] bg-white/[0.08] sm:grid-cols-3">
                        {[
                            { v: "99.95%", l: "Control-plane SLA" },
                            { v: "24×7", l: "On-call SRE" },
                            { v: "Zero", l: "etcd babysitting" },
                        ].map((m) => (
                            <div key={m.l} className="group relative flex items-baseline justify-center gap-2.5 overflow-hidden bg-[#0F1114] px-4 py-5">
                                <span className={`${MONO} text-[16px] font-bold tabular-nums text-white`}>
                                    {m.v}
                                </span>
                                <span className={`${MONO} text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45`}>
                                    {m.l}
                                </span>
                                <span aria-hidden className="pointer-events-none absolute bottom-0 left-1/2 h-[2px] w-0 -translate-x-1/2 bg-[#0095FF] transition-[width] duration-300 group-hover:w-1/2" />
                            </div>
                        ))}
                    </div>
                </div>
            </Container>
        </section>
    );
}

function Workloads() {
    return (
        <section className="relative overflow-hidden bg-[#E6E4DC] py-20 text-[#1A1814] sm:py-24 lg:py-28">
            <PaperGrain opacity={0.07} />

            <Container className="relative z-10">
                <div className="mx-auto max-w-[760px] text-center">
                    <p className={`${MONO} mb-5 inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-black/55`}>
                        <span className="h-1.5 w-1.5 rounded-full bg-[#0095FF]" />
                        Workloads
                    </p>
                    <h2 className="text-3xl font-semibold leading-[1.05] tracking-[-0.02em] text-[#1A1814] sm:text-4xl lg:text-[48px]">
                        What teams{" "}
                        <span style={ACCENT_FONT} className="text-[#0066B3]">
                            actually run on the cluster.
                        </span>
                    </h2>
                </div>

                <div className="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-[8px] border border-black/[0.10] bg-black/[0.10] sm:grid-cols-2 lg:grid-cols-3">
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

export function KubernetesSolutionLanding() {
    return (
        <main className="bg-[#0D0D0F]">
            <ServiceHeroSection
                badge="Kubernetes"
                title="A cluster you don't have to babysit."
                description="Managed control plane, auto-scaling pools, service mesh, GitOps — your team ships features, not etcd patches."
                primaryAction={{ label: "Talk to a solutions engineer", href: "/contact" }}
                secondaryAction={{ label: "Explore capabilities", href: "#stack" }}
                backgroundImage={{ src: assetUrl("/images/hero/service-hero-bg.png"), alt: "" }}
                illustration={{
                    src: assetUrl("/images/main-page/solution-home-kubernetes.png"),
                    alt: "Kubernetes cluster infrastructure",
                    priority: true,
                }}
            />
            <HeroStats metrics={HERO_STATS} eyebrow="Cluster" />
            <RequestFlow />
            <Scenarios />
            <Stack />
            <Workloads />
            <ServicesHomeSectionFive title="Frequently asked questions" faqs={FAQS} />
        </main>
    );
}
