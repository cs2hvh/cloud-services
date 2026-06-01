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

function ComputeIcon() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            <rect x="4" y="5" width="24" height="9" rx="1.5" fill="currentColor" fillOpacity="0.08" />
            <rect x="4" y="18" width="24" height="9" rx="1.5" fill="currentColor" fillOpacity="0.08" />
            <circle cx="7" cy="9.5" r="0.8" fill="#0095FF" />
            <circle cx="7" cy="22.5" r="0.8" fill="#0095FF" />
            <path d="M11 9.5h13M11 22.5h13" strokeOpacity="0.5" />
            <rect x="24.5" y="7.5" width="2" height="4" rx="0.4" fill="currentColor" fillOpacity="0.5" />
            <rect x="24.5" y="20.5" width="2" height="4" rx="0.4" fill="currentColor" fillOpacity="0.5" />
        </svg>
    );
}

function DatabaseIcon() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            <ellipse cx="16" cy="7" rx="10" ry="3" fill="currentColor" fillOpacity="0.10" />
            <path d="M6 7v6c0 1.7 4.5 3 10 3s10-1.3 10-3V7" />
            <path d="M6 13v6c0 1.7 4.5 3 10 3s10-1.3 10-3v-6" />
            <path d="M6 19v6c0 1.7 4.5 3 10 3s10-1.3 10-3v-6" />
            <circle cx="22" cy="13" r="1" fill="#0095FF" />
            <circle cx="22" cy="19" r="1" fill="#0095FF" />
            <circle cx="22" cy="25" r="1" fill="#0095FF" />
        </svg>
    );
}

function BucketIcon() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3} strokeLinejoin="round">
            <path d="M5 9h22l-2 18a1.3 1.3 0 0 1-1.3 1.2H8.3A1.3 1.3 0 0 1 7 27L5 9z" fill="currentColor" fillOpacity="0.08" />
            <path d="M5 9h22" />
            <path d="M11 9V6.5a5 5 0 0 1 10 0V9" />
            <circle cx="12" cy="18" r="1.6" fill="#0095FF" fillOpacity="0.30" stroke="#0095FF" />
            <circle cx="18" cy="22" r="1.6" fill="currentColor" fillOpacity="0.3" />
            <circle cx="22" cy="16" r="1.4" fill="currentColor" fillOpacity="0.3" />
        </svg>
    );
}

function CdnIcon() {
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

function ShieldIcon() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3} strokeLinejoin="round">
            <path d="M16 3l11 4v8c0 6.5-4.5 11.5-11 13.5C9.5 26.5 5 21.5 5 15V7l11-4z" fill="currentColor" fillOpacity="0.10" />
            <path d="M16 9v6.5l5 1.5" strokeOpacity="0.5" />
            <path d="M10.5 16.5L14 20l7.5-7.5" stroke="#0095FF" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
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

/* ──────── Checkout flow node icons ──────── */

function NodeBrowser() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4}>
            <rect x="3" y="5" width="26" height="22" rx="1.5" />
            <path d="M3 10h26" />
            <circle cx="6.5" cy="7.5" r="0.7" fill="currentColor" />
            <circle cx="9" cy="7.5" r="0.7" fill="currentColor" />
            <rect x="12" y="6" width="10" height="3" rx="0.5" fill="currentColor" fillOpacity="0.2" />
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
function NodeWaf() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round">
            <path d="M16 5l9 3v7c0 5.5-3.8 9.5-9 11.5C10.8 24.5 7 20.5 7 15V8l9-3z" />
            <path d="M11.5 15.5l3 3 5.5-5.5" strokeLinecap="round" />
        </svg>
    );
}
function NodeLb() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round">
            <circle cx="16" cy="9" r="3" />
            <circle cx="7" cy="22" r="2.5" />
            <circle cx="16" cy="22" r="2.5" />
            <circle cx="25" cy="22" r="2.5" />
            <path d="M16 12l-9 8M16 12v8M16 12l9 8" strokeOpacity="0.5" />
        </svg>
    );
}
function NodeStore() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4}>
            <rect x="4" y="6" width="24" height="20" rx="1.5" />
            <path d="M4 12h24" />
            <circle cx="7.5" cy="9" r="0.7" fill="currentColor" />
            <path d="M11 9h10" strokeOpacity="0.4" />
            <rect x="7" y="15" width="8" height="7" rx="0.5" fill="currentColor" fillOpacity="0.15" />
            <path d="M18 16h6M18 19h5M18 22h4" strokeOpacity="0.45" />
        </svg>
    );
}
function NodePayment() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round">
            <rect x="3" y="7" width="26" height="18" rx="1.5" />
            <path d="M3 12h26" />
            <rect x="6" y="15" width="8" height="5" rx="0.5" fill="#0095FF" fillOpacity="0.30" stroke="#0095FF" />
            <path d="M18 17h8M18 20h5" strokeOpacity="0.5" />
        </svg>
    );
}
function NodeDb() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4}>
            <ellipse cx="16" cy="8" rx="9" ry="3" />
            <path d="M7 8v8c0 1.6 4 3 9 3s9-1.4 9-3V8" />
            <path d="M7 16v8c0 1.6 4 3 9 3s9-1.4 9-3v-8" />
        </svg>
    );
}

