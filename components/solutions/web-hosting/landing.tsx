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
   Custom inline illustrations (32×32 — layered + accent fills)
   ────────────────────────────────────────────────────────────── */

function MarketingArt({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 32 32" fill="none" className={className} stroke="currentColor" strokeWidth={1.2}>
            <rect x="3" y="4" width="26" height="24" rx="2" />
            <rect x="3" y="4" width="26" height="5" rx="2" fill="currentColor" fillOpacity="0.10" />
            <circle cx="6" cy="6.5" r="0.6" fill="currentColor" />
            <circle cx="8" cy="6.5" r="0.6" fill="currentColor" />
            <circle cx="10" cy="6.5" r="0.6" fill="currentColor" />
            <rect x="6" y="12" width="11" height="2" rx="0.4" fill="currentColor" fillOpacity="0.85" />
            <rect x="6" y="16" width="14" height="1.2" rx="0.3" fill="currentColor" fillOpacity="0.45" />
            <rect x="6" y="18.5" width="12" height="1.2" rx="0.3" fill="currentColor" fillOpacity="0.45" />
            <rect x="6" y="22" width="5" height="2.5" rx="0.5" fill="#0095FF" />
            <rect x="20" y="12" width="6" height="10" rx="0.6" fill="currentColor" fillOpacity="0.18" />
        </svg>
    );
}

function AppArt({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 32 32" fill="none" className={className} stroke="currentColor" strokeWidth={1.2}>
            <rect x="2" y="6" width="20" height="14" rx="1.6" fill="currentColor" fillOpacity="0.08" />
            <path d="M2 9.5h20" />
            <circle cx="4.5" cy="7.8" r="0.5" fill="currentColor" />
            <circle cx="6.2" cy="7.8" r="0.5" fill="currentColor" />
            <rect x="4.5" y="11.5" width="6" height="1" rx="0.3" fill="currentColor" fillOpacity="0.7" />
            <rect x="4.5" y="13.5" width="9" height="1" rx="0.3" fill="currentColor" fillOpacity="0.45" />
            <rect x="4.5" y="15.5" width="7" height="1" rx="0.3" fill="currentColor" fillOpacity="0.45" />
            <rect x="14.5" y="11.5" width="6" height="6.5" rx="0.6" fill="#0095FF" fillOpacity="0.25" stroke="#0095FF" />
            <rect x="10" y="13" width="20" height="14" rx="1.6" fill="currentColor" fillOpacity="0.05" />
            <path d="M10 16.5h20" />
            <rect x="12.5" y="18.5" width="6" height="1" rx="0.3" fill="currentColor" fillOpacity="0.6" />
            <rect x="12.5" y="20.5" width="9" height="1" rx="0.3" fill="currentColor" fillOpacity="0.35" />
            <rect x="12.5" y="22.5" width="7" height="1" rx="0.3" fill="currentColor" fillOpacity="0.35" />
            <circle cx="26" cy="22" r="2.2" fill="currentColor" fillOpacity="0.18" />
        </svg>
    );
}

function CartArt({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 32 32" fill="none" className={className} stroke="currentColor" strokeWidth={1.2}>
            <rect x="3" y="5" width="26" height="18" rx="1.5" />
            <path d="M3 9h26" />
            <rect x="6" y="12" width="6" height="6" rx="0.6" fill="currentColor" fillOpacity="0.15" />
            <rect x="13.5" y="12" width="6" height="6" rx="0.6" fill="#0095FF" fillOpacity="0.30" stroke="#0095FF" />
            <rect x="21" y="12" width="6" height="6" rx="0.6" fill="currentColor" fillOpacity="0.15" />
            <path d="M6 20h6M13.5 20h4M21 20h5" strokeOpacity="0.5" />
            <path d="M9 26.5l1.6-1.6h12l1.6 1.6" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="11.5" cy="28" r="1.4" fill="currentColor" />
            <circle cx="22" cy="28" r="1.4" fill="currentColor" />
        </svg>
    );
}

