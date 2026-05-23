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

function PostgresIcon() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            <ellipse cx="16" cy="6" rx="10" ry="3" fill="currentColor" fillOpacity="0.10" />
            <path d="M6 6v8c0 1.7 4.5 3 10 3s10-1.3 10-3V6" />
            <path d="M6 14v8c0 1.7 4.5 3 10 3s10-1.3 10-3v-8" />
            <circle cx="22" cy="11" r="1" fill="#0095FF" />
            <circle cx="22" cy="19" r="1" fill="#0095FF" />
            <path d="M8 11h2M8 19h2" strokeOpacity="0.5" strokeLinecap="round" />
        </svg>
    );
}

function ReplicaIcon() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            <ellipse cx="9" cy="8" rx="5" ry="2" fill="#0095FF" fillOpacity="0.20" stroke="#0095FF" />
            <path d="M4 8v6c0 1 2.2 1.8 5 1.8s5-0.8 5-1.8V8" stroke="#0095FF" />
            <path d="M4 14v6c0 1 2.2 1.8 5 1.8s5-0.8 5-1.8v-6" stroke="#0095FF" />
            <ellipse cx="23" cy="8" rx="5" ry="2" fill="currentColor" fillOpacity="0.10" />
            <path d="M18 8v6c0 1 2.2 1.8 5 1.8s5-0.8 5-1.8V8" />
            <path d="M18 14v6c0 1 2.2 1.8 5 1.8s5-0.8 5-1.8v-6" />
            <path d="M14 14h4" strokeOpacity="0.6" strokeDasharray="1.5 1.5" />
            <path d="M14 20h4" strokeOpacity="0.6" strokeDasharray="1.5 1.5" />
        </svg>
    );
}

function BackupIcon() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            <circle cx="16" cy="16" r="11" fill="currentColor" fillOpacity="0.08" />
            <path d="M16 9v7l5 3" strokeLinecap="round" />
            <path d="M9 6l1 5 5-1" strokeLinecap="round" strokeLinejoin="round" stroke="#0095FF" />
            <path d="M9 6a11 11 0 0 1 18 4" strokeOpacity="0.55" strokeLinecap="round" />
        </svg>
    );
}

function CacheIcon() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            <rect x="4" y="6" width="24" height="6" rx="1.5" fill="currentColor" fillOpacity="0.10" />
            <rect x="4" y="14" width="24" height="6" rx="1.5" fill="#0095FF" fillOpacity="0.18" stroke="#0095FF" />
            <rect x="4" y="22" width="24" height="6" rx="1.5" fill="currentColor" fillOpacity="0.10" />
            <circle cx="7" cy="9" r="0.7" fill="currentColor" />
            <circle cx="7" cy="17" r="0.7" fill="#0095FF" />
            <circle cx="7" cy="25" r="0.7" fill="currentColor" />
            <path d="M11 9h13M11 17h13M11 25h13" strokeOpacity="0.4" />
        </svg>
    );
}

function VectorIcon() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            <circle cx="16" cy="16" r="11" strokeOpacity="0.4" />
            <circle cx="8" cy="11" r="1.3" fill="currentColor" />
            <circle cx="13" cy="8" r="1.3" fill="currentColor" />
            <circle cx="20" cy="10" r="1.3" fill="currentColor" />
            <circle cx="24" cy="14" r="1.3" fill="#0095FF" />
            <circle cx="22" cy="20" r="1.3" fill="currentColor" />
            <circle cx="16" cy="22" r="1.3" fill="currentColor" />
            <circle cx="10" cy="20" r="1.3" fill="currentColor" />
            <circle cx="16" cy="16" r="2" fill="#0095FF" fillOpacity="0.30" stroke="#0095FF" />
            <path d="M16 16l-3-8M16 16l8-2M16 16l-8 4M16 16l6 4" strokeOpacity="0.4" />
        </svg>
    );
}

