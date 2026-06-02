"use client";
import { assetUrl } from "@/lib/asset-url";

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

function WafIcon() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3} strokeLinejoin="round">
            <path d="M16 3l11 4v8c0 6.5-4.5 11.5-11 13.5C9.5 26.5 5 21.5 5 15V7l11-4z" fill="currentColor" fillOpacity="0.10" />
            <path d="M10.5 16.5L14 20l7.5-7.5" stroke="#0095FF" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function IamIcon() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            <circle cx="16" cy="10" r="5" fill="currentColor" fillOpacity="0.10" />
            <path d="M16 10a5 5 0 1 1 0-0.001" />
            <path d="M6 26c2-6 6.5-9 10-9s8 3 10 9" strokeLinecap="round" />
            <path d="M22 16h8M26 12v8" stroke="#0095FF" strokeLinecap="round" />
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

function AuditIcon() {
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

function ComplianceIcon() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            <rect x="5" y="3" width="22" height="26" rx="1.5" fill="currentColor" fillOpacity="0.08" />
            <path d="M5 9h22" />
            <path d="M9 14h7M9 18h10M9 22h6" strokeOpacity="0.5" />
            <circle cx="24" cy="22" r="4.5" fill="currentColor" fillOpacity="0.12" />
            <path d="M22 22l1.5 1.5L26 20" stroke="#0095FF" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function EncryptionIcon() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3} strokeLinejoin="round">
            <rect x="7" y="14" width="18" height="13" rx="1.5" fill="currentColor" fillOpacity="0.10" />
            <path d="M11 14v-3a5 5 0 0 1 10 0v3" />
            <circle cx="16" cy="21" r="2.5" fill="#0095FF" fillOpacity="0.30" stroke="#0095FF" />
            <path d="M16 23.5v2" stroke="#0095FF" strokeLinecap="round" />
        </svg>
    );
}

/* ──────── Defense-in-depth layer node icons ──────── */

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
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round">
            <path d="M4 26l5-9 5 4 6-12 5 7 3-4" strokeLinejoin="round" />
            <circle cx="9" cy="17" r="1.3" fill="currentColor" />
            <circle cx="25" cy="16" r="1.3" fill="#0095FF" />
            <path d="M3 29h26" strokeOpacity="0.3" />
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
function NodeIam() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4}>
            <circle cx="16" cy="11" r="4" fill="currentColor" fillOpacity="0.18" />
            <path d="M6 26c2-5 6.5-7.5 10-7.5s8 2.5 10 7.5" strokeLinecap="round" />
        </svg>
    );
}
function NodeVpc() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round">
            <rect x="5" y="8" width="22" height="16" rx="1.5" />
            <path d="M9 14h5M9 18h7" strokeOpacity="0.5" strokeLinecap="round" />
            <rect x="18" y="12" width="6" height="8" rx="0.5" fill="#0095FF" fillOpacity="0.25" stroke="#0095FF" />
        </svg>
    );
}
function NodeWorkload() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4}>
            <rect x="4" y="6" width="24" height="20" rx="1.5" />
            <path d="M4 12h24" />
            <circle cx="7.5" cy="9" r="0.7" fill="currentColor" />
            <path d="M9 9h5" strokeOpacity="0.4" />
            <path d="M9 17l3 3 8-8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}
function NodeAudit() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round">
            <rect x="5" y="5" width="22" height="22" rx="1.5" />
            <path d="M9 11h14M9 16h9M9 21h12" strokeOpacity="0.55" />
            <circle cx="24" cy="21" r="4" fill="currentColor" fillOpacity="0.18" />
            <path d="M22.5 21l1.5 1.5L26 19.5" strokeWidth={1.3} strokeLinejoin="round" />
        </svg>
    );
}

/* ──────── Workload glyphs (cream section) ──────── */

function ZeroTrustGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3} strokeLinejoin="round">
            <path d="M16 3l11 4v8c0 6.5-4.5 11.5-11 13.5C9.5 26.5 5 21.5 5 15V7l11-4z" fill="currentColor" fillOpacity="0.10" />
            <path d="M10.5 16.5L14 20l7.5-7.5" stroke="#0095FF" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function DdosGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            <circle cx="16" cy="16" r="11" strokeOpacity="0.30" />
            <circle cx="16" cy="16" r="7" strokeOpacity="0.55" />
            <circle cx="16" cy="16" r="3" fill="#0095FF" fillOpacity="0.30" stroke="#0095FF" />
            <path d="M16 5v4M16 23v4M5 16h4M23 16h4M8 8l3 3M21 21l3 3M8 24l3-3M21 11l3-3" strokeOpacity="0.40" strokeLinecap="round" />
        </svg>
    );
}

function SegmentGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3} strokeLinejoin="round">
            <rect x="3" y="3" width="11" height="11" rx="1" fill="currentColor" fillOpacity="0.10" />
            <rect x="18" y="3" width="11" height="11" rx="1" fill="#0095FF" fillOpacity="0.20" stroke="#0095FF" />
            <rect x="3" y="18" width="11" height="11" rx="1" fill="currentColor" fillOpacity="0.10" />
            <rect x="18" y="18" width="11" height="11" rx="1" fill="currentColor" fillOpacity="0.10" />
            <path d="M14 8.5h4M8.5 14v4M23.5 14v4M14 23.5h4" strokeOpacity="0.35" strokeDasharray="2 2" />
        </svg>
    );
}

function ComplianceGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            <rect x="5" y="3" width="22" height="26" rx="1.5" fill="currentColor" fillOpacity="0.08" />
            <path d="M5 9h22" />
            <path d="M9 14h7M9 18h10M9 22h6" strokeOpacity="0.5" />
            <circle cx="24" cy="22" r="4.5" fill="currentColor" fillOpacity="0.12" />
            <path d="M22 22l1.5 1.5L26 20" stroke="#0095FF" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function SiemGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="6" width="24" height="20" rx="1.5" fill="currentColor" fillOpacity="0.08" />
            <path d="M4 21l5-6 4 3 5-9 4 5 6-3" />
            <circle cx="18" cy="9" r="1.3" fill="#0095FF" />
            <circle cx="28" cy="11" r="1.3" fill="#0095FF" />
        </svg>
    );
}

function RbacGlyph() {
    return (
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.3}>
            <circle cx="16" cy="9" r="3.5" fill="currentColor" fillOpacity="0.10" />
            <circle cx="7" cy="22" r="3" fill="currentColor" fillOpacity="0.10" />
            <circle cx="16" cy="22" r="3" fill="#0095FF" fillOpacity="0.25" stroke="#0095FF" />
            <circle cx="25" cy="22" r="3" fill="currentColor" fillOpacity="0.10" />
            <path d="M16 12.5v6M16 12.5l-9 6M16 12.5l9 6" strokeOpacity="0.40" />
        </svg>
    );
}

/* ──────────────────────────────────────────────────────────────
   Data
   ────────────────────────────────────────────────────────────── */

const HERO_STATS = [
    { value: "L3–L7", label: "DDoS coverage" },
    { value: "SOC 2", label: "Compliance ready" },
    { value: "Zero trust", label: "Network model" },
    { value: "99.99%", label: "Uptime SLA" },
];

