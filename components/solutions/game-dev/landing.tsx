"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Container } from "@/components/ui/container";
import { ServiceHeroSection } from "@/components/services/service-hero-section";
import ServicesHomeSectionFive from "@/components/serviceshome/section-5";
import { HeroStats } from "@/components/solutions/shared/hero-stats";
import { ACCENT_FONT, Aurora, Eclipse, PaperGrain } from "@/components/brand/atmosphere";

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

/* ──────────────────────────────────────────────────────────────
   Stack glyphs (32×32, layered + blue accent)
   ────────────────────────────────────────────────────────────── */

function GameServerIcon() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            <rect x="4" y="5" width="24" height="8" rx="1.5" fill="currentColor" fillOpacity="0.08" />
            <rect x="4" y="19" width="24" height="8" rx="1.5" fill="currentColor" fillOpacity="0.08" />
            <circle cx="7" cy="9" r="0.9" fill="#0095FF" />
            <circle cx="7" cy="23" r="0.9" fill="#0095FF" />
            <path d="M11 9h13M11 23h13" strokeOpacity="0.5" />
            <rect x="22" y="7" width="4.5" height="4" rx="0.4" fill="#0095FF" fillOpacity="0.30" stroke="#0095FF" />
            <rect x="22" y="21" width="4.5" height="4" rx="0.4" fill="currentColor" fillOpacity="0.45" />
        </svg>
    );
}

function MatchmakerIcon() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round">
            <circle cx="7" cy="7" r="2.4" fill="currentColor" fillOpacity="0.18" />
            <circle cx="25" cy="7" r="2.4" fill="currentColor" fillOpacity="0.18" />
            <circle cx="7" cy="25" r="2.4" fill="currentColor" fillOpacity="0.18" />
            <circle cx="25" cy="25" r="2.4" fill="currentColor" fillOpacity="0.18" />
            <circle cx="16" cy="16" r="3.2" fill="#0095FF" fillOpacity="0.30" stroke="#0095FF" />
            <path d="M9 8.5l5 5M23 8.5l-5 5M9 23.5l5-5M23 23.5l-5-5" strokeOpacity="0.55" />
        </svg>
    );
}

function StateCacheIcon() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            <rect x="5" y="6" width="22" height="20" rx="2" fill="currentColor" fillOpacity="0.08" />
            <path d="M5 11h22" />
            <circle cx="8" cy="8.5" r="0.6" fill="currentColor" />
            <circle cx="10" cy="8.5" r="0.6" fill="currentColor" />
            <path d="M9 16l3 3 5-5" stroke="#0095FF" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
            <path d="M9 22h14" strokeOpacity="0.45" />
            <circle cx="22" cy="16" r="1.2" fill="#0095FF" />
        </svg>
    );
}

function GpuAiIcon() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3} strokeLinejoin="round">
            <rect x="8" y="8" width="16" height="16" rx="2.5" />
            <rect x="12.5" y="12.5" width="7" height="7" rx="1" fill="#0095FF" fillOpacity="0.30" stroke="#0095FF" />
            <path
                d="M12 8V5.5M16 8V5.5M20 8V5.5M12 24v2.5M16 24v2.5M20 24v2.5M8 12H5.5M8 16H5.5M8 20H5.5M24 12h2.5M24 16h2.5M24 20h2.5"
                strokeWidth={1.1}
                strokeLinecap="round"
            />
        </svg>
    );
}
function AssetBucketIcon() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3} strokeLinejoin="round">
            <path d="M5 9h22l-2 18a1.3 1.3 0 0 1-1.3 1.2H8.3A1.3 1.3 0 0 1 7 27L5 9z" fill="currentColor" fillOpacity="0.08" />
            <path d="M5 9h22" />
            <path d="M11 9V6.5a5 5 0 0 1 10 0V9" />
            <rect x="11" y="14" width="3" height="3" rx="0.3" fill="#0095FF" fillOpacity="0.30" stroke="#0095FF" />
            <rect x="15" y="14" width="3" height="3" rx="0.3" fill="currentColor" fillOpacity="0.3" />
            <rect x="19" y="14" width="3" height="3" rx="0.3" fill="currentColor" fillOpacity="0.3" />
            <rect x="13" y="20" width="3" height="3" rx="0.3" fill="currentColor" fillOpacity="0.3" />
            <rect x="17" y="20" width="3" height="3" rx="0.3" fill="currentColor" fillOpacity="0.3" />
        </svg>
    );
}