function ObservabilityIcon() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="6" width="24" height="20" rx="1.5" fill="currentColor" fillOpacity="0.08" />
            <path d="M4 21l5-6 4 3 5-9 4 5 6-3" />
            <circle cx="9" cy="15" r="1.3" fill="currentColor" />
            <circle cx="13" cy="18" r="1.3" fill="currentColor" />
            <circle cx="18" cy="9" r="1.3" fill="#0095FF" />
            <circle cx="22" cy="14" r="1.3" fill="currentColor" />
            <circle cx="28" cy="11" r="1.3" fill="#0095FF" />
        </svg>
    );
}

function VpcIcon() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3} strokeLinejoin="round">
            <path d="M16 3l11 4v8c0 6.5-4.5 11.5-11 13.5C9.5 26.5 5 21.5 5 15V7l11-4z" fill="currentColor" fillOpacity="0.08" />
            <rect x="11" y="13" width="10" height="7" rx="0.8" fill="#0095FF" fillOpacity="0.20" stroke="#0095FF" />
            <path d="M13 16.5h6M13 18h4" strokeOpacity="0.55" />
        </svg>
    );
}

/* ──────── Workload glyphs (cream section) ──────── */

function OltpGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            <rect x="4" y="6" width="24" height="20" rx="1.5" fill="currentColor" fillOpacity="0.08" />
            <path d="M4 11h24" />
            <rect x="7" y="14" width="5" height="3" rx="0.4" fill="#0095FF" fillOpacity="0.30" stroke="#0095FF" />
            <rect x="13" y="14" width="6" height="3" rx="0.4" fill="currentColor" fillOpacity="0.25" />
            <rect x="20" y="14" width="5" height="3" rx="0.4" fill="currentColor" fillOpacity="0.25" />
            <rect x="7" y="19" width="5" height="3" rx="0.4" fill="currentColor" fillOpacity="0.25" />
            <rect x="13" y="19" width="6" height="3" rx="0.4" fill="#0095FF" fillOpacity="0.30" stroke="#0095FF" />
            <rect x="20" y="19" width="5" height="3" rx="0.4" fill="currentColor" fillOpacity="0.25" />
        </svg>
    );
}

function AnalyticsGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round">
            <path d="M3 28h26" strokeOpacity="0.3" />
            <rect x="5" y="18" width="3" height="10" rx="0.5" fill="currentColor" fillOpacity="0.25" />
            <rect x="10" y="13" width="3" height="15" rx="0.5" fill="currentColor" fillOpacity="0.45" />
            <rect x="15" y="20" width="3" height="8" rx="0.5" fill="currentColor" fillOpacity="0.30" />
            <rect x="20" y="9" width="3" height="19" rx="0.5" fill="#0095FF" fillOpacity="0.50" stroke="#0095FF" />
            <rect x="25" y="15" width="3" height="13" rx="0.5" fill="currentColor" fillOpacity="0.35" />
        </svg>
    );
}

function TimeseriesGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 22l4-4 3 3 4-8 4 5 4-2 4 4 3-3" />
            <circle cx="7" cy="18" r="1.1" fill="currentColor" />
            <circle cx="14" cy="13" r="1.1" fill="#0095FF" />
            <circle cx="22" cy="16" r="1.1" fill="currentColor" />
            <path d="M3 28h26" strokeOpacity="0.3" />
        </svg>
    );
}

function VectorWorkloadGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            <circle cx="16" cy="16" r="11" strokeOpacity="0.40" />
            <circle cx="7" cy="13" r="1.4" fill="currentColor" />
            <circle cx="13" cy="6" r="1.4" fill="currentColor" />
            <circle cx="22" cy="9" r="1.4" fill="currentColor" />
            <circle cx="25" cy="17" r="1.4" fill="currentColor" />
            <circle cx="21" cy="24" r="1.4" fill="currentColor" />
            <circle cx="11" cy="22" r="1.4" fill="currentColor" />
            <circle cx="16" cy="16" r="2.5" fill="#0095FF" fillOpacity="0.30" stroke="#0095FF" />
            <path d="M16 16l-3-7M16 16l8-1M16 16l-5 6M16 16l6 6" strokeOpacity="0.3" />
        </svg>
    );
}

function CacheWorkloadGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            <path d="M4 10l5-3 5 3v6l-5 3-5-3v-6z" fill="#0095FF" fillOpacity="0.20" stroke="#0095FF" strokeLinejoin="round" />
            <path d="M18 19l5-3 5 3v6l-5 3-5-3v-6z" fill="currentColor" fillOpacity="0.18" strokeLinejoin="round" />
            <path d="M14 13h4" strokeOpacity="0.55" />
        </svg>
    );
}

function MultiRegionGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            <ellipse cx="9" cy="10" rx="5" ry="2" fill="currentColor" fillOpacity="0.10" />
            <path d="M4 10v6c0 1.1 2.2 2 5 2s5-0.9 5-2v-6" />
            <ellipse cx="23" cy="10" rx="5" ry="2" fill="#0095FF" fillOpacity="0.20" stroke="#0095FF" />
            <path d="M18 10v6c0 1.1 2.2 2 5 2s5-0.9 5-2v-6" stroke="#0095FF" />
            <path d="M14 13c0 5 2 8 4 8M18 13c0-5-2-8-4-8" strokeOpacity="0.5" strokeDasharray="1.5 1.5" />
            <path d="M5 24h22" strokeOpacity="0.3" />
        </svg>
    );
}

/* ──────── Request-flow node icons ──────── */

function NodeApp() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4}>
            <rect x="5" y="6" width="22" height="14" rx="1.5" />
            <path d="M5 10h22" />
            <circle cx="8" cy="8" r="0.6" fill="currentColor" />
            <circle cx="10" cy="8" r="0.6" fill="currentColor" />
            <path d="M9 24h14" strokeLinecap="round" />
            <path d="M16 20v4" />
        </svg>
    );
}
function NodePool() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4}>
            <rect x="5" y="11" width="22" height="10" rx="2" />
            <circle cx="10" cy="16" r="1.4" fill="currentColor" />
            <circle cx="16" cy="16" r="1.4" fill="currentColor" />
            <circle cx="22" cy="16" r="1.4" fill="currentColor" />
            <path d="M5 16h-2M27 16h2" strokeLinecap="round" />
        </svg>
    );
}
function NodePrimary() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4}>
            <ellipse cx="16" cy="8" rx="9" ry="3" />
            <path d="M7 8v8c0 1.6 4 3 9 3s9-1.4 9-3V8" />
            <path d="M7 16v8c0 1.6 4 3 9 3s9-1.4 9-3v-8" />
        </svg>
    );
}
function NodeReadReplica() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4}>
            <ellipse cx="11" cy="10" rx="6" ry="2.4" />
            <path d="M5 10v10c0 1.3 2.7 2.4 6 2.4s6-1.1 6-2.4V10" />
            <ellipse cx="24" cy="14" rx="4" ry="1.8" strokeOpacity="0.55" />
            <path d="M20 14v6c0 1 1.8 1.8 4 1.8s4-0.8 4-1.8v-6" strokeOpacity="0.55" />
        </svg>
    );
}
function NodeCache() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4}>
            <rect x="5" y="9" width="22" height="5" rx="1" />
            <rect x="5" y="18" width="22" height="5" rx="1" />
            <circle cx="8" cy="11.5" r="0.6" fill="currentColor" />
            <circle cx="8" cy="20.5" r="0.6" fill="currentColor" />
            <path d="M11 11.5h13M11 20.5h13" strokeOpacity="0.5" />
        </svg>
    );
}
function NodeSnapshot() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round">
            <circle cx="16" cy="16" r="10" />
            <path d="M16 9v7l5 3" />
            <path d="M9 7l1 4 4-1" strokeLinejoin="round" />
        </svg>
    );
}
function NodeAudit() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4}>
            <rect x="6" y="5" width="20" height="22" rx="1.5" />
            <path d="M10 11h12M10 15h12M10 19h8" strokeOpacity="0.55" strokeLinecap="round" />
            <path d="M10 23l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

/* ──────────────────────────────────────────────────────────────
   Data
   ────────────────────────────────────────────────────────────── */