/* ──────── Workload glyphs (cream section) ──────── */

function StorefrontGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            <rect x="3" y="4" width="26" height="24" rx="2" />
            <rect x="3" y="4" width="26" height="5" rx="2" fill="currentColor" fillOpacity="0.10" />
            <circle cx="6" cy="6.5" r="0.6" fill="currentColor" />
            <circle cx="8" cy="6.5" r="0.6" fill="currentColor" />
            <rect x="6" y="12" width="11" height="2" rx="0.4" fill="currentColor" fillOpacity="0.85" />
            <rect x="6" y="16" width="14" height="1.2" rx="0.3" fill="currentColor" fillOpacity="0.45" />
            <rect x="6" y="18.5" width="12" height="1.2" rx="0.3" fill="currentColor" fillOpacity="0.45" />
            <rect x="6" y="22" width="5" height="2.5" rx="0.5" fill="#0095FF" />
            <rect x="20" y="12" width="6" height="10" rx="0.6" fill="currentColor" fillOpacity="0.18" />
        </svg>
    );
}

function CartGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3} strokeLinejoin="round">
            <path d="M5 7h2.2l2 13h14l2-9H8" strokeLinecap="round" />
            <circle cx="11" cy="25" r="1.6" fill="currentColor" />
            <circle cx="22" cy="25" r="1.6" fill="currentColor" />
            <rect x="11" y="13" width="3" height="4" rx="0.3" fill="currentColor" fillOpacity="0.3" />
            <rect x="15" y="13" width="3" height="4" rx="0.3" fill="#0095FF" fillOpacity="0.35" />
            <rect x="19" y="13" width="3" height="4" rx="0.3" fill="currentColor" fillOpacity="0.3" />
        </svg>
    );
}

function SpikeGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            <path d="M4 26l5-9 5 4 6-12 5 7 3-4" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="9" cy="17" r="1.3" fill="currentColor" />
            <circle cx="14" cy="21" r="1.3" fill="currentColor" />
            <circle cx="20" cy="9" r="1.3" fill="currentColor" />
            <circle cx="25" cy="16" r="1.3" fill="#0095FF" />
            <path d="M3 29h26" strokeOpacity="0.3" />
        </svg>
    );
}

function MediaGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            <rect x="3" y="6" width="26" height="20" rx="1.5" fill="currentColor" fillOpacity="0.08" />
            <circle cx="10" cy="13" r="3" fill="currentColor" fillOpacity="0.20" />
            <path d="M3 22l7-7 5 5 4-3 8 5" strokeOpacity="0.55" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="10" cy="13" r="3" />
            <rect x="22" y="8" width="5" height="4" rx="0.4" fill="#0095FF" fillOpacity="0.30" stroke="#0095FF" />
        </svg>
    );
}

function InventoryGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            <rect x="4" y="4" width="24" height="24" rx="1.5" fill="currentColor" fillOpacity="0.08" />
            <path d="M4 10h24M4 16h24M4 22h24" strokeOpacity="0.25" />
            <path d="M10 4v24M22 4v24" strokeOpacity="0.25" />
            <rect x="10" y="10" width="12" height="6" fill="#0095FF" fillOpacity="0.20" stroke="#0095FF" />
        </svg>
    );
}

function AnalyticsGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="26" height="22" rx="1.5" fill="currentColor" fillOpacity="0.08" />
            <path d="M8 22l4-6 4 3 5-9 5 4" />
            <circle cx="12" cy="16" r="1.3" fill="currentColor" />
            <circle cx="16" cy="19" r="1.3" fill="currentColor" />
            <circle cx="21" cy="10" r="1.3" fill="#0095FF" />
            <path d="M7 27h18" strokeOpacity="0.3" />
        </svg>
    );
}

/* ──────────────────────────────────────────────────────────────
   Data
   ────────────────────────────────────────────────────────────── */

const HERO_STATS = [
    { value: "99.99%", label: "Uptime SLA" },
    { value: "<50ms", label: "CDN latency" },
    { value: "15", label: "Locations" },
    { value: "<30s", label: "Provisioning" },
];