function CmsArt({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 32 32" fill="none" className={className} stroke="currentColor" strokeWidth={1.2}>
            <rect x="4" y="4" width="22" height="24" rx="1.6" />
            <path d="M4 9h22" />
            <circle cx="6.5" cy="6.5" r="0.5" fill="currentColor" />
            <circle cx="8.2" cy="6.5" r="0.5" fill="currentColor" />
            <rect x="7" y="12" width="10" height="1.2" rx="0.3" fill="currentColor" fillOpacity="0.7" />
            <rect x="7" y="14.5" width="16" height="1" rx="0.3" fill="currentColor" fillOpacity="0.35" />
            <rect x="7" y="16.5" width="14" height="1" rx="0.3" fill="currentColor" fillOpacity="0.35" />
            <rect x="7" y="18.5" width="15" height="1" rx="0.3" fill="currentColor" fillOpacity="0.35" />
            <rect x="7" y="22" width="9" height="3" rx="0.6" fill="#0095FF" fillOpacity="0.30" stroke="#0095FF" />
            <rect x="18" y="22" width="6" height="3" rx="0.6" fill="currentColor" fillOpacity="0.18" />
        </svg>
    );
}

/* ──────── Stack glyphs ──────── */

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

function ShieldIcon() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3} strokeLinejoin="round">
            <path d="M16 3l11 4v8c0 6.5-4.5 11.5-11 13.5C9.5 26.5 5 21.5 5 15V7l11-4z" fill="currentColor" fillOpacity="0.10" />
            <path d="M16 9v6.5l5 1.5" strokeOpacity="0.5" />
            <path d="M10.5 16.5L14 20l7.5-7.5" stroke="#0095FF" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function PipelineIcon() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="7" cy="7" r="2.2" fill="currentColor" fillOpacity="0.10" />
            <circle cx="7" cy="25" r="2.2" fill="currentColor" fillOpacity="0.10" />
            <circle cx="25" cy="16" r="2.2" fill="#0095FF" fillOpacity="0.30" stroke="#0095FF" />
            <path d="M7 9.2v13.6" />
            <path d="M7 16c0-4 5-4 8-4 5 0 7-2 8-3" strokeOpacity="0.7" />
            <path d="M7 16c0 4 5 4 8 4 5 0 7 2 8 3" strokeOpacity="0.4" />
        </svg>
    );
}

/* ──────── Workload glyphs (cream section) ──────── */

function HighTrafficGlyph() {
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

function MultiTenantGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            <rect x="3" y="6" width="9" height="9" rx="1" fill="currentColor" fillOpacity="0.10" />
            <rect x="14" y="6" width="9" height="9" rx="1" fill="currentColor" fillOpacity="0.10" />
            <rect x="3" y="17" width="9" height="9" rx="1" fill="#0095FF" fillOpacity="0.20" stroke="#0095FF" />
            <rect x="14" y="17" width="9" height="9" rx="1" fill="currentColor" fillOpacity="0.10" />
            <rect x="25" y="6" width="4" height="20" rx="0.8" fill="currentColor" fillOpacity="0.18" />
            <path d="M7.5 10.5h1M18.5 10.5h1M7.5 21.5h1M18.5 21.5h1" />
        </svg>
    );
}

function CommerceGlyph() {
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

function CmsGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            <rect x="4" y="5" width="20" height="22" rx="1.4" fill="currentColor" fillOpacity="0.08" />
            <path d="M4 10h20" />
            <rect x="7" y="13" width="14" height="1.4" rx="0.3" fill="currentColor" fillOpacity="0.5" />
            <rect x="7" y="16" width="11" height="1.4" rx="0.3" fill="currentColor" fillOpacity="0.5" />
            <rect x="7" y="19" width="13" height="1.4" rx="0.3" fill="currentColor" fillOpacity="0.5" />
            <rect x="7" y="22" width="8" height="2.5" rx="0.5" fill="#0095FF" fillOpacity="0.30" stroke="#0095FF" />
        </svg>
    );
}

function ApiGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3} strokeLinejoin="round" strokeLinecap="round">
            <path d="M11 8L4 16l7 8" />
            <path d="M21 8l7 8-7 8" />
            <path d="M19 5l-6 22" strokeOpacity="0.5" />
            <circle cx="6" cy="16" r="1.3" fill="#0095FF" />
            <circle cx="26" cy="16" r="1.3" fill="#0095FF" />
        </svg>
    );
}

function InternalToolsGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3} strokeLinejoin="round">
            <rect x="4" y="6" width="24" height="20" rx="1.4" fill="currentColor" fillOpacity="0.08" />
            <path d="M4 11h24" />
            <rect x="6.5" y="14" width="5.5" height="9" rx="0.5" fill="currentColor" fillOpacity="0.18" />
            <rect x="13.5" y="14" width="6" height="4" rx="0.5" fill="#0095FF" fillOpacity="0.30" stroke="#0095FF" />
            <rect x="13.5" y="19" width="6" height="4" rx="0.5" fill="currentColor" fillOpacity="0.18" />
            <rect x="21" y="14" width="5.5" height="9" rx="0.5" fill="currentColor" fillOpacity="0.18" />
        </svg>
    );
}

/* ──────── Request-flow node icons (small) ──────── */

function NodeUser() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4}>
            <circle cx="16" cy="11" r="4" fill="currentColor" fillOpacity="0.18" />
            <path d="M6 26c2-5 6.5-7.5 10-7.5s8 2.5 10 7.5" strokeLinecap="round" />
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
function NodeShield() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round">
            <path d="M16 5l9 3v7c0 5.5-3.8 9.5-9 11.5C10.8 24.5 7 20.5 7 15V8l9-3z" />
            <path d="M11.5 15.5l3 3 5.5-5.5" strokeLinecap="round" />
        </svg>
    );
}
function NodeLB() {
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
function NodeApp() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4}>
            <rect x="5" y="7" width="22" height="18" rx="1.5" />
            <path d="M5 12h22" />
            <circle cx="8" cy="9.5" r="0.6" fill="currentColor" />
            <circle cx="10" cy="9.5" r="0.6" fill="currentColor" />
            <path d="M9 17l3 3 8-8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}
function NodeDB() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4}>
            <ellipse cx="16" cy="8" rx="9" ry="3" />
            <path d="M7 8v8c0 1.6 4 3 9 3s9-1.4 9-3V8" />
            <path d="M7 16v8c0 1.6 4 3 9 3s9-1.4 9-3v-8" />
        </svg>
    );
}
function NodeStore() {
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
    { value: "99.99%", label: "Uptime SLA" },
    { value: "<5 min", label: "Push to live" },
    { value: "12", label: "Regions" },
    { value: "150+", label: "Edge POPs" },
];

type Workflow = {
    art: (cls: string) => React.ReactNode;
    title: string;
    description: string;
    tags: string[];
};

const FEATURE: Workflow = {
    art: (cls) => <AppArt className={cls} />,
    title: "Production SaaS web applications",
    description:
        "Multi-tenant apps with managed Postgres, background workers, queues, and zero-downtime deploys behind a load balancer. Wire every service together on one private network.",
    tags: ["Node", "Python", "Ruby", "Go", "Java"],
};