const HERO_STATS = [
    { value: "99.99%", label: "HA SLA" },
    { value: "<1s", label: "RPO replication" },
    { value: "35d", label: "PITR window" },
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
        name: "Single-node app database",
        persona: "Side projects, MVPs",
        description: "Managed Postgres or MySQL with daily backups. No HA, no replicas — just a real database, no babysitting.",
        monthly: "$15",
        suffix: "/mo",
        services: [
            { glyph: <PostgresIcon />, label: "Postgres or MySQL" },
            { glyph: <BackupIcon />, label: "Daily backups" },
            { glyph: <VpcIcon />, label: "Private network" },
        ],
        specs: [
            { label: "Capacity", value: "1 vCPU · 2 GB · 25 GB SSD" },
            { label: "Recovery", value: "Daily snapshot · 7-day retention" },
            { label: "Connections", value: "25 · single-AZ" },
        ],
        cta: { label: "Start small", href: "/services/database" },
    },
    {
        name: "Production app at 50k DAU",
        persona: "Live SaaS, real users",
        description: "HA primary with synchronous standby, read replica for analytics, Redis for sessions, PITR.",
        monthly: "$240",
        suffix: "–$480/mo",
        services: [
            { glyph: <PostgresIcon />, label: "Postgres HA" },
            { glyph: <ReplicaIcon />, label: "Read replica" },
            { glyph: <CacheIcon />, label: "Redis HA" },
            { glyph: <BackupIcon />, label: "PITR backups" },
            { glyph: <ObservabilityIcon />, label: "Query insights" },
        ],
        specs: [
            { label: "Primary", value: "4 vCPU · 16 GB · 200 GB NVMe" },
            { label: "Replicas", value: "1 read · 1 standby · sub-sec lag" },
            { label: "Recovery", value: "PITR · 35-day window" },
        ],
        cta: { label: "Recommended", href: "/services/database" },
        featured: true,
    },
    {
        name: "Analytics & data warehouse",
        persona: "BI, dashboards, exports",
        description: "Performance-tier Postgres with columnar extensions, large NVMe, replicas for parallel reads.",
        monthly: "$1,200",
        suffix: "–$2,400/mo",
        services: [
            { glyph: <PostgresIcon />, label: "Postgres Pro" },
            { glyph: <ReplicaIcon />, label: "4× read replicas" },
            { glyph: <BackupIcon />, label: "PITR + exports" },
            { glyph: <ObservabilityIcon />, label: "Slow-query logs" },
            { glyph: <VpcIcon />, label: "Private network" },
        ],
        specs: [
            { label: "Primary", value: "32 vCPU · 256 GB · 4 TB NVMe" },
            { label: "Replicas", value: "4 read · BI-tuned" },
            { label: "Exports", value: "Object storage · scheduled" },
        ],
        cta: { label: "Compose stack", href: "/contact" },
    },
    {
        name: "Multi-region enterprise",
        persona: "Compliance, global SLAs",
        description: "Cross-region replication, audit logs, SSO, dedicated capacity, contractual SLAs.",
        monthly: "Custom",
        services: [
            { glyph: <PostgresIcon />, label: "Sharded primary" },
            { glyph: <ReplicaIcon />, label: "Cross-region replicas" },
            { glyph: <CacheIcon />, label: "Distributed cache" },
            { glyph: <BackupIcon />, label: "Off-region PITR" },
            { glyph: <VpcIcon />, label: "Private peering" },
            { glyph: <ObservabilityIcon />, label: "Audit + SSO" },
        ],
        specs: [
            { label: "Topology", value: "Multi-region · sharded · DR-ready" },
            { label: "Compliance", value: "SOC 2 · audit · RBAC" },
            { label: "Support", value: "Dedicated SRE · 24×7" },
        ],
        cta: { label: "Talk to sales", href: "/contact" },
    },
];

type FlowNode = { icon: React.ReactNode; label: string; sub: string };