const CHECKOUT_FLOW = [
    { icon: <NodeBrowser />, label: "Shopper", sub: "Any device" },
    { icon: <NodeEdge />, label: "Edge POP", sub: "Static + CDN" },
    { icon: <NodeWaf />, label: "WAF + TLS", sub: "PCI, bots" },
    { icon: <NodeLb />, label: "Load balancer", sub: "Health-aware" },
    { icon: <NodeStore />, label: "Storefront", sub: "App replicas" },
    { icon: <NodePayment />, label: "Payment API", sub: "PCI-scoped" },
    { icon: <NodeDb />, label: "Order DB", sub: "HA + PITR" },
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
        name: "Side-project storefront",
        persona: "Indie sellers, prototypes",
        description: "Launch a product page or small catalog. Add a payment gateway and ship today.",
        monthly: "$6",
        suffix: "/mo",
        services: [
            { glyph: <ComputeIcon />, label: "Starter VPS" },
            { glyph: <BucketIcon />, label: "Object Storage" },
            { glyph: <CdnIcon />, label: "CDN" },
            { glyph: <ShieldIcon />, label: "Free TLS" },
        ],
        specs: [
            { label: "Compute", value: "1 vCPU · 1 GB" },
            { label: "Storage", value: "25 GB NVMe + object storage" },
            { label: "Bandwidth", value: "1 TB / mo" },
        ],
        cta: { label: "Start small", href: "/services/compute" },
    },
    {
        name: "Growing DTC brand at 5K orders/day",
        persona: "Funded brands, agencies",
        description: "App Platform, managed Postgres + Redis, image CDN, WAF, and preview environments.",
        monthly: "$120",
        suffix: "–$200/mo",
        services: [
            { glyph: <ComputeIcon />, label: "App Platform" },
            { glyph: <DatabaseIcon />, label: "Managed Postgres" },
            { glyph: <CacheIcon />, label: "Redis cache" },
            { glyph: <BucketIcon />, label: "Media storage" },
            { glyph: <CdnIcon />, label: "CDN + image opt." },
        ],
        specs: [
            { label: "Compute", value: "3 replicas · 2 vCPU each" },
            { label: "Database", value: "4 GB Postgres + 1 GB Redis" },
            { label: "Bandwidth", value: "5 TB / mo + CDN" },
        ],
        cta: { label: "Recommended", href: "/services/app-deployment" },
        featured: true,
    },
    {
        name: "High-traffic marketplace",
        persona: "Established storefronts",
        description: "HA database pair, dedicated Redis, WAF + bot management, and image transforms at scale.",
        monthly: "$280",
        suffix: "–$500/mo",
        services: [
            { glyph: <ComputeIcon />, label: "Performance VPS" },
            { glyph: <DatabaseIcon />, label: "HA Postgres" },
            { glyph: <CacheIcon />, label: "Redis HA" },
            { glyph: <BucketIcon />, label: "Object Storage" },
            { glyph: <ShieldIcon />, label: "WAF + bots" },
        ],
        specs: [
            { label: "Compute", value: "8 vCPU · 16 GB + auto-scale" },
            { label: "Database", value: "HA pair · daily PITR backups" },
            { label: "Bandwidth", value: "10+ TB / mo + image opt." },
        ],
        cta: { label: "Compose stack", href: "/contact" },
    },
    {
        name: "Enterprise commerce platform",
        persona: "PCI-bound, global teams",
        description: "Multi-region, dedicated capacity, PCI DSS scoping, contractual SLAs.",
        monthly: "Custom",
        services: [
            { glyph: <ComputeIcon />, label: "Dedicated" },
            { glyph: <DatabaseIcon />, label: "Sharded DB" },
            { glyph: <BucketIcon />, label: "Multi-region" },
            { glyph: <CdnIcon />, label: "Edge + cache" },
            { glyph: <ShieldIcon />, label: "PCI + SSO" },
        ],
        specs: [
            { label: "Compute", value: "Dedicated · multi-AZ" },
            { label: "Database", value: "Sharded · cross-region replicas" },
            { label: "Compliance", value: "PCI DSS, audit logs, RBAC" },
        ],
        cta: { label: "Talk to sales", href: "/contact" },
    },
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
        icon: <ComputeIcon />,
        title: "Compute & App Platform",
        description: "Scale storefront replicas behind a load balancer. Push-to-deploy App Platform for rapid iteration, root VPS for custom runtimes.",
        role: "Runtime",
        capabilities: ["Push-to-deploy", "Rolling deploys", "Auto-scale", "Root on VPS"],
    },
    {
        icon: <DatabaseIcon />,
        title: "Managed Postgres · MySQL · Redis",
        description: "Orders, catalog, sessions — every data primitive a real commerce platform needs. Daily backups, PITR, read replicas, and connection pooling.",
        role: "Data plane",
        capabilities: ["Postgres HA", "MySQL · MongoDB", "Redis sessions", "PITR backups"],
    },
    {
        icon: <BucketIcon />,
        title: "Object storage for product media",
        description: "S3-compatible store for product images, videos, and exports. Free egress inside the region. Pair with the CDN for global delivery.",
        role: "Storage",
        capabilities: ["S3-compatible", "$5 / 250 GB", "Lifecycle rules", "Free in-region"],
    },
    {
        icon: <CdnIcon />,
        title: "Global CDN & image optimization",
        description: "200+ edge locations serving storefronts and media with sub-50ms latency. Pair with object storage for product images — free in-region egress.",
        role: "Delivery",
        capabilities: ["200+ locations", "Sub-50ms latency", "Free in-region", "CDN included"],
    },
    {
        icon: <ShieldIcon />,
        title: "WAF, TLS & DDoS protection",
        description: "PCI-scoped WAF with OWASP rule sets, bot scoring, and L3/L4 absorption. Free wildcard certificates with automatic renewal.",
        role: "Security",
        capabilities: ["PCI WAF", "OWASP rules", "Bot scoring", "Free wildcard TLS"],
    },
    {
        icon: <CacheIcon />,
        title: "Redis for sessions & cart",
        description: "Managed Redis HA keeps cart state and checkout sessions fast. Persistence, eviction policies, and automatic failover configured for you.",
        role: "Cache",
        capabilities: ["Cart sessions", "HA failover", "Persistence", "Eviction policies"],
    },
];

type Workload = {
    glyph: React.ReactNode;
    metric: string;
    title: string;
    description: string;
};