const WORKFLOWS: Workflow[] = [
    {
        art: (cls) => <MarketingArt className={cls} />,
        title: "Marketing & content sites",
        description: "Next.js, Astro, Hugo, plain static — built on push, served from the edge.",
        tags: ["Next.js", "Astro", "Static", "Edge"],
    },
    {
        art: (cls) => <CartArt className={cls} />,
        title: "E-commerce storefronts",
        description: "Magento, Hydrogen, Medusa, WooCommerce — sized for Black-Friday-grade spikes.",
        tags: ["Medusa", "Hydrogen", "Magento"],
    },
    {
        art: (cls) => <CmsArt className={cls} />,
        title: "Headless CMS & blogs",
        description: "WordPress, Strapi, Ghost, Payload — paired with object storage and CDN.",
        tags: ["WordPress", "Strapi", "Ghost"],
    },
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
        name: "Side project & launch",
        persona: "Founders, indie builders",
        description: "Ship a landing page or MVP today. Scale up later without redeploying.",
        monthly: "$5",
        suffix: "/mo",
        services: [
            { glyph: <ComputeIcon />, label: "Starter VPS" },
            { glyph: <BucketIcon />, label: "Object Storage" },
            { glyph: <EdgeIcon />, label: "CDN" },
            { glyph: <ShieldIcon />, label: "Free TLS" },
        ],
        specs: [
            { label: "Compute", value: "1 vCPU · 2 GB" },
            { label: "Storage", value: "50 GB NVMe + 250 GB object" },
            { label: "Bandwidth", value: "1 TB / mo" },
        ],
        cta: { label: "Start small", href: "/services/compute" },
    },
    {
        name: "Growing SaaS at 10k MAU",
        persona: "Funded startups, agencies",
        description: "App Platform, managed Postgres + Redis, preview envs, observability built in.",
        monthly: "$80",
        suffix: "–$140/mo",
        services: [
            { glyph: <PipelineIcon />, label: "App Platform" },
            { glyph: <DatabaseIcon />, label: "Managed Postgres" },
            { glyph: <DatabaseIcon />, label: "Redis" },
            { glyph: <BucketIcon />, label: "Object Storage" },
            { glyph: <EdgeIcon />, label: "CDN + WAF" },
        ],
        specs: [
            { label: "Compute", value: "3 replicas · 2 vCPU each" },
            { label: "Database", value: "4 GB Postgres + 1 GB Redis" },
            { label: "Bandwidth", value: "5 TB / mo + edge cache" },
        ],
        cta: { label: "Recommended", href: "/services/app-deployment" },
        featured: true,
    },
    {
        name: "Production e-commerce",
        persona: "Storefronts, marketplaces",
        description: "Sized for catalog growth and traffic spikes — HA database, dedicated cache.",
        monthly: "$220",
        suffix: "–$400/mo",
        services: [
            { glyph: <ComputeIcon />, label: "Performance VPS" },
            { glyph: <DatabaseIcon />, label: "HA Postgres" },
            { glyph: <DatabaseIcon />, label: "Redis cache" },
            { glyph: <BucketIcon />, label: "Object Storage" },
            { glyph: <EdgeIcon />, label: "CDN" },
            { glyph: <ShieldIcon />, label: "WAF + bots" },
        ],
        specs: [
            { label: "Compute", value: "8 vCPU · 16 GB + auto-scale" },
            { label: "Database", value: "HA pair · daily PITR backups" },
            { label: "Bandwidth", value: "10 TB / mo + image opt." },
        ],
        cta: { label: "Compose stack", href: "/contact" },
    },
    {
        name: "Multi-region enterprise",
        persona: "Compliance-bound teams",
        description: "Private networking, dedicated capacity, SOC 2, contractual SLAs.",
        monthly: "Custom",
        services: [
            { glyph: <ComputeIcon />, label: "Dedicated" },
            { glyph: <DatabaseIcon />, label: "Sharded DB" },
            { glyph: <BucketIcon />, label: "Multi-region storage" },
            { glyph: <EdgeIcon />, label: "Edge + cache" },
            { glyph: <ShieldIcon />, label: "Audit + SSO" },
            { glyph: <PipelineIcon />, label: "Pipelines" },
        ],
        specs: [
            { label: "Compute", value: "Dedicated capacity · multi-AZ" },
            { label: "Database", value: "Sharded · cross-region replicas" },
            { label: "Compliance", value: "SOC 2, audit logs, RBAC" },
        ],
        cta: { label: "Talk to sales", href: "/contact" },
    },
];

type FlowNode = {
    icon: React.ReactNode;
    label: string;
    sub: string;
};

const FLOW_CDN = "https://ahurasense.cs2hvh.com/images/2026-06";