const FLOW: FlowNode[] = [
    { icon: <NodeApp />, label: "App request", sub: "API · worker · UI" },
    { icon: <NodePool />, label: "Connection pool", sub: "PgBouncer" },
    { icon: <NodePrimary />, label: "Primary", sub: "Writes · single source" },
    { icon: <NodeReadReplica />, label: "Read replicas", sub: "Scale reads" },
    { icon: <NodeCache />, label: "Cache layer", sub: "Redis · sub-ms" },
    { icon: <NodeSnapshot />, label: "PITR + snapshots", sub: "35-day window" },
    { icon: <NodeAudit />, label: "Audit & insights", sub: "Slow query · access" },
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
        icon: <PostgresIcon />,
        title: "Managed Postgres & MySQL",
        description: "Fully managed engines with automatic patching, version upgrades, connection pooling, and health probes. Bring your schema — we run the database.",
        role: "Engine",
        capabilities: ["Postgres 14–17", "MySQL · MariaDB", "Auto patching", "Pooled connections"],
    },
    {
        icon: <ReplicaIcon />,
        title: "Read replicas & HA standby",
        description: "Synchronous HA pair for writes, async read replicas for scale and analytics. Failover is automatic, sub-second, and observable.",
        role: "Topology",
        capabilities: ["Sync HA pair", "Async read replicas", "Sub-sec failover", "Lag dashboards"],
    },
    {
        icon: <BackupIcon />,
        title: "Backups & point-in-time recovery",
        description: "Daily snapshots plus WAL streaming to object storage. Restore to any second in the last 35 days, into a new or existing instance.",
        role: "Recovery",
        capabilities: ["Daily snapshots", "Continuous WAL", "35-day PITR", "Cross-region copy"],
    },
    {
        icon: <CacheIcon />,
        title: "Managed Redis cache",
        description: "Sub-millisecond key-value store for sessions, rate limits, queues, and hot reads. Cluster mode, HA, eviction policies of your choice.",
        role: "Cache",
        capabilities: ["Redis 7", "HA pair", "Cluster mode", "Eviction policies"],
    },
    {
        icon: <VectorIcon />,
        title: "pgvector & semantic search",
        description: "First-class pgvector on every Postgres instance. Build retrieval, recommendation, and similarity search next to the rest of your data.",
        role: "Vector",
        capabilities: ["pgvector", "HNSW indexes", "Hybrid search", "GPU-friendly"],
    },
    {
        icon: <ObservabilityIcon />,
        title: "Performance insights & audit",
        description: "Query insights, slow query logs, connection stats, plan history, and audit trails wired into a single dashboard — no extra agent.",
        role: "Insights",
        capabilities: ["Slow query log", "Plan history", "Connection stats", "Audit trail"],
    },
];

type Workload = { glyph: React.ReactNode; metric: string; title: string; description: string };

const WORKLOADS: Workload[] = [
    {
        glyph: <OltpGlyph />,
        metric: "OLTP",
        title: "Transactional app databases",
        description: "Row-shaped reads and writes for SaaS, fintech, marketplaces — connection pooling, prepared statements, HA failover for live traffic.",
    },
    {
        glyph: <AnalyticsGlyph />,
        metric: "OLAP",
        title: "Analytics and reporting",
        description: "Large memory tier for aggregation queries, columnar extensions, replicas dedicated to BI tools so production stays interactive.",
    },
    {
        glyph: <TimeseriesGlyph />,
        metric: "Series",
        title: "Time-series and telemetry",
        description: "TimescaleDB or pg_partman partitioning, hypertables, retention policies, compression — observability and metrics at write-rate scale.",
    },
    {
        glyph: <VectorWorkloadGlyph />,
        metric: "Vector",
        title: "Vector search and retrieval",
        description: "pgvector + HNSW indexes for RAG, semantic search, dedupe, recommendation — collocated with your transactional data, one network hop away.",
    },
    {
        glyph: <CacheWorkloadGlyph />,
        metric: "Cache",
        title: "Sessions, queues, and rate limits",
        description: "Redis primitives for session storage, sliding-window rate limits, job queues, and feature flags — all in the same private VPC.",
    },
    {
        glyph: <MultiRegionGlyph />,
        metric: "Geo",
        title: "Multi-region and DR-ready",
        description: "Asynchronous replication across regions, off-region snapshots, audited promotion — for compliance contracts and DR runbooks.",
    },
];