function EdgeIcon() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            <circle cx="16" cy="16" r="11" strokeOpacity="0.30" />
            <circle cx="16" cy="16" r="7" strokeOpacity="0.55" />
            <circle cx="16" cy="16" r="3.4" fill="#0095FF" fillOpacity="0.30" stroke="#0095FF" />
            <circle cx="16" cy="5" r="1.3" fill="currentColor" />
            <circle cx="16" cy="27" r="1.3" fill="currentColor" />
            <circle cx="5" cy="16" r="1.3" fill="currentColor" />
            <circle cx="27" cy="16" r="1.3" fill="currentColor" />
            <circle cx="8" cy="8" r="1" fill="currentColor" fillOpacity="0.6" />
            <circle cx="24" cy="24" r="1" fill="currentColor" fillOpacity="0.6" />
            <circle cx="8" cy="24" r="1" fill="currentColor" fillOpacity="0.6" />
            <circle cx="24" cy="8" r="1" fill="currentColor" fillOpacity="0.6" />
        </svg>
    );
}

function DDoSIcon() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3} strokeLinejoin="round">
            <path d="M16 3l11 4v8c0 6.5-4.5 11.5-11 13.5C9.5 26.5 5 21.5 5 15V7l11-4z" fill="currentColor" fillOpacity="0.10" />
            <path d="M9 12l4 1 1-4M23 20l-4-1-1 4M9 20l1 4 4-1M23 12l-1-4-4 1" strokeOpacity="0.55" strokeLinecap="round" />
            <circle cx="16" cy="16" r="3.5" fill="#0095FF" fillOpacity="0.30" stroke="#0095FF" />
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

/* ──────── Workload glyphs (cream section) ──────── */

function ShooterGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="16" cy="16" r="11" strokeOpacity="0.4" />
            <circle cx="16" cy="16" r="6" strokeOpacity="0.55" />
            <circle cx="16" cy="16" r="2" fill="#0095FF" />
            <path d="M16 3v6M16 23v6M3 16h6M23 16h6" />
        </svg>
    );
}

function MmoGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            <circle cx="16" cy="16" r="11" fill="currentColor" fillOpacity="0.08" />
            <path d="M5 16h22" strokeOpacity="0.55" />
            <path d="M16 5c3 3.5 4.5 7 4.5 11s-1.5 7.5-4.5 11c-3-3.5-4.5-7-4.5-11s1.5-7.5 4.5-11z" strokeOpacity="0.55" />
            <circle cx="10" cy="12" r="1.4" fill="#0095FF" />
            <circle cx="22" cy="20" r="1.4" fill="#0095FF" />
            <circle cx="20" cy="10" r="1.1" fill="currentColor" />
            <circle cx="12" cy="22" r="1.1" fill="currentColor" />
        </svg>
    );
}

function MobileGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            <rect x="9" y="3" width="14" height="26" rx="2.2" fill="currentColor" fillOpacity="0.08" />
            <path d="M9 8h14M9 25h14" />
            <rect x="11" y="11" width="10" height="11" rx="0.6" fill="#0095FF" fillOpacity="0.20" stroke="#0095FF" />
            <circle cx="16" cy="27" r="0.7" fill="currentColor" />
        </svg>
    );
}

function BattleRoyaleGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            <circle cx="16" cy="16" r="12" strokeOpacity="0.4" />
            <circle cx="16" cy="16" r="8" strokeOpacity="0.55" />
            <circle cx="16" cy="16" r="4" fill="#0095FF" fillOpacity="0.25" stroke="#0095FF" />
            <circle cx="7" cy="7" r="1.2" fill="currentColor" />
            <circle cx="25" cy="7" r="1.2" fill="currentColor" />
            <circle cx="7" cy="25" r="1.2" fill="currentColor" />
            <circle cx="25" cy="25" r="1.2" fill="currentColor" />
            <circle cx="13" cy="14" r="0.9" fill="currentColor" />
            <circle cx="19" cy="18" r="0.9" fill="currentColor" />
        </svg>
    );
}

function RacingGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3} strokeLinejoin="round" strokeLinecap="round">
            <path d="M4 19l4-6h16l4 6v4H4v-4z" fill="currentColor" fillOpacity="0.08" />
            <path d="M8 19h16" />
            <circle cx="9" cy="23" r="2" fill="#0095FF" fillOpacity="0.30" stroke="#0095FF" />
            <circle cx="23" cy="23" r="2" fill="#0095FF" fillOpacity="0.30" stroke="#0095FF" />
            <path d="M11 16l2-2M19 14l2 2" strokeOpacity="0.6" />
        </svg>
    );
}

function TurnBasedGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round">
            <rect x="4" y="6" width="11" height="14" rx="1.3" fill="currentColor" fillOpacity="0.12" />
            <rect x="17" y="12" width="11" height="14" rx="1.3" fill="#0095FF" fillOpacity="0.20" stroke="#0095FF" />
            <path d="M7 11h5M7 14h4M20 17h5M20 20h4" strokeOpacity="0.55" />
            <path d="M16 13l2-2-2-2M16 19l-2 2 2 2" strokeOpacity="0.5" />
        </svg>
    );
}

/* ──────── Request-flow node icons ──────── */

function NodePlayer() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4}>
            <rect x="5" y="11" width="22" height="11" rx="3" fill="currentColor" fillOpacity="0.10" />
            <circle cx="11" cy="16.5" r="2" fill="currentColor" fillOpacity="0.4" />
            <circle cx="21" cy="16.5" r="2" fill="currentColor" fillOpacity="0.4" />
            <path d="M8 16.5h3M19 14.5v4M21 16.5h2" strokeLinecap="round" />
        </svg>
    );
}
function NodeEdge() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4}>
            <circle cx="16" cy="16" r="10" />
            <path d="M16 6c3.4 3.5 5 6.5 5 10s-1.6 6.5-5 10c-3.4-3.5-5-6.5-5-10s1.6-6.5 5-10z" />
            <path d="M6 16h20" />
        </svg>
    );
}
function NodeDdos() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round">
            <path d="M16 5l9 3v7c0 5.5-3.8 9.5-9 11.5C10.8 24.5 7 20.5 7 15V8l9-3z" />
            <path d="M11.5 15.5l3 3 5.5-5.5" strokeLinecap="round" />
        </svg>
    );
}
function NodeMatch() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round">
            <circle cx="8" cy="9" r="2.5" />
            <circle cx="24" cy="9" r="2.5" />
            <circle cx="8" cy="23" r="2.5" />
            <circle cx="24" cy="23" r="2.5" />
            <circle cx="16" cy="16" r="3.5" />
            <path d="M10 11l4 3M22 11l-4 3M10 21l4-3M22 21l-4-3" strokeOpacity="0.55" />
        </svg>
    );
}
function NodeGameServer() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4}>
            <rect x="5" y="6" width="22" height="9" rx="1.5" />
            <rect x="5" y="17" width="22" height="9" rx="1.5" />
            <circle cx="8" cy="10.5" r="0.7" fill="currentColor" />
            <circle cx="8" cy="21.5" r="0.7" fill="currentColor" />
            <path d="M12 10.5h12M12 21.5h12" strokeOpacity="0.5" />
        </svg>
    );
}
function NodeState() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4}>
            <ellipse cx="16" cy="8" rx="9" ry="3" />
            <path d="M7 8v8c0 1.6 4 3 9 3s9-1.4 9-3V8" />
            <path d="M7 16v8c0 1.6 4 3 9 3s9-1.4 9-3v-8" />
        </svg>
    );
}
function NodeAssets() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round">
            <path d="M5 10h22l-1.7 16a1.2 1.2 0 0 1-1.2 1.1H7.9A1.2 1.2 0 0 1 6.7 26L5 10z" />
            <path d="M11 10V7.5a5 5 0 0 1 10 0V10" />
        </svg>
    );
}