const WORKLOADS: Workload[] = [
    {
        glyph: <StorefrontGlyph />,
        metric: "Storefront",
        title: "Marketing & product pages",
        description: "Static-first builds cached at the edge. ISR for catalog updates without a full redeploy. Lighthouse 100s out of the box.",
    },
    {
        glyph: <CartGlyph />,
        metric: "Checkout",
        title: "Resilient checkout flows",
        description: "Cart state in Redis, order writes to Postgres HA, payment API in a PCI-scoped network segment — all on the same private VPC.",
    },
    {
        glyph: <SpikeGlyph />,
        metric: "Flash sales",
        title: "Traffic spike handling",
        description: "Auto-scale compute behind a health-aware load balancer. WAF absorbs bot floods before they reach the origin.",
    },
    {
        glyph: <MediaGlyph />,
        metric: "Media",
        title: "Product images & video",
        description: "Object storage for originals, CDN delivery across 200+ edge locations. Free in-region egress, and no surprise bandwidth bill between services.",
    },
    {
        glyph: <InventoryGlyph />,
        metric: "Inventory",
        title: "Real-time inventory & orders",
        description: "Postgres with read replicas for catalog reads, replication for reporting, and row-level locking for concurrent order writes.",
    },
    {
        glyph: <AnalyticsGlyph />,
        metric: "Analytics",
        title: "Customer analytics & ML",
        description: "Stream events to object storage, query with read replicas, or route to an ML service for recommendations and personalization.",
    },
];

const FAQS = [
    {
        question: "How do you handle Black Friday traffic spikes?",
        answer:
            "Auto-scaling compute behind a load balancer handles sudden traffic bursts. WAF and bot management absorb malicious traffic before it reaches the origin. Redis keeps cart state consistent under concurrent writes. You can pre-scale compute nodes ahead of known events.",
    },
    {
        question: "Is the infrastructure PCI DSS compliant?",
        answer:
            "The platform provides PCI-scoped network segments, encrypted storage, WAF with payment rule sets, and audit logging. Enterprise plans include formal PCI DSS compliance documentation and dedicated capacity for cardholder data environments.",
    },
    {
        question: "How is product media handled at scale?",
        answer:
            "Object storage holds originals. The CDN serves resized, format-converted variants (WebP, AVIF) on demand via URL parameters. Images are cached at 150+ edge POPs. There is no per-resize charge and no surprise egress bill for in-region traffic.",
    },
    {
        question: "Can I run Magento, WooCommerce, or Medusa?",
        answer:
            "Yes. VPS instances give you root for any PHP-FPM, Node.js, or container-based platform. Managed Postgres or MySQL handles the database. Redis covers sessions and object cache. Egress-optimized object storage handles media offload.",
    },
    {
        question: "How are database backups and recovery handled?",
        answer:
            "Every managed database includes daily automated backups and point-in-time recovery. HA pairs replicate synchronously. Read replicas offload analytics and reporting. PITR retention is configurable based on your plan.",
    },
    {
        question: "What does bandwidth cost?",
        answer:
            "Every plan includes a generous monthly egress allowance. Traffic between services inside the same region is free. CDN delivery is billed at standard rates with no hidden minimums. Storage egress to the CDN is free.",
    },
];

/* ──────────────────────────────────────────────────────────────
   Sections
   ────────────────────────────────────────────────────────────── */

