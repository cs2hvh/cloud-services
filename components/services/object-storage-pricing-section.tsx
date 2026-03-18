"use client";

import { useState } from "react";
import {
  ArrowRight,
  Check,
  Database,
  HardDrive,
  Shield,
  Zap,
  Box,
  Building2,
  Archive,
} from "lucide-react";
import { Container } from "@/components/ui/container";
import { StarsBackground } from "@/components/ui/stars-background";
import { Spotlight } from "@/components/ui/spotlight";

interface Plan {
  storage: string;
  priceStorage: number | string;
  priceTransfer: number | string;
  retrievalFee?: number;
  retrievalTime?: string;
  sla?: string;
  free?: boolean;
}

interface StorageCategory {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tagline: string;
  description: string;
  features: string[];
  plans: Plan[];
}

/* ─── Stat Strip ─── */
const STATS = [
  { value: "99.999%", label: "Durability" },
  { value: "< 100ms", label: "Latency" },
  { value: "Unlimited", label: "Objects" },
  { value: "12", label: "Regions" },
  { value: "S3", label: "Compatible" },
];

/* ─── Storage Categories ─── */
const FALLBACK_CATEGORIES: StorageCategory[] = [
  {
    key: "standard",
    label: "Standard",
    icon: Database,
    tagline: "From $0.02/GB",
    description:
      "High-performance object storage for frequently accessed data. Perfect for active applications, content delivery, and backups.",
    features: [
      "Instant data retrieval",
      "99.999% durability",
      "S3-compatible API",
      "Free egress to CDN",
    ],
    plans: [
      { storage: "0 - 50 GB", priceStorage: 0.025, priceTransfer: 0.09, free: true },
      { storage: "50 - 500 GB", priceStorage: 0.023, priceTransfer: 0.08 },
      { storage: "500 GB - 5 TB", priceStorage: 0.021, priceTransfer: 0.07 },
      { storage: "5 - 50 TB", priceStorage: 0.019, priceTransfer: 0.06 },
      { storage: "50 TB+", priceStorage: 0.017, priceTransfer: 0.05 },
    ],
  },
  {
    key: "infrequent",
    label: "Infrequent Access",
    icon: Archive,
    tagline: "From $0.01/GB",
    description:
      "Cost-effective storage for data accessed less frequently. Automatic retrieval with slightly higher access costs.",
    features: [
      "Lower storage costs",
      "Lifecycle automation",
      "Retrieval fee applies",
      "Same durability SLA",
    ],
    plans: [
      { storage: "0 - 100 GB", priceStorage: 0.015, priceTransfer: 0.09, retrievalFee: 0.01 },
      { storage: "100 GB - 1 TB", priceStorage: 0.013, priceTransfer: 0.08, retrievalFee: 0.01 },
      { storage: "1 - 10 TB", priceStorage: 0.011, priceTransfer: 0.07, retrievalFee: 0.01 },
      { storage: "10 - 100 TB", priceStorage: 0.009, priceTransfer: 0.06, retrievalFee: 0.01 },
      { storage: "100 TB+", priceStorage: 0.007, priceTransfer: 0.05, retrievalFee: 0.01 },
    ],
  },
  {
    key: "glacier",
    label: "Archive",
    icon: Box,
    tagline: "From $0.004/GB",
    description:
      "Long-term archival storage for compliance and cold data. Minutes to hours retrieval time with lowest per-GB pricing.",
    features: [
      "Ultra-low storage cost",
      "Compliance features",
      "Flexible retrieval options",
      "Object lock support",
    ],
    plans: [
      { storage: "0 - 1 TB", priceStorage: 0.005, priceTransfer: 0.09, retrievalTime: "5-12 hours" },
      { storage: "1 - 10 TB", priceStorage: 0.0045, priceTransfer: 0.08, retrievalTime: "5-12 hours" },
      { storage: "10 - 100 TB", priceStorage: 0.004, priceTransfer: 0.07, retrievalTime: "5-12 hours" },
      { storage: "100 TB - 1 PB", priceStorage: 0.0035, priceTransfer: 0.06, retrievalTime: "5-12 hours" },
      { storage: "1 PB+", priceStorage: 0.003, priceTransfer: 0.05, retrievalTime: "5-12 hours" },
    ],
  },
  {
    key: "enterprise",
    label: "Enterprise",
    icon: Building2,
    tagline: "Custom Pricing",
    description:
      "Dedicated infrastructure with SLA, priority support, and volume discounts. Tailored for large-scale deployments.",
    features: [
      "Dedicated tenancy",
      "99.99% uptime SLA",
      "24/7 priority support",
      "Custom integrations",
    ],
    plans: [
      { storage: "10 - 100 TB", priceStorage: "Custom", priceTransfer: "Custom", sla: "99.99%" },
      { storage: "100 TB - 1 PB", priceStorage: "Custom", priceTransfer: "Custom", sla: "99.99%" },
      { storage: "1 - 10 PB", priceStorage: "Custom", priceTransfer: "Custom", sla: "99.995%" },
      { storage: "10 PB+", priceStorage: "Custom", priceTransfer: "Custom", sla: "99.995%" },
      { storage: "Contact Sales", priceStorage: "Volume", priceTransfer: "Discounts", sla: "Custom" },
    ],
  },
];