/* ──────────────────────────────────────────────────────────────
   Data
   ────────────────────────────────────────────────────────────── */

const HERO_STATS = [
    { value: "<10ms", label: "Tick latency" },
    { value: "200k+", label: "CCU tested" },
    { value: "12", label: "Regions" },
    { value: "L3–L7", label: "DDoS shield" },
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
        name: "Indie launch",
        persona: "Solo devs, small studios",
        description: "Ship the demo, host a regional fleet, distribute the build over CDN.",
        monthly: "$20",
        suffix: "/mo",
        services: [
            { glyph: <GameServerIcon />, label: "Game server" },
            { glyph: <AssetBucketIcon />, label: "Asset bucket" },
            { glyph: <EdgeIcon />, label: "CDN" },
        ],
        specs: [
            { label: "Compute", value: "1 × high-freq 4 vCPU" },
            { label: "Assets", value: "250 GB object + CDN" },
            { label: "Region", value: "Single, low-latency" },
        ],
        cta: { label: "Start the build", href: "/services/compute" },
    },
    {
        name: "Competitive multiplayer at 10k CCU",
        persona: "PvP shooters, MOBAs",
        description: "Server fleet across 3 regions, matchmaker, Redis state, DDoS-protected endpoints.",
        monthly: "$280",
        suffix: "–$520/mo",
        services: [
            { glyph: <GameServerIcon />, label: "Server fleet" },
            { glyph: <MatchmakerIcon />, label: "Matchmaker" },
            { glyph: <StateCacheIcon />, label: "Redis state" },
            { glyph: <DDoSIcon />, label: "DDoS shield" },
            { glyph: <AssetBucketIcon />, label: "Asset bucket" },
            { glyph: <EdgeIcon />, label: "CDN" },
        ],
        specs: [
            { label: "Compute", value: "12 × high-freq 8 vCPU" },
            { label: "State", value: "Redis HA · session-scoped" },
            { label: "Regions", value: "3 (NA · EU · APAC)" },
        ],
        cta: { label: "Recommended", href: "/services/kubernetes" },
        featured: true,
    },
    {
        name: "Persistent world / MMO at 100k CCU",
        persona: "MMORPGs, sim worlds",
        description: "Sharded game world, HA Postgres for persistence, multi-region failover.",
        monthly: "$1,500",
        suffix: "–$3,200/mo",
        services: [
            { glyph: <GameServerIcon />, label: "Sharded fleet" },
            { glyph: <K8sIcon />, label: "Kubernetes" },
            { glyph: <StateCacheIcon />, label: "Postgres HA" },
            { glyph: <AssetBucketIcon />, label: "Patch storage" },
            { glyph: <EdgeIcon />, label: "Edge cache" },
            { glyph: <DDoSIcon />, label: "L7 shield" },
        ],
        specs: [
            { label: "Compute", value: "40+ shards · auto-scale" },
            { label: "Database", value: "HA Postgres · PITR" },
            { label: "Patching", value: "Multi-region object store" },
        ],
        cta: { label: "Compose stack", href: "/contact" },
    },
    {
        name: "AAA launch & studios",
        persona: "Publishers, AAA titles",
        description: "Dedicated capacity, contractual SLAs, full multi-region orchestration.",
        monthly: "Custom",
        services: [
            { glyph: <GameServerIcon />, label: "Dedicated" },
            { glyph: <K8sIcon />, label: "Multi-region K8s" },
            { glyph: <StateCacheIcon />, label: "Sharded DB" },
            { glyph: <AssetBucketIcon />, label: "Global patches" },
            { glyph: <DDoSIcon />, label: "DDoS Pro" },
            { glyph: <MatchmakerIcon />, label: "Matchmaker" },
        ],
        specs: [
            { label: "Compute", value: "Dedicated hardware · 6+ regions" },
            { label: "Capacity", value: "Reserved · burst headroom" },
            { label: "Compliance", value: "SLAs, audit logs, SSO" },
        ],
        cta: { label: "Talk to sales", href: "/contact" },
    },
];