const FLOW: FlowNode[] = [
    { icon: <Image src={`${FLOW_CDN}/y12g_eusQwWj.png`} alt="" width={42} height={42} className="h-[42px] w-[42px] object-contain" />, label: "Visitor", sub: "Anywhere" },
    { icon: <Image src={`${FLOW_CDN}/liLNO7z5heiO.png`} alt="" width={42} height={42} className="h-[42px] w-[42px] object-contain" />, label: "Edge POP", sub: "Static + cache" },
    { icon: <Image src={`${FLOW_CDN}/CwdsD58kLnBc.png`} alt="" width={42} height={42} className="h-[42px] w-[42px] object-contain" />, label: "WAF + TLS", sub: "OWASP, bots" },
    { icon: <Image src={`${FLOW_CDN}/GN9YEozIVoG7.png`} alt="" width={42} height={42} className="h-[42px] w-[42px] object-contain" />, label: "Load balancer", sub: "Health-aware" },
    { icon: <Image src={`${FLOW_CDN}/ttzRXIJack0D.png`} alt="" width={42} height={42} className="h-[42px] w-[42px] object-contain" />, label: "App replicas", sub: "Auto-scale" },
    { icon: <Image src={`${FLOW_CDN}/Z_ukRjroMpK2.png`} alt="" width={42} height={42} className="h-[42px] w-[42px] object-contain" />, label: "Database", sub: "Postgres + Redis" },
    { icon: <Image src={`${FLOW_CDN}/KaAn5Sb0oAt5.png`} alt="" width={42} height={42} className="h-[42px] w-[42px] object-contain" />, label: "Object store", sub: "Media, backups" },
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
        icon: <Image src={`${CDN}/IT0HPOLZ48VS.png`} alt="" width={32} height={32} className="h-full w-full object-contain" />,
        title: "Compute & App Platform",
        description: "VPS plus push-to-deploy App Platform side by side, on the same network. Bring a container, a repo, or roll your own.",
        role: "Runtime",
        capabilities: ["Push-to-deploy", "Any container", "Rolling deploys", "Root on VPS"],
    },
    {
        icon: <Image src={`${CDN}/7Tmz5-TnMRox.png`} alt="" width={32} height={32} className="h-full w-full object-contain" />,
        title: "Managed Postgres · MySQL · Redis",
        description: "Daily backups, point-in-time recovery, read replicas, and connection pooling — every primitive a real app expects.",
        role: "Data plane",
        capabilities: ["Postgres", "MySQL · MariaDB", "Redis HA", "PITR backups"],
    },
    {
        icon: <Image src={`${CDN}/2wq-DtD23WJ2.png`} alt="" width={32} height={32} className="h-full w-full object-contain" />,
        title: "Object storage",
        description: "S3-compatible. $5 for 250 GB, $0.01/GB after. Free egress inside the region — no surprises on the bill.",
        role: "Storage",
        capabilities: ["S3-compatible", "$5 / 250 GB", "Lifecycle rules", "Free in-region"],
    },
    {
        icon: <Image src={`${CDN}/X78vw4EKLTZW.png`} alt="" width={32} height={32} className="h-full w-full object-contain" />,
        title: "Global CDN & edge cache",
        description: "150+ POPs in front of every site and bucket. Smart invalidation, HTTP/3, brotli, image optimization included.",
        role: "Delivery",
        capabilities: ["150+ POPs", "HTTP/3 · Brotli", "Image optimization", "<10 s purge"],
    },
    {
        icon: <Image src={`${CDN}/Bd6sTPbEvba2.png`} alt="" width={32} height={32} className="h-full w-full object-contain" />,
        title: "TLS, WAF & DDoS protection",
        description: "Free wildcard certificates, automatic renewal, OWASP rule sets, bot scoring, and L3/L4 absorption at the edge.",
        role: "Security",
        capabilities: ["Free wildcard TLS", "OWASP rule sets", "Bot scoring", "L3/L4 absorption"],
    },
    {
        icon: <Image src={`${CDN}/7posUmmb_Y0k.png`} alt="" width={32} height={32} className="h-full w-full object-contain" />,
        title: "CI/CD with preview envs",
        description: "Push to deploy. Each branch gets a URL, env vars, and database. Promote a preview to production with one click.",
        role: "Pipeline",
        capabilities: ["Preview env / PR", "Per-branch URL", "One-click promote", "Auto-rollback"],
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
        glyph: <Image src={`${CDN}/m3y7JXyn1Pyl.png`} alt="" width={26} height={26} className="h-full w-full object-contain" />,
        metric: "Marketing",
        title: "High-traffic marketing sites",
        description: "Static-first builds, edge HTML caching, ISR for updates without a redeploy. Lighthouse 100s out of the box.",
    },
    {
        glyph: <Image src={`${CDN}/M54216erlpBQ.png`} alt="" width={26} height={26} className="h-full w-full object-contain" />,
        metric: "SaaS",
        title: "Multi-tenant SaaS platforms",
        description: "Per-tenant databases or shared schema, background workers, scheduled jobs, and a managed queue — same VPC.",
    },
    {
        glyph: <Image src={`${CDN}/Vh4k8CtnVjzC.png`} alt="" width={26} height={26} className="h-full w-full object-contain" />,
        metric: "Commerce",
        title: "Online stores and checkouts",
        description: "Object storage for product media, Postgres for catalog and orders, Redis for sessions and carts, CDN for the storefront.",
    },
    {
        glyph: <Image src={`${CDN}/hdepaV3zhhLG.png`} alt="" width={26} height={26} className="h-full w-full object-contain" />,
        metric: "CMS",
        title: "WordPress & headless content",
        description: "Sized memory for PHP-FPM, MySQL or MariaDB managed for you, S3 offload for media, edge cache that survives editorial spikes.",
    },
    {
        glyph: <Image src={`${CDN}/n3a2cxrGF0ta.png`} alt="" width={26} height={26} className="h-full w-full object-contain" />,
        metric: "API",
        title: "API backends & mobile origins",
        description: "Horizontally scaled compute behind a regional load balancer, rate limiting at the edge, observability you can read at a glance.",
    },
    {
        glyph: <Image src={`${CDN}/QBJNqd9uncI7.png`} alt="" width={26} height={26} className="h-full w-full object-contain" />,
        metric: "Internal",
        title: "Internal tools & admin apps",
        description: "Retool-style dashboards, status pages, admin consoles — IP-restricted, SSO-fronted, on the same pipeline as the main site.",
    },
];

