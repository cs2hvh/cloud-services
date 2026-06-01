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

function BucketIcon() {
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

function BlockIcon() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            <rect x="4" y="6" width="24" height="6" rx="1.2" fill="currentColor" fillOpacity="0.10" />
            <rect x="4" y="14" width="24" height="6" rx="1.2" fill="#0095FF" fillOpacity="0.20" stroke="#0095FF" />
            <rect x="4" y="22" width="24" height="6" rx="1.2" fill="currentColor" fillOpacity="0.10" />
            <circle cx="7" cy="9" r="0.7" fill="currentColor" />
            <circle cx="7" cy="17" r="0.7" fill="#0095FF" />
            <circle cx="7" cy="25" r="0.7" fill="currentColor" />
            <path d="M11 9h13M11 17h13M11 25h13" strokeOpacity="0.4" />
        </svg>
    );
}

function LifecycleIcon() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 16a11 11 0 0 1 19-7.5" />
            <path d="M27 16a11 11 0 0 1-19 7.5" />
            <path d="M24 4v5h-5M8 28v-5h5" />
            <circle cx="16" cy="16" r="2.6" fill="#0095FF" fillOpacity="0.30" stroke="#0095FF" />
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

function ComplianceIcon() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3} strokeLinejoin="round">
            <path d="M16 3l11 4v8c0 6.5-4.5 11.5-11 13.5C9.5 26.5 5 21.5 5 15V7l11-4z" fill="currentColor" fillOpacity="0.10" />
            <rect x="10" y="13" width="12" height="9" rx="1" fill="#0095FF" fillOpacity="0.20" stroke="#0095FF" />
            <path d="M12 13v-2a4 4 0 0 1 8 0v2" />
            <circle cx="16" cy="17" r="1.2" fill="currentColor" />
            <path d="M16 18.2v1.8" strokeLinecap="round" />
        </svg>
    );
}

/* ──────── Workload glyphs (cream section) ──────── */

function MediaGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            <rect x="4" y="6" width="24" height="20" rx="1.5" fill="currentColor" fillOpacity="0.08" />
            <path d="M4 11h24M4 22h24M11 6v20M21 6v20" strokeOpacity="0.3" />
            <path d="M14 13l5 3-5 3z" fill="#0095FF" stroke="#0095FF" strokeLinejoin="round" />
        </svg>
    );
}

function UploadsGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3} strokeLinejoin="round" strokeLinecap="round">
            <path d="M4 22v3a1.5 1.5 0 0 0 1.5 1.5h21A1.5 1.5 0 0 0 28 25v-3" />
            <path d="M16 4v17M9 11l7-7 7 7" />
            <path d="M16 21h0" strokeOpacity="0" />
            <circle cx="16" cy="14" r="2" fill="#0095FF" fillOpacity="0.35" />
        </svg>
    );
}

function BackupWorkloadGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            <rect x="3" y="5" width="14" height="10" rx="1.5" fill="currentColor" fillOpacity="0.18" />
            <rect x="6" y="9" width="14" height="10" rx="1.5" fill="currentColor" fillOpacity="0.25" />
            <rect x="9" y="13" width="14" height="10" rx="1.5" fill="#0095FF" fillOpacity="0.25" stroke="#0095FF" />
            <path d="M14 18l3 3 5-5" stroke="#0095FF" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function DataLakeGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            <ellipse cx="16" cy="20" rx="13" ry="3.5" fill="#0095FF" fillOpacity="0.20" stroke="#0095FF" />
            <ellipse cx="16" cy="20" rx="9" ry="2.2" fill="currentColor" fillOpacity="0.15" />
            <path d="M9 14l2-6h10l2 6" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M12 11h8" strokeOpacity="0.4" />
        </svg>
    );
}

function MlDatasetGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            {[7, 11, 15, 19, 23, 27].map((y, i) => (
                <rect key={y} x={4 + i * 1.5} y={y} width={24 - i * 3} height="2.5" rx="0.5" fill="currentColor" fillOpacity={0.18 + i * 0.06} />
            ))}
            <circle cx="22" cy="14" r="1.4" fill="#0095FF" />
        </svg>
    );
}

function ComplianceWorkloadGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            <rect x="6" y="5" width="20" height="22" rx="1.5" fill="currentColor" fillOpacity="0.08" />
            <path d="M10 11h12M10 15h12M10 19h9" strokeOpacity="0.55" strokeLinecap="round" />
            <rect x="18" y="18" width="8" height="8" rx="1" fill="#0095FF" fillOpacity="0.25" stroke="#0095FF" />
            <path d="M20 22l1.5 1.5L25 20" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

/* ──────── Request-flow nodes (object lifecycle) ──────── */