type FlowNode = { icon: React.ReactNode; label: string; sub: string };

const FLOW: FlowNode[] = [
    { icon: <NodePlayer />, label: "Player", sub: "Console · PC · Mobile" },
    { icon: <NodeEdge />, label: "Edge POP", sub: "Closest hop" },
    { icon: <NodeDdos />, label: "DDoS shield", sub: "L3–L7 scrub" },
    { icon: <NodeMatch />, label: "Matchmaker", sub: "Lobby · skill" },
    { icon: <NodeGameServer />, label: "Game server", sub: "Tick loop" },
    { icon: <NodeState />, label: "Session state", sub: "Redis · DB" },
    { icon: <NodeAssets />, label: "Asset CDN", sub: "Builds · patches" },
];

type StackPiece = {
    icon: React.ReactNode;
    title: string;
    description: string;
    role: string;
    capabilities: string[];
};

const STACK: StackPiece[] = [
    {
        icon: <GameServerIcon />,
        title: "Dedicated game servers",
        description: "High-frequency CPUs (5+ GHz turbo), pinned cores, low-jitter NICs — sized for sub-10 ms tick rates and authoritative simulation.",
        role: "Runtime",
        capabilities: ["5+ GHz turbo", "Pinned cores", "Low-jitter NIC", "Sub-10 ms"],
    },
    {
        icon: <K8sIcon />,
        title: "Kubernetes orchestration",
        description: "Run server pods as fleets, auto-scale node pools on CCU, rolling updates without dropping matches. Game-server-aware lifecycle.",
        role: "Orchestration",
        capabilities: ["Fleet pods", "Auto-scale by CCU", "Rolling deploys", "Lifecycle hooks"],
    },
    {
        icon: <MatchmakerIcon />,
        title: "Matchmaker & lobby services",
        description: "Stateless matchmaking workers, regional queues, skill / latency / party-aware bucketing — wired into Redis for session pinning.",
        role: "Sessions",
        capabilities: ["Skill bucketing", "Regional queues", "Party-aware", "Redis-pinned"],
    },
    {
        icon: <StateCacheIcon />,
        title: "Player data & state cache",
        description: "Managed Postgres for profiles, inventory, leaderboards. Redis HA for room state, presence, and rate limits — same private VPC.",
        role: "Data plane",
        capabilities: ["Postgres HA", "Redis HA", "Read replicas", "PITR backup"],
    },
    {
        icon: <AssetBucketIcon />,
        title: "Asset & patch storage",
        description: "S3-compatible buckets for builds, textures, audio, and delta patches. Versioned, lifecycle-managed, signed URLs for download.",
        role: "Storage",
        capabilities: ["Versioned", "Signed URLs", "Lifecycle rules", "Delta patches"],
    },
    {
        icon: <EdgeIcon />,
        title: "Global CDN & DDoS shield",
        description: "150+ POPs deliver patches and assets. L3–L7 absorption scrubs volumetric and protocol attacks before they reach game servers.",
        role: "Delivery",
        capabilities: ["150+ POPs", "L3–L7 scrub", "Brotli · HTTP/3", "Image optimization"],
    },
    {
        icon: <GpuAiIcon />,
        title: "GPU & AI inference",
        description: "Serverless GPU and an OpenAI-compatible inference gateway power in-game AI — NPC behaviour, matchmaking ranking, anti-cheat ML, voice and chat moderation, and generative content. Fine-tune open-weight models on your own telemetry, in the same private network.",
        role: "Intelligence",
        capabilities: ["Serverless GPU", "Inference API", "Fine-tuning", "Anti-cheat ML"],
    },
];