const FAQS = [
    {
        question: "Can I bring an existing application?",
        answer:
            "Yes. The platform runs any OCI container, any common runtime (Node, Python, Ruby, Go, PHP, Java), and gives you root on VPS instances if you want full control. Migrations from Heroku, Vercel, AWS, DigitalOcean, and shared hosts are routine.",
    },
    {
        question: "How are domains and SSL handled?",
        answer:
            "Point your domain at the platform and a wildcard certificate is provisioned and renewed automatically. Custom certificates and apex domains over HTTPS are supported. There is no extra charge for TLS on any plan.",
    },
    {
        question: "What does the CDN actually cache?",
        answer:
            "Static assets are cached by default at 150+ edge POPs. HTML can be cached via headers or ISR. Bucket objects are served through the same edge. Invalidations propagate globally in under 10 seconds.",
    },
    {
        question: "Do you support zero-downtime deploys?",
        answer:
            "Yes. The App Platform performs rolling deploys behind a load balancer with health checks. Failed deploys roll back automatically. For VPS, blue-green deploys are scripted in a few lines of CI.",
    },
    {
        question: "How is bandwidth billed?",
        answer:
            "Every plan includes a generous monthly egress allowance. Traffic between services inside the same region is free. Overage is metered at standard CDN rates with no surprise minimums.",
    },
    {
        question: "Can the platform handle compliance and audits?",
        answer:
            "Enterprise plans include private networking, dedicated capacity, configurable backups, audit logs, role-based access, and SOC 2 reporting. Reach out to scope SLAs and contractual terms.",
    },
];