const FAQS = [
    {
        question: "Which engines and versions do you support?",
        answer:
            "Postgres 14, 15, 16, and 17, with major-version upgrades managed in maintenance windows. MySQL 8.0 and MariaDB 10.x are first-class. Redis 7 cluster and standalone modes are both supported.",
    },
    {
        question: "How does high availability work?",
        answer:
            "HA tiers run a synchronous standby in a second availability zone. Failover is automatic and typically completes in under a minute, with no client-side configuration changes — connection strings stay stable.",
    },
    {
        question: "What does point-in-time recovery cover?",
        answer:
            "WAL is streamed continuously to object storage alongside daily snapshots. You can restore to any second in the last 35 days into a new instance, in the same or a different region.",
    },
    {
        question: "How are connections pooled?",
        answer:
            "PgBouncer sits in front of every Postgres instance in transaction or session mode. Pool sizes scale with the chosen tier, and per-database pool stats surface in the insights dashboard.",
    },
    {
        question: "Can I use pgvector for RAG and search?",
        answer:
            "Yes. pgvector is preinstalled on every Postgres instance with HNSW and IVFFlat indexes. We tune `work_mem` and `maintenance_work_mem` for vector workloads on the Pro tier and above.",
    },
    {
        question: "How is the database network isolated?",
        answer:
            "Databases run inside your private VPC with no public IP by default. Access is via private endpoints, VPC peering, or SSH tunnel. TLS in transit, AES-256 at rest, role-based access, and audit logging are all on from day one.",
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
                        Query lifecycle
                    </p>
                    <h2 className="text-3xl font-semibold leading-[1.05] tracking-[-0.02em] text-white sm:text-4xl lg:text-[52px]">
                        Query to commit,{" "}
                        <span style={ACCENT_FONT} className="text-[#82adfb]">
                            every safety net in place.
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
                        { v: "<1s", l: "Replica lag" },
                        { v: "<60s", l: "HA failover" },
                        { v: "35d", l: "PITR window" },
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
                            One recommended topology.{" "}
                            <span style={ACCENT_FONT} className="text-[#0066B3]">
                                Three alternatives.
                            </span>
                        </h2>
                    </div>
                    <p className="max-w-[360px] text-[14.5px] leading-[1.65] text-black/60">
                        Database compositions for the workload — pick the one that matches yours.
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

                <p className={`${MONO} mx-auto mt-10 max-w-[640px] text-center text-[10.5px] uppercase tracking-[0.18em] text-black/40`}>
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
                            Six layers.{" "}
                            <span style={ACCENT_FONT} className="text-[#82adfb]">
                                Every safety net wired in.
                            </span>
                        </h2>
                    </div>
                    <p className="max-w-[360px] text-[14.5px] leading-[1.65] text-white/55">
                        Engine to insights — one private VPC, instrumented from byte one.
                    </p>
                </div>

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
                        Tuned for the shapes teams{" "}
                        <span style={ACCENT_FONT} className="text-[#0066B3]">
                            actually run.
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

export function DatabaseLanding() {
    return (
        <main className="bg-[#0D0D0F]">
            <ServiceHeroSection
                badge="Managed Databases"
                title="Databases that survive Friday deploys."
                description="Managed Postgres, MySQL, and Redis with HA standby, replicas, PITR, and pgvector — on your private VPC."
                primaryAction={{ label: "Talk to a solutions engineer", href: "/contact" }}
                secondaryAction={{ label: "Explore capabilities", href: "#stack" }}
                backgroundImage={{ src: "/images/hero/service-hero-bg.png", alt: "" }}
                illustration={{
                    src: "/images/main-page/solution-home-db.svg",
                    alt: "Managed database infrastructure",
                    priority: true,
                }}
            />
            <HeroStats metrics={HERO_STATS} eyebrow="Data plane" />
            <RequestFlow />
            <Scenarios />
            <Stack />
            <Workloads />
            <ServicesHomeSectionFive title="Frequently asked questions" faqs={FAQS} />
        </main>
    );
}