const DEFENSE_LAYERS = [
    { icon: <NodeEdge />, label: "Edge POP", sub: "Global POPs" },
    { icon: <NodeDdos />, label: "L3/L4 DDoS", sub: "Absorption" },
    { icon: <NodeWaf />, label: "WAF", sub: "OWASP + bots" },
    { icon: <NodeIam />, label: "IAM", sub: "mTLS + RBAC" },
    { icon: <NodeVpc />, label: "VPC", sub: "Private subnets" },
    { icon: <NodeWorkload />, label: "Workload", sub: "Least privilege" },
    { icon: <NodeAudit />, label: "Audit log", sub: "Immutable" },
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
        name: "Startup baseline hardening",
        persona: "Series A, small teams",
        description: "WAF, DDoS, TLS, and firewall rules on day one. No ops overhead.",
        monthly: "$25",
        suffix: "/mo",
        services: [
            { glyph: <WafIcon />, label: "WAF + DDoS" },
            { glyph: <VpcIcon />, label: "VPC firewall" },
            { glyph: <EncryptionIcon />, label: "TLS / Encryption" },
        ],
        specs: [
            { label: "Coverage", value: "L3–L7 DDoS + WAF" },
            { label: "TLS", value: "Wildcard, auto-renew" },
            { label: "Firewall", value: "IP rules + rate limits" },
        ],
        cta: { label: "Start secure", href: "/services/security" },
    },
    {
        name: "SOC 2 compliance migration",
        persona: "Regulated SaaS, audit-bound teams",
        description: "Zero-trust proxies, VPC isolation, SIEM integration, RBAC, and immutable audit logs.",
        monthly: "$180",
        suffix: "–$320/mo",
        services: [
            { glyph: <WafIcon />, label: "WAF Pro" },
            { glyph: <IamIcon />, label: "IAM + mTLS" },
            { glyph: <VpcIcon />, label: "VPC isolation" },
            { glyph: <AuditIcon />, label: "SIEM + audit" },
            { glyph: <ComplianceIcon />, label: "Compliance ctrl" },
        ],
        specs: [
            { label: "Network", value: "VPC · private subnets · mTLS" },
            { label: "Identity", value: "SSO · RBAC · least-privilege" },
            { label: "Compliance", value: "SOC 2 · PCI DSS controls" },
        ],
        cta: { label: "Recommended", href: "/contact" },
        featured: true,
    },
    {
        name: "Enterprise multi-tenant",
        persona: "Enterprise, global teams",
        description: "Multi-region VPC peering, SAML SSO, fine-grained RBAC, and contractual SLAs.",
        monthly: "$450",
        suffix: "–$900/mo",
        services: [
            { glyph: <WafIcon />, label: "WAF enterprise" },
            { glyph: <IamIcon />, label: "SAML SSO" },
            { glyph: <VpcIcon />, label: "Multi-region VPC" },
            { glyph: <AuditIcon />, label: "SIEM" },
            { glyph: <EncryptionIcon />, label: "Encryption at rest" },
        ],
        specs: [
            { label: "Network", value: "Multi-region · VPC peering" },
            { label: "Identity", value: "SAML · OIDC · fine-grained IAM" },
            { label: "Compliance", value: "SOC 2 · PCI DSS · audit exports" },
        ],
        cta: { label: "Compose stack", href: "/contact" },
    },
    {
        name: "Custom enterprise",
        persona: "Critical infra, defense",
        description: "Dedicated capacity, air-gapped segments, custom SLAs, and on-site review.",
        monthly: "Custom",
        services: [
            { glyph: <WafIcon />, label: "Custom WAF" },
            { glyph: <IamIcon />, label: "Dedicated IAM" },
            { glyph: <VpcIcon />, label: "Air-gapped VPC" },
            { glyph: <AuditIcon />, label: "Full SIEM" },
            { glyph: <ComplianceIcon />, label: "Dedicated compliance" },
        ],
        specs: [
            { label: "Isolation", value: "Dedicated · air-gapped segments" },
            { label: "Compliance", value: "Custom audit + on-site review" },
            { label: "SLA", value: "Contractual · dedicated CSM" },
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
        icon: <WafIcon />,
        title: "WAF & DDoS protection",
        description: "Layer 3–7 DDoS absorption at the edge. OWASP managed rule sets, bot scoring, rate limiting, and geo-blocking — configured and updated without touching your origin.",
        role: "Edge defense",
        capabilities: ["L3/L4 absorption", "OWASP rules", "Bot scoring", "Geo-blocking"],
    },
    {
        icon: <IamIcon />,
        title: "Identity & access management",
        description: "SSO with SAML/OIDC, MFA enforcement, role-based access, and per-resource API keys. Least-privilege posture enforced at the platform level.",
        role: "Identity",
        capabilities: ["SAML / OIDC", "MFA enforcement", "RBAC", "API key scoping"],
    },
    {
        icon: <VpcIcon />,
        title: "VPC & network segmentation",
        description: "Private subnets, security groups, and microsegmentation keep workloads isolated. Services communicate over a private network — no public internet exposure required.",
        role: "Network",
        capabilities: ["Private subnets", "Security groups", "VPC peering", "mTLS mesh"],
    },
    {
        icon: <ComplianceIcon />,
        title: "Compliance controls",
        description: "SOC 2 controls and PCI DSS scoping built in. Continuous posture monitoring with audit logging and evidence collection for your compliance cycles.",
        role: "Compliance",
        capabilities: ["SOC 2 controls", "PCI DSS scope", "Audit logging", "Evidence exports"],
    },
    {
        icon: <AuditIcon />,
        title: "SIEM & immutable audit logs",
        description: "Every API call, auth event, and configuration change is written to an immutable, tamper-evident log. Route events to your SIEM via webhook or log export.",
        role: "Observability",
        capabilities: ["Immutable logs", "SIEM webhook", "Alert rules", "Retention policy"],
    },
    {
        icon: <EncryptionIcon />,
        title: "Encryption at rest and in transit",
        description: "AES-256 encryption for all volumes and object storage. Free wildcard TLS with automatic renewal. Customer-managed keys available on enterprise plans.",
        role: "Cryptography",
        capabilities: ["AES-256 at rest", "Free wildcard TLS", "mTLS in-cluster", "CMK option"],
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
        glyph: <ZeroTrustGlyph />,
        metric: "Zero trust",
        title: "Zero-trust architecture",
        description: "Identity-aware proxies enforce mTLS between every service. No implicit trust based on network position — every request is authenticated and authorized.",
    },
    {
        glyph: <DdosGlyph />,
        metric: "DDoS",
        title: "Advanced WAF & DDoS mitigation",
        description: "Layer 3–7 mitigation absorbs volumetric floods before they reach the origin. OWASP rule sets and bot management handle application-layer threats.",
    },
    {
        glyph: <SegmentGlyph />,
        metric: "Segmentation",
        title: "Network segmentation & microsegmentation",
        description: "VPC isolation, private subnets, security groups, and service-level microsegmentation prevent lateral movement between workloads.",
    },
    {
        glyph: <ComplianceGlyph />,
        metric: "Compliance",
        title: "Compliance controls",
        description: "SOC 2 and PCI DSS controls built in with continuous monitoring and audit logging. Evidence collection for your compliance and security review cycles.",
    },
    {
        glyph: <SiemGlyph />,
        metric: "SIEM",
        title: "SIEM & audit logging",
        description: "Centralized event management with immutable, tamper-evident audit trails. Real-time alerting and SIEM export via webhook or log stream.",
    },
    {
        glyph: <RbacGlyph />,
        metric: "IAM",
        title: "Identity & access management",
        description: "SSO, MFA, RBAC, and fine-grained API key scoping. SAML and OIDC federation with your existing identity provider.",
    },
];