interface ObjectStoragePricingSectionProps {
  categories?: StorageCategory[];
}

export default function ObjectStoragePricingSection({ categories = FALLBACK_CATEGORIES }: ObjectStoragePricingSectionProps) {
  const [activeKey, setActiveKey] = useState("standard");
  const active = categories.find((c) => c.key === activeKey)!;
  const isEnterprise = active.key === "enterprise";
  const hasRetrieval = active.key === "infrequent";
  const isArchive = active.key === "glacier";

  return (
    <section className="relative z-10 py-16 lg:py-24">
      <div className="absolute inset-0 -z-10 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-black" />

        {/* Animated starfield */}
        <StarsBackground starCount={120} className="z-0" />

        {/* Spotlight beam from top-left */}
        <Spotlight
          className="-top-40 -left-10 md:-left-32 md:-top-20"
          fill="#0095FF"
        />

        {/* Colour wash so stars sit on a tinted base */}
        <div className="absolute top-0 left-1/4 w-[50%] h-[60%] rounded-full bg-[#0095FF]/[0.04] blur-[160px]" />
        <div className="absolute bottom-0 right-1/4 w-[40%] h-[50%] rounded-full bg-[#4338ca]/[0.035] blur-[140px]" />

        {/* Top edge line */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[60%] h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>

      <Container>
        {/* ═══════════ SECTION 1: STORAGE HIGHLIGHTS ═══════════ */}
        <div className="text-center mb-12 lg:mb-16">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-[400] tracking-tight leading-[1.1] text-white">
            Enterprise Object Storage,{" "}
            <span className="text-[#0095FF]">Simple Pricing</span>
          </h2>
          <p className="mt-4 mx-auto max-w-2xl text-sm lg:text-base leading-relaxed text-white/40">
            S3-compatible object storage with 99.999% durability, lifecycle automation, and built-in CDN — pay only for what you use.
          </p>
        </div>

        {/* Stat strip — no boxes */}
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 mb-14 lg:mb-16">
          {STATS.map((s, i) => (
            <div key={s.label} className="flex items-center gap-10">
              <div className="flex items-baseline gap-2">
                <span className="text-[28px] lg:text-[36px] font-[600] text-[#0095FF] tabular-nums tracking-tight leading-none">
                  {s.value}
                </span>
                <span className="text-[13px] text-white/40 font-medium">{s.label}</span>
              </div>
              {i < STATS.length - 1 && (
                <div className="hidden sm:block h-8 w-px bg-white/[0.08]" />
              )}
            </div>
          ))}
        </div>

        {/* ═══════════ SECTION 2: STORAGE TIER PICKER ═══════════ */}
        <div className="mb-8 lg:mb-10">
          <h3 className="text-2xl sm:text-3xl lg:text-4xl font-[400] tracking-tight text-white">
            Choose Your{" "}
            <span className="text-[#0095FF]">Storage Tier</span>
          </h3>
          <p className="mt-2 text-sm text-white/40 max-w-lg">
            4 storage tiers optimized for different access patterns — from hot data to cold archival storage.
          </p>
        </div>

        {/* Category tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-12">
          {categories.map((cat) => {
            const isActive = cat.key === activeKey;
            const Icon = cat.icon;
            return (
              <button
                key={cat.key}
                type="button"
                onClick={() => setActiveKey(cat.key)}
                className={`cursor-pointer relative flex flex-col items-start gap-2 p-4 text-left transition-all duration-200 border ${
                  isActive
                    ? "border-[#0095FF]/40 bg-[#0095FF]/[0.06]"
                    : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.03]"
                }`}
              >
                {isActive && (
                  <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#0095FF]" />
                )}
                <Icon className={`w-5 h-5 ${isActive ? "text-[#0095FF]" : "text-white/30"}`} />
                <span className={`text-[13px] font-medium leading-tight ${isActive ? "text-white" : "text-white/60"}`}>
                  {cat.label}
                </span>
                <span className={`text-[11px] ${isActive ? "text-[#0095FF]" : "text-white/25"}`}>
                  {cat.tagline}
                </span>
              </button>
            );
          })}
        </div>

        {/* Active category detail card */}
        <div className="border border-white/[0.08] bg-white/[0.015] p-6 lg:p-8 mb-6">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
            <div className="max-w-[520px]">
              <h4 className="text-lg lg:text-xl font-[500] text-white mb-2">
                {active.label}
              </h4>
              <p className="text-[14px] leading-[1.7] text-white/45">
                {active.description}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2.5 shrink-0">
              {active.features.map((f) => (
                <div key={f} className="flex items-center gap-2.5">
                  <Check className="w-3.5 h-3.5 text-[#0095FF] shrink-0" />
                  <span className="text-[13px] text-white/55">{f}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Pricing Table ── */}
        <div className="border border-white/[0.08] overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="bg-white/[0.02]">
                {(isEnterprise
                  ? ["Storage Volume", "Storage Cost", "Transfer Cost", "SLA", ""]
                  : hasRetrieval
                  ? ["Storage Volume", "Storage Cost", "Transfer Cost", "Retrieval Fee", ""]
                  : isArchive
                  ? ["Storage Volume", "Storage Cost", "Transfer Cost", "Retrieval Time", ""]
                  : ["Storage Volume", "Storage Cost", "Transfer Cost", "", ""]
                ).map((h, idx) => (
                  <th key={`${h}-${idx}`} className="px-6 py-4 text-left text-[11px] font-medium text-white/25 uppercase tracking-[0.12em] border-b border-white/[0.06]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {active.plans.map((plan: Plan, i: number) => (
                <tr
                  key={`${active.key}-${plan.storage}`}
                  className={`transition-colors duration-150 hover:bg-white/[0.02] ${
                    i % 2 === 0 ? "bg-transparent" : "bg-white/[0.01]"
                  } ${i < active.plans.length - 1 ? "border-b border-white/[0.04]" : ""}`}
                >
                  <td className="px-6 py-5">
                    <span className="text-[15px] font-[500] text-white">{plan.storage}</span>
                    {plan.free && (
                      <span className="ml-2 text-[10px] text-[#0095FF] border border-[#0095FF]/30 px-1.5 py-0.5 rounded">FREE</span>
                    )}
                  </td>
                  <td className="px-6 py-5">
                    {typeof plan.priceStorage === "number" ? (
                      <>
                        <span className="text-[16px] font-[600] text-white tabular-nums">${plan.priceStorage}</span>
                        <span className="text-[12px] text-white/25 ml-0.5">/GB·mo</span>
                      </>
                    ) : (
                      <span className="text-[15px] text-white/55">{plan.priceStorage}</span>
                    )}
                  </td>
                  <td className="px-6 py-5">
                    {typeof plan.priceTransfer === "number" ? (
                      <>
                        <span className="text-[16px] font-[600] text-white tabular-nums">${plan.priceTransfer}</span>
                        <span className="text-[12px] text-white/25 ml-0.5">/GB</span>
                      </>
                    ) : (
                      <span className="text-[15px] text-white/55">{plan.priceTransfer}</span>
                    )}
                  </td>
                  {hasRetrieval && (
                    <td className="px-6 py-5">
                      {plan.retrievalFee ? (
                        <>
                          <span className="text-[15px] text-white/55 tabular-nums">${plan.retrievalFee}</span>
                          <span className="text-[12px] text-white/25 ml-0.5">/GB</span>
                        </>
                      ) : (
                        <span className="text-[15px] text-white/55">—</span>
                      )}
                    </td>
                  )}
                  {isArchive && (
                    <td className="px-6 py-5 text-[13px] text-white/55">{plan.retrievalTime}</td>
                  )}
                  {isEnterprise && (
                    <td className="px-6 py-5 text-[13px] text-white/55">{plan.sla}</td>
                  )}
                  <td className="px-6 py-5 text-right">
                    <a
                      href={isEnterprise && plan.storage === "Contact Sales" ? "/contact" : "/signup"}
                      className="cursor-pointer inline-flex items-center gap-2 bg-white text-black px-5 py-2 text-[13px] font-medium hover:bg-white/90 transition-colors"
                    >
                      {isEnterprise && plan.storage === "Contact Sales" ? "Contact Sales" : "Get Started"}
                      <ArrowRight className="w-3.5 h-3.5" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Included With Every Bucket ── */}
        <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { label: "Versioning", icon: Database },
            { label: "Lifecycle Rules", icon: Zap },
            { label: "Encryption", icon: Shield },
            { label: "CDN Ready", icon: HardDrive },
            { label: "IAM Controls", icon: Shield },
            { label: "99.999% SLA", icon: Check },
            { label: "S3 Compatible", icon: Box },
          ].map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-2.5 border border-white/[0.06] bg-white/[0.015] px-4 py-3"
            >
              <item.icon className="w-3.5 h-3.5 text-[#0095FF]/70 shrink-0" />
              <span className="text-[12px] font-medium text-white/45">{item.label}</span>
            </div>
          ))}
        </div>

        {/* ── CTA ── */}
        <div className="mt-12 flex flex-col items-center">
          <a
            href="/signup"
            className="cursor-pointer inline-flex items-center justify-center gap-2.5 bg-white text-black px-10 h-12 text-[15px] font-[500] hover:bg-white/90 transition-colors"
          >
            Start Storing Objects Today
            <ArrowRight className="w-4.5 h-4.5" />
          </a>
          <p className="mt-4 text-[13px] text-white/30">
            No credit card required &middot; 50 GB free tier included
          </p>
        </div>
      </Container>
    </section>
  );
}