/* ──────────────────────────────────────────────────────────────
   Sections
   ────────────────────────────────────────────────────────────── */

function Workflows() {
    return (
        <section className="relative overflow-hidden bg-[#0D0D0F] py-20 sm:py-24 lg:py-28">
            <div aria-hidden className="absolute top-0 left-1/2 h-px w-[60%] -translate-x-1/2 bg-gradient-to-r from-transparent via-white/10 to-transparent" />

            <Container className="relative z-10">
                <div className="mx-auto max-w-[760px] text-center">
                    <p className={`${MONO} mb-5 inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-white/50`}>
                        <span className="h-1.5 w-1.5 rounded-full bg-[#0095FF]" />
                        What you can ship
                    </p>
                    <h2 className="text-3xl font-semibold leading-[1.05] tracking-[-0.02em] text-white sm:text-4xl lg:text-[46px]">
                        Four shapes of web workload. One pipeline.
                    </h2>
                    <p className="mx-auto mt-5 max-w-[620px] text-[15px] leading-[1.6] text-white/60 sm:text-[16.5px]">
                        From a marketing page to a multi-tenant SaaS — every shape uses
                        the same primitives, the same deploy flow, the same network.
                    </p>
                </div>

                <div className="mt-14 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-5">
                    {/* Feature card */}
                    <article
                        className="relative flex flex-col gap-6 overflow-hidden rounded-[10px] border border-white/[0.10] bg-gradient-to-br from-[#13161B] to-[#101216] p-8 sm:p-10"
                        style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05), 0 24px 60px -32px rgba(0,149,255,0.20)" }}
                    >
                        <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full bg-[#0095FF]/[0.08] blur-3xl" />
                        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.04]" style={{
                            backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,1) 1px, transparent 0)",
                            backgroundSize: "24px 24px",
                        }} />

                        <div className="relative flex items-start justify-between">
                            <span className={`${MONO} inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-[#0095FF]`}>
                                <span className="h-1.5 w-1.5 rounded-full bg-[#0095FF]" />
                                Most common
                            </span>
                            <span className={`${MONO} text-[10.5px] tabular-nums text-white/30`}>01</span>
                        </div>

                        <div className="relative">
                            <h3 className="text-[24px] font-semibold leading-[1.15] tracking-[-0.01em] text-white sm:text-[28px]">
                                {FEATURE.title}
                            </h3>
                            <p className="mt-3 max-w-[440px] text-[14px] leading-[1.6] text-white/65">
                                {FEATURE.description}
                            </p>
                        </div>

                        <div className="relative mt-auto h-[140px] overflow-hidden rounded-[8px] border border-white/[0.08] bg-white/[0.02] p-5 text-white/85">
                            {FEATURE.art("h-full w-full")}
                        </div>

                        <div className="relative flex flex-wrap gap-1.5 border-t border-white/[0.06] pt-5">
                            {FEATURE.tags.map((t) => (
                                <span key={t} className={`${MONO} inline-flex items-center rounded-[3px] border border-white/[0.10] bg-white/[0.03] px-2 py-0.5 text-[10px] uppercase tracking-[0.10em] text-white/65`}>
                                    {t}
                                </span>
                            ))}
                        </div>
                    </article>

                    {/* Sibling cards stacked */}
                    <div className="grid grid-cols-1 gap-4 lg:gap-5">
                        {WORKFLOWS.map((w, i) => (
                            <article
                                key={w.title}
                                className="group relative flex gap-5 overflow-hidden rounded-[8px] border border-white/[0.10] bg-[#111316] p-5 transition-colors hover:border-white/[0.22] hover:bg-[#13161B] sm:p-6"
                            >
                                <div className="relative shrink-0">
                                    <div className="flex h-[88px] w-[100px] items-center justify-center rounded-[6px] border border-white/[0.10] bg-white/[0.02] text-white/85">
                                        {w.art("h-[70%] w-[80%]")}
                                    </div>
                                </div>
                                <div className="flex min-w-0 flex-col">
                                    <div className="flex items-baseline justify-between gap-3">
                                        <h3 className="truncate text-[16px] font-semibold tracking-[-0.01em] text-white">{w.title}</h3>
                                        <span className={`${MONO} shrink-0 text-[10.5px] tabular-nums text-white/30`}>
                                            {String(i + 2).padStart(2, "0")}
                                        </span>
                                    </div>
                                    <p className="mt-1.5 text-[12.5px] leading-[1.55] text-white/60">{w.description}</p>
                                    <div className="mt-3 flex flex-wrap gap-1">
                                        {w.tags.map((t) => (
                                            <span key={t} className={`${MONO} inline-flex items-center rounded-[3px] border border-white/[0.08] bg-white/[0.02] px-1.5 py-0.5 text-[9.5px] uppercase tracking-[0.10em] text-white/55`}>
                                                {t}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </article>
                        ))}
                    </div>
                </div>
            </Container>
        </section>
    );
}

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
                        Request lifecycle
                    </p>
                    <h2 className="text-3xl font-semibold leading-[1.05] tracking-[-0.02em] text-white sm:text-4xl lg:text-[52px]">
                        Click to byte,{" "}
                        <span style={ACCENT_FONT} className="text-[#82adfb]">
                            in milliseconds.
                        </span>
                    </h2>
                </div>

                <div className="relative mx-auto mt-14 max-w-[1180px] overflow-x-auto">
                    <div className="relative flex min-w-[860px] items-stretch justify-between gap-4 px-2">
                        {/* Connecting line */}
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
                        { v: "<40ms", l: "Edge → origin" },
                        { v: "<10s", l: "Cache invalidation" },
                        { v: "Zero", l: "Egress in-region" },
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
                        Real stack shapes — pick the one that matches your workload.
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

                {/* Three compact alternatives */}
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
                        Compute to edge — one VPC, no cross-vendor egress.
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
                        Tuned for the sites teams{" "}
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
                                Plan your migration
                            </p>
                            <h2 className="text-3xl font-semibold leading-[1.05] tracking-[-0.02em] text-white sm:text-4xl lg:text-[42px]">
                                Walk us through the site. We&apos;ll size the stack.
                            </h2>
                            <p className="mt-4 max-w-[440px] text-[14.5px] leading-[1.6] text-white/60">
                                Send the framework, the database, the traffic shape, and
                                a launch date. We respond with a sized stack, a price,
                                and a migration plan.
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
                                href="/services/app-deployment"
                                className={`${MONO} inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-[5px] border border-white/[0.14] bg-transparent text-[11px] font-semibold uppercase tracking-[0.14em] text-white/75 transition-colors hover:border-white/35 hover:bg-white/[0.04] hover:text-white`}
                            >
                                Explore App Platform
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

export function WebHostingLanding() {
    return (
        <main className="bg-[#0D0D0F]">
            <ServiceHeroSection
                badge="Web Hosting & SaaS"
                title="Web infrastructure that stays up."
                description="VPS, App Platform, managed databases, object storage, CDN, and WAF — one network, one bill."
                primaryAction={{ label: "Talk to a solutions engineer", href: "/contact" }}
                secondaryAction={{ label: "Explore capabilities", href: "#stack" }}
                backgroundImage={{ src: assetUrl("/images/hero/service-hero-bg.png"), alt: "" }}
                illustration={{
                    src: assetUrl("/images/main-page/solution-home-web-host.png"),
                    alt: "Web hosting infrastructure",
                    priority: true,
                }}
            />
            <HeroStats metrics={HERO_STATS} eyebrow="Platform" />
            <RequestFlow />
            <Scenarios />
            <Stack />
            <Workloads />
            <ServicesHomeSectionFive title="Frequently asked questions" faqs={FAQS} />
        </main>
    );
}