const FAQS = [
    {
        question: "What compliance frameworks are supported?",
        answer:
            "The platform provides SOC 2 controls and PCI DSS scoping out of the box. Enterprise plans include formal compliance documentation, dedicated review sessions, and automated evidence collection for audit cycles.",
    },
    {
        question: "How does zero-trust networking work in practice?",
        answer:
            "Every service-to-service call is authenticated via mTLS. Identity-aware proxies enforce policy at the API level regardless of network location. Workloads can communicate over private VPC without public internet exposure.",
    },
    {
        question: "What does DDoS protection actually absorb?",
        answer:
            "L3/L4 volumetric and protocol attacks are absorbed at the edge before they reach origin infrastructure. WAF rules handle L7 application attacks — SQL injection, XSS, CSRF. Bot scoring filters automated traffic based on behavioral signals.",
    },
    {
        question: "Are audit logs tamper-evident?",
        answer:
            "Yes. All API calls, authentication events, and configuration changes are written to an immutable log store with cryptographic chaining. Logs can be exported to your SIEM in real time or retained based on your plan.",
    },
    {
        question: "Can I bring my own encryption keys?",
        answer:
            "Enterprise plans support customer-managed keys (CMK) via an external KMS integration. Volume encryption and object storage encryption use AES-256. Wildcard TLS certificates are provisioned automatically and renewed without downtime.",
    },
    {
        question: "How is IAM scoped between teams?",
        answer:
            "Projects provide hard resource isolation. RBAC roles define what each identity can read, write, or administer within a project. API keys are scoped to specific services and resources. SSO via SAML or OIDC federates your existing directory.",
    },
];

/* ──────────────────────────────────────────────────────────────
   Sections
   ────────────────────────────────────────────────────────────── */