function NodeClient() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4}>
            <rect x="5" y="6" width="22" height="14" rx="1.5" />
            <path d="M9 24h14" strokeLinecap="round" />
            <path d="M16 20v4" />
            <path d="M5 11h22" />
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
function NodeBucket() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round">
            <path d="M5 10h22l-1.7 16a1.2 1.2 0 0 1-1.2 1.1H7.9A1.2 1.2 0 0 1 6.7 26L5 10z" />
            <path d="M11 10V7.5a5 5 0 0 1 10 0V10" />
        </svg>
    );
}
function NodeHot() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4}>
            <ellipse cx="16" cy="8" rx="9" ry="3" />
            <path d="M7 8v8c0 1.6 4 3 9 3s9-1.4 9-3V8" />
            <path d="M7 16v8c0 1.6 4 3 9 3s9-1.4 9-3v-8" />
            <circle cx="22" cy="12" r="1" fill="currentColor" />
            <circle cx="22" cy="20" r="1" fill="currentColor" />
        </svg>
    );
}
function NodeWarm() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4}>
            <ellipse cx="16" cy="10" rx="9" ry="3" strokeOpacity="0.75" />
            <path d="M7 10v10c0 1.6 4 3 9 3s9-1.4 9-3V10" strokeOpacity="0.75" />
        </svg>
    );
}
function NodeReplica() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4}>
            <ellipse cx="10" cy="9" rx="5" ry="2" />
            <path d="M5 9v11c0 1.2 2.2 2 5 2s5-0.8 5-2V9" />
            <ellipse cx="22" cy="9" rx="5" ry="2" />
            <path d="M17 9v11c0 1.2 2.2 2 5 2s5-0.8 5-2V9" />
            <path d="M15 14h2" strokeOpacity="0.55" strokeDasharray="1.5 1.5" />
            <path d="M15 20h2" strokeOpacity="0.55" strokeDasharray="1.5 1.5" />
        </svg>
    );
}
function NodeArchive() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round">
            <path d="M4 8h24v4H4z" />
            <path d="M5 12h22v14a1.5 1.5 0 0 1-1.5 1.5h-19A1.5 1.5 0 0 1 5 26V12z" />
            <path d="M13 17h6" strokeLinecap="round" />
        </svg>
    );
}

/* ──────────────────────────────────────────────────────────────
   Data
   ────────────────────────────────────────────────────────────── */

const HERO_STATS = [
    { value: "11×9s", label: "Durability" },
    { value: "4", label: "Storage tiers" },
    { value: "12", label: "Regions" },
    { value: "150+", label: "Edge POPs" },
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
        name: "Starter bucket",
        persona: "Side projects, MVPs",
        description: "S3-compatible bucket for uploads, media, and build artifacts. Free egress inside the region.",
        monthly: "$5",
        suffix: "/mo · 250 GB",
        services: [
            { glyph: <BucketIcon />, label: "Object Storage" },
            { glyph: <EdgeIcon />, label: "CDN" },
        ],
        specs: [
            { label: "Capacity", value: "250 GB included · $0.01/GB after" },
            { label: "Egress", value: "Free in-region · CDN-cached" },
            { label: "Tiers", value: "Standard" },
        ],
        cta: { label: "Start storing", href: "/services/object-storage" },
    },
    {
        name: "Media & SaaS at scale",
        persona: "Live products, user uploads",
        description: "Hot bucket for working media, warm tier for older assets, CDN out front, daily snapshots.",
        monthly: "$120",
        suffix: "–$280/mo",
        services: [
            { glyph: <BucketIcon />, label: "Hot bucket" },
            { glyph: <LifecycleIcon />, label: "Lifecycle rules" },
            { glyph: <EdgeIcon />, label: "Global CDN" },
            { glyph: <BackupIcon />, label: "Daily snapshots" },
            { glyph: <BlockIcon />, label: "Block storage" },
        ],
        specs: [
            { label: "Capacity", value: "5–10 TB hot · warm tier after 30d" },
            { label: "Delivery", value: "150+ POPs · image optimization" },
            { label: "Recovery", value: "Daily snapshot · 30-day retention" },
        ],
        cta: { label: "Recommended", href: "/services/object-storage" },
        featured: true,
    },
    {
        name: "Data lake & analytics",
        persona: "BI, ML pipelines, exports",
        description: "Petabyte-class object storage with lifecycle tiering, parallel access, columnar-friendly throughput.",
        monthly: "$800",
        suffix: "–$2,400/mo",
        services: [
            { glyph: <BucketIcon />, label: "Object Pro" },
            { glyph: <LifecycleIcon />, label: "Tiering" },
            { glyph: <BackupIcon />, label: "Versioning" },
            { glyph: <ComplianceIcon />, label: "Audit logs" },
            { glyph: <BlockIcon />, label: "Cache layer" },
        ],
        specs: [
            { label: "Capacity", value: "100 TB–1 PB · parallel throughput" },
            { label: "Tiers", value: "Hot · warm · cold · archive" },
            { label: "Access", value: "S3 API · presigned · multipart" },
        ],
        cta: { label: "Compose stack", href: "/contact" },
    },
    {
        name: "Compliance & immutable",
        persona: "Regulated industries, audit",
        description: "Object lock (WORM), cross-region replication, audit trails, SOC 2, contractual SLAs.",
        monthly: "Custom",
        services: [
            { glyph: <ComplianceIcon />, label: "Object lock" },
            { glyph: <BucketIcon />, label: "Replicated buckets" },
            { glyph: <BackupIcon />, label: "Off-region snapshots" },
            { glyph: <LifecycleIcon />, label: "Retention policy" },
            { glyph: <EdgeIcon />, label: "Private endpoints" },
        ],
        specs: [
            { label: "Mode", value: "WORM · object lock · governance" },
            { label: "Compliance", value: "SOC 2 · HIPAA-ready · audit logs" },
            { label: "Support", value: "Dedicated SRE · 24×7" },
        ],
        cta: { label: "Talk to sales", href: "/contact" },
    },
];