type Workload = { glyph: React.ReactNode; metric: string; title: string; description: string };

const WORKLOADS: Workload[] = [
    {
        glyph: <ShooterGlyph />,
        metric: "Competitive",
        title: "Real-time shooters and MOBAs",
        description: "Authoritative servers, 60–128 Hz tick, deterministic netcode, sub-10 ms simulation cost — across pinned cores on bare-metal-class hosts.",
    },
    {
        glyph: <MmoGlyph />,
        metric: "MMO",
        title: "Persistent worlds and MMOs",
        description: "Sharded world servers, persistence to HA Postgres, region-pinned characters, hot-spare failover for live shards on patch days.",
    },
    {
        glyph: <MobileGlyph />,
        metric: "Mobile",
        title: "Mobile and casual multiplayer",
        description: "Stateless room servers, fast cold-start, reconnect-friendly sessions. Lighter compute, deep regional spread, edge-friendly assets.",
    },
    {
        glyph: <BattleRoyaleGlyph />,
        metric: "Battle royale",
        title: "Battle royale and 100-player lobbies",
        description: "Burst-spawn fleets for events and launches. Pre-warmed pools, sub-second match start, fleet drain handled by lifecycle hooks.",
    },
    {
        glyph: <RacingGlyph />,
        metric: "Sim",
        title: "Racing and simulation",
        description: "Deterministic physics, lockstep netcode, dedicated CPU. Replay storage in object buckets, telemetry streamed for live spectators.",
    },
    {
        glyph: <TurnBasedGlyph />,
        metric: "Async",
        title: "Turn-based and async multiplayer",
        description: "Long-running matches stored in Postgres, push notifications via webhooks, free of stateful sticky sessions — autoscale cheaply.",
    },
];