function DefenseLayers() {
    return (
        <section className="relative overflow-hidden bg-[#0D0D0F] py-20 sm:py-24 lg:py-28">
            <div aria-hidden className="absolute top-0 left-1/2 h-px w-[60%] -translate-x-1/2 bg-gradient-to-r from-transparent via-white/10 to-transparent" />

            <Aurora intensity="medium" />
            <Eclipse position="top" size={780} intensity={0.10} blur={90} />

            <Container className="relative z-10">
                <div className="mx-auto max-w-[760px] text-center">
                    <p className={`${MONO} mb-5 inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-white/50`}>
                        <span className="h-1.5 w-1.5 rounded-full bg-[#0095FF]" />
                        Defense in depth
                    </p>
                    <h2 className="text-3xl font-semibold leading-[1.05] tracking-[-0.02em] text-white sm:text-4xl lg:text-[52px]">
                        Seven layers,{" "}
                        <span style={ACCENT_FONT} className="text-[#82adfb]">
                            zero implicit trust.
                        </span>
                    </h2>
                    <p className="mx-auto mt-5 max-w-[580px] text-[15px] leading-[1.6] text-white/55 sm:text-[16.5px]">
                        Every request traverses multiple security controls before reaching a workload. Perimeter, network, identity, and audit layers working in concert.
                    </p>
                </div>

                <div className="relative mx-auto mt-14 max-w-[1180px] overflow-x-auto">
                    <div className="relative flex min-w-[860px] items-stretch justify-between gap-4 px-2">
                        <div aria-hidden className="pointer-events-none absolute left-[4%] right-[4%] top-[44px] h-px bg-gradient-to-r from-white/0 via-white/20 to-white/0" />
                        <div aria-hidden className="pointer-events-none absolute left-[4%] right-[4%] top-[44px] h-px overflow-hidden">
                            <span className="absolute -left-10 top-0 h-px w-24 bg-gradient-to-r from-transparent via-[#0095FF] to-transparent animate-[flowdash_3.6s_linear_infinite]" />
                        </div>

                        {DEFENSE_LAYERS.map((n, i) => (
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
                        { v: "L3–L7", l: "DDoS coverage" },
                        { v: "Zero", l: "Implicit trust" },
                        { v: "100%", l: "Traffic encrypted" },
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
                        Real posture levels — pick the one that matches your compliance requirements and team size.
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
                            Security controls
                        </p>
                        <h2 className="text-3xl font-semibold leading-[1.05] tracking-[-0.02em] text-white sm:text-4xl lg:text-[48px]">
                            Six controls.{" "}
                            <span style={ACCENT_FONT} className="text-[#82adfb]">
                                One security posture.
                            </span>
                        </h2>
                    </div>
                    <p className="max-w-[360px] text-[14.5px] leading-[1.65] text-white/55">
                        Edge to audit — defense in depth without stitching together multiple vendors.
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
                        Security patterns
                    </p>
                    <h2 className="text-3xl font-semibold leading-[1.05] tracking-[-0.02em] text-[#1A1814] sm:text-4xl lg:text-[48px]">
                        Built for the threats{" "}
                        <span style={ACCENT_FONT} className="text-[#0066B3]">
                            teams actually face.
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
                                Plan your security posture
                            </p>
                            <h2 className="text-3xl font-semibold leading-[1.05] tracking-[-0.02em] text-white sm:text-4xl lg:text-[42px]">
                                Walk us through your threat model. We&apos;ll scope the controls.
                            </h2>
                            <p className="mt-4 max-w-[440px] text-[14.5px] leading-[1.6] text-white/60">
                                Share your compliance requirements, workload sensitivity, and team size. We respond with a security architecture, a control list, and a scoped price.
                            </p>
                        </div>

                        <div className="flex flex-col gap-3">
                            <Link
                                href="/contact"
                                className={`${MONO} inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-[5px] border border-white bg-white text-[11px] font-semibold uppercase tracking-[0.14em] text-black transition-colors hover:bg-white/90`}
                            >
                                Talk to a security engineer
                                <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                            <Link
                                href="/services/security"
                                className={`${MONO} inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-[5px] border border-white/[0.14] bg-transparent text-[11px] font-semibold uppercase tracking-[0.14em] text-white/75 transition-colors hover:border-white/35 hover:bg-white/[0.04] hover:text-white`}
                            >
                                Explore security service
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

export function SecurityLanding() {
    return (
        <main className="bg-[#0D0D0F]">
            <ServiceHeroSection
                badge="Secure Enterprise Cloud"
                title="Defense in depth for modern workloads."
                description="WAF, DDoS, zero-trust networking, identity controls, compliance automation, and immutable audit logs — one security posture, one provider."
                primaryAction={{ label: "Talk to a security engineer", href: "/contact" }}
                secondaryAction={{ label: "Explore controls", href: "#stack" }}
                backgroundImage={{ src: assetUrl("/images/hero/service-hero-bg.png"), alt: "" }}
                illustration={{
                    src: assetUrl("/images/main-page/solution-home-security.png"),
                    alt: "Enterprise security infrastructure",
                    priority: true,
                }}
            />
            <HeroStats metrics={HERO_STATS} eyebrow="Security platform" />
            <DefenseLayers />
            <Scenarios />
            <Stack />
            <Workloads />
            <ServicesHomeSectionFive title="Frequently asked questions" faqs={FAQS} />
            <FinalCta />
        </main>
    );
}