type FlowNode = { icon: React.ReactNode; label: string; sub: string };

const FLOW: FlowNode[] = [
    { icon: <NodeClient />, label: "Client", sub: "App · browser · SDK" },
    { icon: <NodeEdge />, label: "Edge POP", sub: "Cache · TLS" },
    { icon: <NodeBucket />, label: "Bucket", sub: "S3-compatible" },
    { icon: <NodeHot />, label: "Hot tier", sub: "ms latency" },
    { icon: <NodeWarm />, label: "Warm tier", sub: "After 30d" },
    { icon: <NodeReplica />, label: "Replica region", sub: "Async copy" },
    { icon: <NodeArchive />, label: "Archive", sub: "Cold · WORM" },
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
        icon: <BucketIcon />,
        title: "Object storage",
        description:
            "S3-compatible engine — drop in any AWS SDK or existing tool. $5 for 250 GB, $0.01/GB after. Free egress in-region, multipart upload, presigned URLs, versioning.",
        role: "Engine",
        capabilities: ["S3 API · v4 sig", "Multipart upload", "Versioning", "Presigned URLs"],
    },
    {
        icon: <BlockIcon />,
        title: "Block storage",
        description:
            "NVMe-backed block volumes for databases, caches, and stateful workloads. Replicated within the AZ, snapshotted on schedule, resizable without downtime.",
        role: "Block",
        capabilities: ["NVMe-backed", "AZ replication", "Live resize", "Per-volume IOPS"],
    },
    {
        icon: <LifecycleIcon />,
        title: "Lifecycle & tiering",
        description:
            "Policy-driven movement between hot, warm, cold, and archive tiers. Expire stale objects, transition by prefix or tag, never touch the bill manually.",
        role: "Tiering",
        capabilities: ["Hot · warm · cold · archive", "Prefix rules", "Tag rules", "Auto-expire"],
    },
    {
        icon: <EdgeIcon />,
        title: "Global CDN & edge delivery",
        description:
            "150+ POPs in front of every bucket. Smart invalidation under 10 s, HTTP/3, brotli, image and video optimization included — for users, not for invoices.",
        role: "Delivery",
        capabilities: ["150+ POPs", "<10 s purge", "HTTP/3 · Brotli", "Image · video opt"],
    },
    {
        icon: <BackupIcon />,
        title: "Backups, snapshots & PITR",
        description:
            "Scheduled snapshots for buckets and volumes, point-in-time recovery for databases, cross-region copies for DR. Restore to new or existing resources.",
        role: "Recovery",
        capabilities: ["Scheduled snapshots", "PITR for DBs", "Cross-region copy", "Selective restore"],
    },
    {
        icon: <ComplianceIcon />,
        title: "Compliance & immutability",
        description:
            "Object lock (WORM) in compliance or governance modes, AES-256 at rest, TLS in transit, fine-grained IAM, audit log streaming, KMS-managed keys.",
        role: "Compliance",
        capabilities: ["WORM · object lock", "AES-256 · TLS", "Audit logs", "KMS-managed keys"],
    },
];

type Workload = { glyph: React.ReactNode; metric: string; title: string; description: string };