const FAQS = [
    {
        question: "Do you offer dedicated bare-metal-class game servers?",
        answer:
            "Yes. High-frequency dedicated hosts with pinned cores, low-jitter NICs, and turbo boost held under sustained load. Quoted per region with monthly or term-based reserved pricing.",
    },
    {
        question: "How does DDoS protection work for game servers?",
        answer:
            "Volumetric and protocol attacks (L3/L4) are absorbed at the edge — game-server endpoints stay reachable through scrubbing. L7 rules and rate limits cover login flows, matchmaker APIs, and asset CDN.",
    },
    {
        question: "Can I run a custom game-server image?",
        answer:
            "Yes. Any OCI container runs on the platform. Common engines (Unreal, Unity, Godot, Source) ship with reference configs for headless builds, fleet lifecycle hooks, and graceful shutdown.",
    },
    {
        question: "How is matchmaking and session state handled?",
        answer:
            "Run matchmaking as stateless workers behind regional queues. Pin sessions to game servers via Redis HA. Persistence (profiles, inventory, leaderboards) lives in managed Postgres with read replicas.",
    },
    {
        question: "Do you support burst scaling for launches?",
        answer:
            "Yes. Pre-warm pools of game-server pods, scale fleets by CCU and queue depth, and reserve overflow capacity for launch weekends without paying for it the rest of the month.",
    },
    {
        question: "How do you ship patches and builds?",
        answer:
            "Builds and delta patches sit in versioned object buckets, served from 150+ CDN POPs. Signed URLs gate distribution. Background pre-warm on POPs avoids cold-cache spikes on patch day.",
    },
    {
        question: "Can I run AI or ML workloads for my game?",
        answer:
            "Yes. Serverless GPU plus an OpenAI-compatible inference gateway power in-game AI — NPC behaviour, matchmaking ranking, anti-cheat models, and voice/chat moderation — and generative content pipelines. Fine-tune open-weight models on your own player telemetry and call them from the same private network as your game servers.",
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
                        Tick lifecycle
                    </p>
                    <h2 className="text-3xl font-semibold leading-[1.05] tracking-[-0.02em] text-white sm:text-4xl lg:text-[52px]">
                        Input to authoritative tick,{" "}
                        <span style={ACCENT_FONT} className="text-[#82adfb]">
                            in milliseconds.
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
                        { v: "<10ms", l: "Server tick" },
                        { v: "60–128Hz", l: "Update rate" },
                        { v: "Zero", l: "Cold-start drops" },
                    ].map((m) => (
                        <div key={m.l} className="flex items-baseline justify-center gap-2 bg-[#0D0D0F] px-4 py-5">
                            <span className={`${MONO} text-[18px] font-bold tabular-nums text-white`}>{m.v}</span>
                            <span className={`${MONO} text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45`}>{m.l}</span>
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
                            Composed stacks
                        </p>
                        <h2 className="text-3xl font-semibold leading-[1.05] tracking-[-0.02em] text-[#1A1814] sm:text-4xl lg:text-[48px]">
                            One recommended stack.{" "}
                            <span style={ACCENT_FONT} className="text-[#0066B3]">
                                Three alternatives.
                            </span>
                        </h2>
                    </div>
                    <p className="max-w-[360px] text-[14.5px] leading-[1.65] text-black/60">
                        Real stack shapes — pick the one that matches your title.
                    </p>
                </div>

                {/* Featured horizontal hero */}
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
                                className={`${MONO} mt-6 inline-flex h-11 items-center gap-1.5 rounded-[5px] bg-white px-6 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#1A1814] transition-colors hover:bg-white/90`}
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

                {/* Three compact alternatives */}
                <div className="mx-auto mt-5 grid max-w-[1180px] grid-cols-1 gap-5 sm:grid-cols-3">
                    {others.map((s) => (
                        <article
                            key={s.name}
                            className="relative flex flex-col overflow-hidden rounded-[10px] border border-black/[0.10] bg-[#EEECE4] text-[#1A1814]"
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
                    Prices are indicative
                </p>
            </Container>
        </section>
    );
}

function Stack() {
    return (
        <section id="stack" className="relative overflow-hidden bg-[#0D0D0F] py-20 sm:py-24 lg:py-28">
            <div aria-hidden className="absolute top-0 left-1/2 h-px w-[60%] -translate-x-1/2 bg-gradient-to-r from-transparent via-white/10 to-transparent" />

            <Aurora intensity="soft" />

            <Container className="relative z-10">
                <div className="mx-auto flex max-w-[1080px] flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-[680px]">
                        <p className={`${MONO} mb-5 inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-white/50`}>
                            <span className="h-1.5 w-1.5 rounded-full bg-[#0095FF]" />
                            Platform layers
                        </p>
                        <h2 className="text-3xl font-semibold leading-[1.05] tracking-[-0.02em] text-white sm:text-4xl lg:text-[48px]">
                            Seven layers.{" "}
                            <span style={ACCENT_FONT} className="text-[#82adfb]">
                                One private network.
                            </span>
                        </h2>
                    </div>
                    <p className="max-w-[360px] text-[14.5px] leading-[1.65] text-white/55">
                        Game servers to edge — one VPC, no cross-vendor egress.
                    </p>
                </div>

                {/* Vertical numbered timeline */}
                <div className="relative mx-auto mt-14 max-w-[1080px]">
                    <div
                        aria-hidden
                        className="pointer-events-none absolute left-[27px] top-6 bottom-6 w-px bg-gradient-to-b from-white/0 via-white/[0.12] to-white/0 sm:left-[35px]"
                    />

                    <div className="flex flex-col">
                        {STACK.map((piece, i) => (
                            <div
                                key={piece.title}
                                className="group relative grid grid-cols-[56px_1fr] gap-5 py-7 sm:grid-cols-[72px_1fr] sm:gap-7 sm:py-8"
                            >
                                {i > 0 && (
                                    <div
                                        aria-hidden
                                        className="absolute left-[72px] right-0 top-0 h-px bg-white/[0.05] sm:left-[100px]"
                                    />
                                )}

                                <div className="flex flex-col items-center gap-2">
                                    <span className={`${MONO} text-[10.5px] tabular-nums text-white/30`}>
                                        {String(i + 1).padStart(2, "0")}
                                    </span>
                                    <div
                                        className="relative z-10 inline-flex h-[54px] w-[54px] items-center justify-center rounded-[10px] border border-white/[0.12] bg-[#0F1114] text-white/85 transition-colors group-hover:border-[#0095FF]/40 group-hover:bg-[#13161B] sm:h-[60px] sm:w-[60px]"
                                        style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05), 0 12px 28px -16px rgba(0,0,0,0.6)" }}
                                    >
                                        <div className="h-[28px] w-[28px] sm:h-[32px] sm:w-[32px]">{piece.icon}</div>
                                    </div>
                                </div>

                                <div className="flex min-w-0 flex-col gap-3 pt-1">
                                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                                        <h3 className="text-[19px] font-semibold tracking-[-0.01em] text-white sm:text-[21px]">
                                            {piece.title}
                                        </h3>
                                        <span
                                            className={`${MONO} inline-flex items-center gap-1.5 rounded-full border border-white/[0.10] bg-white/[0.03] px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-white/55`}
                                        >
                                            <span className="h-1 w-1 rounded-full bg-[#0095FF]" />
                                            {piece.role}
                                        </span>
                                    </div>
                                    <p className="max-w-[680px] text-[13.5px] leading-[1.6] text-white/60">
                                        {piece.description}
                                    </p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {piece.capabilities.map((c) => (
                                            <span
                                                key={c}
                                                className={`${MONO} inline-flex items-center rounded-[3px] border border-white/[0.10] bg-white/[0.03] px-2 py-0.5 text-[10px] uppercase tracking-[0.10em] text-white/70`}
                                            >
                                                {c}
                                            </span>
                                        ))}
                                    </div>
                                </div>
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
                        Sized for the titles studios{" "}
                        <span style={ACCENT_FONT} className="text-[#0066B3]">
                            actually ship.
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

export function GameDevLanding() {
    return (
        <main className="bg-[#0D0D0F]">
            <ServiceHeroSection
                badge="Game Hosting"
                title="Infrastructure for titles that stay online."
                description="Dedicated game servers, matchmaker, state cache, asset CDN, L3–L7 DDoS shield, and GPU for in-game AI — sized for sub-10 ms ticks."
                primaryAction={{ label: "Talk to a solutions engineer", href: "/contact" }}
                secondaryAction={{ label: "Explore capabilities", href: "#stack" }}
                backgroundImage={{ src: "/images/hero/service-hero-bg.png", alt: "" }}
                illustration={{
                    src: "/images/main-page/solution-home-game-dev.svg",
                    alt: "Game hosting infrastructure",
                    priority: true,
                }}
            />
            <HeroStats metrics={HERO_STATS} eyebrow="Live-ops" />
            <RequestFlow />
            <Scenarios />
            <Stack />
            <Workloads />
            <ServicesHomeSectionFive title="Frequently asked questions" faqs={FAQS} />
        </main>
    );
}