function CheckoutFlow() {
    return (
        <section className="relative overflow-hidden bg-[#0D0D0F] py-20 sm:py-24 lg:py-28">
            <div aria-hidden className="absolute top-0 left-1/2 h-px w-[60%] -translate-x-1/2 bg-gradient-to-r from-transparent via-white/10 to-transparent" />

            <Aurora intensity="medium" />
            <Eclipse position="top" size={780} intensity={0.10} blur={90} />

            <Container className="relative z-10">
                <div className="mx-auto max-w-[760px] text-center">
                    <p className={`${MONO} mb-5 inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-white/50`}>
                        <span className="h-1.5 w-1.5 rounded-full bg-[#0095FF]" />
                        Request lifecycle
                    </p>
                    <h2 className="text-3xl font-semibold leading-[1.05] tracking-[-0.02em] text-white sm:text-4xl lg:text-[52px]">
                        Click to order,{" "}
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

                        {CHECKOUT_FLOW.map((n, i) => (
                            <div key={n.label} className="relative z-10 flex flex-1 flex-col items-center gap-3">
                                <div
                                    className="relative flex h-[88px] w-[88px] items-center justify-center rounded-full border border-white/[0.12] bg-[#111316] text-white/85"
                                    style={{ boxShadow: "0 12px 30px -16px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)" }}
                                >
                                    <div className="h-[42px] w-[42px]">{n.icon}</div>
                                    <span
                                        className="absolute -bottom-1 -right-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/[0.12] bg-[#0D0D0F] text-[9px] font-bold text-white/55"
                                        style={{ fontFamily: "var(--font-geist-mono),ui-monospace,monospace" }}
                                    >
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
                        { v: "<40ms", l: "Edge → origin" },
                        { v: "Free", l: "In-region egress" },
                        { v: "PCI", l: "Payment network scope" },
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
                        Real stack shapes — pick the one that matches your order volume and compliance requirements.
                    </p>
                </div>

                {/* Featured hero */}
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
                            Six layers.{" "}
                            <span style={ACCENT_FONT} className="text-[#82adfb]">
                                One private network.
                            </span>
                        </h2>
                    </div>
                    <p className="max-w-[360px] text-[14.5px] leading-[1.65] text-white/55">
                        Compute to edge — wired together on one VPC, no cross-vendor egress.
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
                                        <span className={`${MONO} inline-flex items-center gap-1.5 rounded-full border border-white/[0.10] bg-white/[0.03] px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-white/55`}>
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
                        Tuned for commerce workloads{" "}
                        <span style={ACCENT_FONT} className="text-[#0066B3]">
                            teams actually ship.
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
            <div aria-hidden className="absolute top-0 left-1/2 h-px w-[60%] -translate-x-1/2 bg-gradient-to-r from-transparent via-white/12 to-transparent" />

            <Container className="relative z-10">
                <div className="mx-auto max-w-[920px] overflow-hidden rounded-[12px] border border-white/[0.10] bg-[#111316] p-10 sm:p-12 lg:p-14">
                    <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#0095FF]/[0.06] blur-3xl" />

                    <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-center lg:gap-14">
                        <div>
                            <p className={`${MONO} mb-4 inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-white/50`}>
                                <span className="h-1.5 w-1.5 rounded-full bg-[#0095FF]" />
                                Plan your commerce stack
                            </p>
                            <h2 className="text-3xl font-semibold leading-[1.05] tracking-[-0.02em] text-white sm:text-4xl lg:text-[42px]">
                                Walk us through the store. We&apos;ll size the stack.
                            </h2>
                            <p className="mt-4 max-w-[440px] text-[14.5px] leading-[1.6] text-white/60">
                                Send the platform, the catalog size, the traffic shape, and any compliance requirements. We respond with a sized stack, a price, and a migration plan.
                            </p>
                        </div>

                        <div className="flex flex-col gap-3">
                            <Link
                                href="/contact"
                                className={`${MONO} inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-[5px] border border-white bg-white text-[11px] font-semibold uppercase tracking-[0.14em] text-black transition-colors hover:bg-white/90`}
                            >
                                Talk to a solutions engineer
                                <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                            <Link
                                href="/services/compute"
                                className={`${MONO} inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-[5px] border border-white/[0.14] bg-transparent text-[11px] font-semibold uppercase tracking-[0.14em] text-white/75 transition-colors hover:border-white/35 hover:bg-white/[0.04] hover:text-white`}
                            >
                                Explore compute options
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

export function EcommerceLanding() {
    return (
        <main className="bg-[#0D0D0F]">
            <ServiceHeroSection
                badge="Ecommerce Infrastructure"
                title="Storefronts that scale on demand."
                description="Compute, managed databases, object storage, CDN, WAF, and Redis — one network, one bill. Sized for Black-Friday-grade spikes."
                primaryAction={{ label: "Talk to a solutions engineer", href: "/contact" }}
                secondaryAction={{ label: "Explore capabilities", href: "#stack" }}
                backgroundImage={{ src: "/images/hero/service-hero-bg.png", alt: "" }}
                illustration={{
                    src: "/images/main-page/solution-home-ecom.png",
                    alt: "Ecommerce infrastructure",
                    priority: true,
                }}
            />
            <HeroStats metrics={HERO_STATS} eyebrow="Commerce platform" />
            <CheckoutFlow />
            <Scenarios />
            <Stack />
            <Workloads />
            <ServicesHomeSectionFive title="Frequently asked questions" faqs={FAQS} />
            <FinalCta />
        </main>
    );
}