const WORKLOADS: Workload[] = [
    {
        glyph: <MediaGlyph />,
        metric: "Media",
        title: "Video, audio, and image hosting",
        description: "Origin storage for streaming, image-on-the-fly resizing, signed URLs for paywalls, CDN delivery to 150+ POPs.",
    },
    {
        glyph: <UploadsGlyph />,
        metric: "Uploads",
        title: "User-generated content & uploads",
        description: "Direct browser uploads via presigned URLs, virus scanning hooks, lifecycle expiry on abandoned drafts.",
    },
    {
        glyph: <BackupWorkloadGlyph />,
        metric: "Backups",
        title: "Database & application backups",
        description: "Scheduled snapshots of Postgres, MySQL, Redis, and VPS volumes. Cross-region copies for DR, WORM mode for ransomware protection.",
    },
    {
        glyph: <DataLakeGlyph />,
        metric: "Lake",
        title: "Data lake and analytics exports",
        description: "Parquet, ORC, and JSON sitting in object storage — queryable from Spark, DuckDB, Trino, or your warehouse of choice.",
    },
    {
        glyph: <MlDatasetGlyph />,
        metric: "ML",
        title: "ML datasets and model weights",
        description: "Versioned dataset blobs, checkpoint streaming during training, weight cache next to GPU pods — sub-millisecond hops.",
    },
    {
        glyph: <ComplianceWorkloadGlyph />,
        metric: "Records",
        title: "Compliance & immutable records",
        description: "Object lock with governance or compliance retention, audit trail per object, fine-grained IAM, KMS for at-rest encryption keys.",
    },
];

const FAQS = [
    {
        question: "Is your object storage actually S3-compatible?",
        answer:
            "Yes — full v4 signature support, multipart upload, presigned URLs, versioning, lifecycle, and tagging. Existing AWS SDKs, MinIO clients, rclone, and CDN integrations work without code changes beyond the endpoint URL.",
    },
    {
        question: "How is egress priced?",
        answer:
            "Traffic between services in the same region is free. Egress to your customers is delivered through the included CDN at standard rates. There is no surprise minimum and no per-request surcharge for ordinary GET traffic.",
    },
    {
        question: "What tiers do you offer?",
        answer:
            "Four tiers: Standard (hot, ms latency), Infrequent Access (warm), Cold, and Archive (lowest cost). Move between tiers by prefix or tag with a lifecycle rule; pricing scales down as you go colder.",
    },
    {
        question: "How does object lock (WORM) work?",
        answer:
            "Enable object lock at bucket creation, then set per-object retention in governance mode (admin can override) or compliance mode (no one can override until the retention expires). Required for many ransomware-recovery and audit programs.",
    },
    {
        question: "Can I replicate across regions?",
        answer:
            "Yes. Async cross-region replication on a per-bucket basis. Source and destination are usually in different geographies for DR. Replication latency is typically under a minute for objects under 100 MB.",
    },
    {
        question: "How do backups and PITR work for databases?",
        answer:
            "Managed databases stream WAL or binlog to object storage continuously, plus daily snapshots. You can restore to any second in the last 35 days into a new or existing instance, in the same or different region.",
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
                        Object lifecycle
                    </p>
                    <h2 className="text-3xl font-semibold leading-[1.05] tracking-[-0.02em] text-white sm:text-4xl lg:text-[52px]">
                        From PUT to archive,{" "}
                        <span style={ACCENT_FONT} className="text-[#82adfb]">
                            on one private network.
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
                        { v: "11×9s", l: "Durability" },
                        { v: "<50ms", l: "First byte (cached)" },
                        { v: "Zero", l: "In-region egress" },
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
                        Real stack shapes — pick the one that matches your data.
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
                                From PUT to archive.
                            </span>
                        </h2>
                    </div>
                    <p className="max-w-[360px] text-[14.5px] leading-[1.65] text-white/55">
                        Engine to immutability — one VPC, no cross-vendor egress.
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
                        What teams{" "}
                        <span style={ACCENT_FONT} className="text-[#0066B3]">
                            actually store.
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

export function StorageLanding() {
    return (
        <main className="bg-[#0D0D0F]">
            <ServiceHeroSection
                badge="Storage & Backup"
                title="Storage that scales with data, not the bill."
                description="S3-compatible objects, NVMe block, lifecycle tiering, CDN, immutable backups, and cross-region replication — on one private network."
                primaryAction={{ label: "Talk to a solutions engineer", href: "/contact" }}
                secondaryAction={{ label: "Explore capabilities", href: "#stack" }}
                backgroundImage={{ src: "/images/hero/service-hero-bg.png", alt: "" }}
                illustration={{
                    src: "/images/main-page/solution-home-storage.png",
                    alt: "Storage infrastructure",
                    priority: true,
                }}
            />
            <HeroStats metrics={HERO_STATS} eyebrow="Storage platform" />
            <RequestFlow />
            <Scenarios />
            <Stack />
            <Workloads />
            <ServicesHomeSectionFive title="Frequently asked questions" faqs={FAQS} />
        </main>
    );
}
