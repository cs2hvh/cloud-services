"use client";

import { assetUrl } from "@/lib/asset-url";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  Globe,
} from "lucide-react";
import { Container } from "@/components/ui/container";
import WorldMap from "@/components/ui/worldmap";
import { AuthAwareServiceCta } from "@/components/services/auth-aware-service-cta";

interface VirtualPlan {
  vcpu: number;
  ram: string;
  storage: string;
  bandwidth: string;
  price: number;
}

interface BareMetalPlan {
  processor: string;
  cores: string;
  ram: string;
  storage: string;
  bandwidth: string;
  network: string;
  price: number;
}

interface ComputeCategory {
  key: string;
  label: string;
  tagline: string;
  description: string;
  features: string[];
  isBareMetalCategory?: boolean;
  plans: (VirtualPlan | BareMetalPlan)[];
}

const CATEGORY_META: Record<
  string,
  {
    audience: string;
    cpuProfile: string;
    summary: string;
  }
> = {
  shared: {
    audience: "Dev environments, prototypes, low-traffic workloads",
    cpuProfile: "Burstable shared AMD vCPU",
    summary: "Low-cost entry instances with flexible burst capacity.",
  },
  dedicated: {
    audience: "Production apps, APIs, and business-critical services",
    cpuProfile: "Guaranteed dedicated AMD threads",
    summary: "Consistent compute for steady traffic and predictable performance.",
  },
  // Keys match the real Linode classes in COMPUTE_TIERS. They previously
  // described "compute", "memory" and "storage" tiers that do not exist.
  highmem: {
    audience: "Redis, Postgres, Elasticsearch, analytics",
    cpuProfile: "High RAM-to-vCPU ratio",
    summary: "Memory-dense profiles for caches, databases, and in-memory systems.",
  },
  premium: {
    audience: "Latency-sensitive production workloads",
    cpuProfile: "Newest-generation AMD EPYC™",
    summary: "Highest single-thread throughput with a guaranteed baseline.",
  },
  baremetal: {
    audience: "High-density workloads, virtualization, custom stacks",
    cpuProfile: "Dedicated physical hardware",
    summary: "Full hardware access with no hypervisor layer in the way.",
  },
};

const AVAILABLE_REGIONS = [
  {
    continent: "Americas",
    locations: [
      { city: "San Francisco", flag: "us" },
      { city: "Los Angeles", flag: "us" },
      { city: "New York", flag: "us" },
      { city: "Sao Paulo", flag: "br" },
    ],
  },
  {
    continent: "Europe",
    locations: [
      { city: "London", flag: "gb" },
      { city: "Paris", flag: "fr" },
      { city: "Frankfurt", flag: "de" },
      { city: "Amsterdam", flag: "nl" },
      { city: "Stockholm", flag: "se" },
      { city: "Madrid", flag: "es" },
    ],
  },
  {
    continent: "Asia",
    locations: [
      { city: "Mumbai", flag: "in" },
      { city: "Dubai", flag: "ae" },
      { city: "Singapore", flag: "sg" },
      { city: "Tokyo", flag: "jp" },
    ],
  },
  {
    continent: "Oceania",
    locations: [{ city: "Sydney", flag: "au" }],
  },
];

const POP_LOCATIONS = [
  { lat: 37.7749, lng: -122.4194, label: "San Francisco" },
  { lat: 40.7128, lng: -74.006, label: "New York" },
  { lat: 34.0522, lng: -118.2437, label: "Los Angeles" },
  { lat: -23.5505, lng: -46.6333, label: "Sao Paulo" },
  { lat: 51.5074, lng: -0.1278, label: "London" },
  { lat: 48.8566, lng: 2.3522, label: "Paris" },
  { lat: 50.1109, lng: 8.6821, label: "Frankfurt" },
  { lat: 52.3676, lng: 4.9041, label: "Amsterdam" },
  { lat: 59.3293, lng: 18.0686, label: "Stockholm" },
  { lat: 40.4168, lng: -3.7038, label: "Madrid" },
  { lat: 19.076, lng: 72.8777, label: "Mumbai" },
  { lat: 25.2048, lng: 55.2708, label: "Dubai" },
  { lat: 1.3521, lng: 103.8198, label: "Singapore" },
  { lat: 35.6762, lng: 139.6503, label: "Tokyo" },
  { lat: -33.8688, lng: 151.2093, label: "Sydney" },
];

const REGION_ACCENTS: Record<string, string> = {
  Americas: "bg-white",
  Europe: "bg-white/72",
  Asia: "bg-white/60",
  Oceania: "bg-white/50",
};

const VIRTUAL_PLAN_NAMES = ["Starter", "Basic", "Growth", "Scale", "Power", "Max"];
const BARE_METAL_PLAN_NAMES = [
  "Launch",
  "Builder",
  "Production",
  "High Core",
  "Enterprise",
  "Max Density",
];

// The hand-written plan table that used to live here has been removed.
//
// It disagreed with the deploy wizard on every plan ($6 vs $5.40, $12 vs
// $12.96, $24 vs $25.92, $48 vs $51.84) and advertised "Compute Optimized" and
// "Storage Optimized" tiers that are not Linode classes, so nothing behind
// them could be bought. Prices now come from getComputeCategories(), which
// runs the same resolver as checkout.
//
// There is deliberately no fallback: if the catalog cannot be read the section
// says so, because a stale price on a public page is the bug this replaced.

interface ComputePricingSectionProps {
  categories?: ComputeCategory[];
}

function isBareMetalPlan(plan: VirtualPlan | BareMetalPlan): plan is BareMetalPlan {
  return "processor" in plan;
}

/** Rows shown inline. The rest live in the deploy wizard. */
const PLAN_PREVIEW_COUNT = 10;

function getCategoryMeta(category: ComputeCategory) {
  return (
    CATEGORY_META[category.key] ?? {
      audience: "General-purpose workloads",
      cpuProfile: category.label,
      summary: category.description,
    }
  );
}

function formatHourlyPrice(monthlyPrice: number) {
  // 720, matching HOURS_PER_MONTH in lib/pricing/linode-catalog.ts. This said
  // 730, so the hourly figure shown here never matched the one the wizard
  // quotes or the cron charges.
  const hourly = monthlyPrice / 720;
  const decimals = hourly >= 1 ? 2 : hourly >= 0.1 ? 3 : 4;
  return hourly.toFixed(decimals);
}

function getPlanName(index: number, isBareMetalCategory: boolean) {
  const labels = isBareMetalCategory ? BARE_METAL_PLAN_NAMES : VIRTUAL_PLAN_NAMES;
  return labels[index] ?? `Plan ${index + 1}`;
}

function VirtualPlanCard({ plan, index }: { plan: VirtualPlan; index: number }) {
  return (
    <div className="border border-white/[0.12] bg-[#111214] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/28">
            {getPlanName(index, false)}
          </p>
          <h5 className="mt-2 text-lg font-semibold text-white">
            {plan.vcpu} {plan.vcpu === 1 ? "vCPU" : "vCPUs"}
          </h5>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold tracking-tight text-white">${plan.price}</div>
          <div className="text-[12px] text-white/32">${formatHourlyPrice(plan.price)}/hr</div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="border border-white/[0.1] bg-white/[0.04] px-3 py-2.5">
          <div className="text-[11px] uppercase tracking-[0.14em] text-white/36">Memory</div>
          <div className="mt-1 text-sm font-medium text-white/80">{plan.ram}</div>
        </div>
        <div className="border border-white/[0.1] bg-white/[0.04] px-3 py-2.5">
          <div className="text-[11px] uppercase tracking-[0.14em] text-white/36">Storage</div>
          <div className="mt-1 text-sm font-medium text-white/80">{plan.storage}</div>
        </div>
        <div className="border border-white/[0.1] bg-white/[0.04] px-3 py-2.5">
          <div className="text-[11px] uppercase tracking-[0.14em] text-white/36">Transfer</div>
          <div className="mt-1 text-sm font-medium text-white/80">{plan.bandwidth}</div>
        </div>
        <div className="border border-white/[0.1] bg-white/[0.04] px-3 py-2.5">
          <div className="text-[11px] uppercase tracking-[0.14em] text-white/36">Billing</div>
          <div className="mt-1 text-sm font-medium text-white/80">Monthly, hourly billed</div>
        </div>
      </div>

      <AuthAwareServiceCta
        service="compute"
        intent="new"
        className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 bg-white text-sm font-medium text-black transition-colors hover:bg-[#0095FF] hover:text-white"
      >
        Deploy {getPlanName(index, false)}
        <ArrowRight className="h-4 w-4" />
      </AuthAwareServiceCta>
    </div>
  );
}

function BareMetalPlanCard({ plan, index }: { plan: BareMetalPlan; index: number }) {
  const isIntel = plan.processor.includes("Intel");

  return (
    <div className="border border-white/[0.12] bg-[#111214] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/28">
            {getPlanName(index, true)}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Image
              src={isIntel ? assetUrl("/images/compute-page/intel.png") : assetUrl("/images/compute-page/amd.png")}
              alt={isIntel ? "Intel" : "AMD"}
              width={22}
              height={22}
              className="h-5 w-5 object-contain brightness-0 invert opacity-50"
            />
            <h5 className="text-base font-semibold text-white">{plan.processor}</h5>
          </div>
          <p className="mt-1 text-sm text-white/45">{plan.cores}</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold tracking-tight text-white">${plan.price}</div>
          <div className="text-[12px] text-white/32">${formatHourlyPrice(plan.price)}/hr</div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="border border-white/[0.1] bg-white/[0.04] px-3 py-2.5">
          <div className="text-[11px] uppercase tracking-[0.14em] text-white/36">RAM</div>
          <div className="mt-1 text-sm font-medium text-white/80">{plan.ram}</div>
        </div>
        <div className="border border-white/[0.1] bg-white/[0.04] px-3 py-2.5">
          <div className="text-[11px] uppercase tracking-[0.14em] text-white/36">Storage</div>
          <div className="mt-1 text-sm font-medium text-white/80">{plan.storage}</div>
        </div>
        <div className="border border-white/[0.1] bg-white/[0.04] px-3 py-2.5">
          <div className="text-[11px] uppercase tracking-[0.14em] text-white/36">Network</div>
          <div className="mt-1 text-sm font-medium text-white/80">{plan.network}</div>
        </div>
        <div className="border border-white/[0.1] bg-white/[0.04] px-3 py-2.5">
          <div className="text-[11px] uppercase tracking-[0.14em] text-white/36">Transfer</div>
          <div className="mt-1 text-sm font-medium text-white/80">{plan.bandwidth}</div>
        </div>
      </div>

      <AuthAwareServiceCta
        service="compute"
        intent="new"
        className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 bg-white text-sm font-medium text-black transition-colors hover:bg-[#0095FF] hover:text-white"
      >
        Configure {getPlanName(index, true)}
        <ArrowRight className="h-4 w-4" />
      </AuthAwareServiceCta>
    </div>
  );
}

export default function ComputePricingSection({
  categories,
}: ComputePricingSectionProps) {
  const [activeKey, setActiveKey] = useState("shared");

  // No catalog means the read failed. Say so rather than substituting numbers:
  // a plausible-looking wrong price is worse than an honest gap, and is exactly
  // what the removed fallback table did for months.
  if (!categories || categories.length === 0) {
    return (
      <section className="relative z-10 py-16 lg:py-24">
        <Container>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-[400] leading-[1.05] tracking-tight text-white sm:text-4xl">
              Pricing is briefly unavailable
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-white/55">
              We could not load live plan pricing just now. Please refresh in a
              moment, or see current prices in the deploy wizard.
            </p>
            <div className="mt-8 flex justify-center">
              <AuthAwareServiceCta
                service="compute"
                intent="new"
                className="inline-flex h-11 items-center gap-2 rounded-[5px] bg-white px-6 text-[13px] font-semibold text-black transition-colors hover:bg-white/90"
              >
                Open the deploy wizard
                <ArrowRight className="h-4 w-4" />
              </AuthAwareServiceCta>
            </div>
          </div>
        </Container>
      </section>
    );
  }

  const active = categories.find((category) => category.key === activeKey) ?? categories[0];
  // Families run 10–33 plans. Dumping all of them turns the section into a
  // wall of table; the deploy wizard is the right place to browse the full
  // lineup, so the page shows a representative slice and links out.
  const previewPlans = active.plans.slice(0, PLAN_PREVIEW_COUNT);
  const hiddenPlanCount = active.plans.length - previewPlans.length;
  const isBareMetalCategory = !!active.isBareMetalCategory;
  const activeMeta = getCategoryMeta(active);

  return (
    <section className="relative z-10 py-16 lg:py-24">
      <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-black" />
      </div>

      <Container>
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-3xl font-[400] leading-[1.05] tracking-tight text-white sm:text-4xl lg:text-[3.4rem]">
            Built on <span className="text-[#0095FF]">Next-Gen Hardware</span>, priced for real workloads
          </h2>
          <p className="mx-auto mt-4 max-w-3xl text-sm leading-relaxed text-white/45 lg:text-base">
            Compare CPU families fast, then scan plans with cleaner monthly and hourly pricing.
          </p>
        </div>

        <div className="mt-14 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/28">
              Instance Families
            </p>
            <h3 className="mt-3 text-2xl font-[400] tracking-tight text-white sm:text-3xl lg:text-4xl">
              Select a CPU family
            </h3>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/45 lg:text-[15px]">
              Pick a family, then compare plans instantly.
            </p>
          </div>
          <div className="flex items-center gap-2 self-start border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-[12px] text-white/40">
            <span>Monthly price</span>
            <span className="h-1 w-1 rounded-full bg-white/20" />
            <span>Hourly equivalent shown</span>
          </div>
        </div>

        {/* Mobile: horizontal scroll-snap tab strip so the family selector stays a
            single compact row directly above the plan table — categories and
            pricing share one viewport. sm+ restores the full card grid. */}
        <div className="mt-8">
          <div className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:grid sm:snap-none sm:grid-cols-2 sm:gap-3 sm:overflow-visible sm:px-0 sm:pb-0 xl:grid-cols-6">
            {categories.map((category) => {
              const isActive = category.key === activeKey;
              const meta = getCategoryMeta(category);

              return (
                <button
                  key={category.key}
                  type="button"
                  onClick={() => setActiveKey(category.key)}
                  className={`group relative flex shrink-0 snap-start items-center gap-3 whitespace-nowrap rounded-full border px-4 py-2.5 text-left transition-all duration-300 sm:min-h-[90px] sm:shrink sm:items-start sm:whitespace-normal sm:rounded-none sm:px-4 sm:py-3 ${
                    isActive
                      ? "cursor-pointer border-[#0095FF] bg-[linear-gradient(135deg,#ffffff_0%,#eef6ff_100%)] text-black shadow-[0_18px_50px_rgba(0,149,255,0.18)]"
                      : "cursor-pointer border-white/[0.1] bg-[#0f1012] hover:-translate-y-0.5 hover:border-[#0095FF]/35 hover:bg-[#15171b]"
                  }`}
                >
                  {isActive && (
                    <div className="absolute inset-y-3 left-2 hidden w-[3px] bg-[#0095FF] sm:block" />
                  )}
                  <div className={`min-w-0 ${isActive ? "sm:pl-3" : ""}`}>
                    <div className={`text-[13px] font-medium leading-snug sm:text-[14px] ${isActive ? "text-black" : "text-white/88"}`}>
                      {category.label}
                    </div>
                    <div className={`mt-1 hidden text-[11px] leading-snug sm:block ${isActive ? "text-black/58" : "text-white/42"}`}>
                      {meta.cpuProfile}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-6 border border-white/[0.12] bg-[#111214]">
          <div className="flex flex-col gap-4 border-b border-white/[0.08] bg-[linear-gradient(90deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02)_32%,rgba(255,255,255,0.02)_100%)] px-5 py-5 sm:px-6">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
                Plan Comparison
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className="border border-[#0095FF]/35 bg-[#0095FF]/12 px-3 py-1 text-[12px] font-semibold text-[#8ecaff]">
                  {active.label}
                </span>
                <span className="text-sm text-white/72">{activeMeta.audience}</span>
              </div>
            </div>
          </div>

          {/* Same slice as the desktop table — otherwise a phone gets all 33
              plans while a laptop gets 10. */}
          <div className="grid gap-3 p-4 lg:hidden">
            {previewPlans.map((plan, index) =>
              isBareMetalPlan(plan) ? (
                <BareMetalPlanCard key={`${active.key}-${plan.processor}`} index={index} plan={plan} />
              ) : (
                <VirtualPlanCard key={`${active.key}-${plan.vcpu}-${plan.ram}`} index={index} plan={plan} />
              ),
            )}
          </div>

          <div className="hidden overflow-x-auto lg:block">
            {isBareMetalCategory ? (
              <table className="w-full min-w-[920px]">
                <thead>
                  <tr className="bg-[linear-gradient(90deg,rgba(0,149,255,0.10),rgba(255,255,255,0.04)_22%,rgba(255,255,255,0.03)_100%)]">
                    {["Plan", "Processor", "RAM", "Storage", "Network", "Price", ""].map((heading) => (
                      <th
                        key={heading}
                        className="border-b border-white/[0.08] px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewPlans.map((plan, index) => {
                    if (!isBareMetalPlan(plan)) {
                      return null;
                    }

                    const isIntel = plan.processor.includes("Intel");

                    return (
                      <tr
                        key={`bm-${plan.processor}`}
                        className={`transition-colors duration-150 hover:bg-white/[0.07] ${
                          index % 2 === 1 ? "bg-white/[0.025]" : "bg-transparent"
                        } ${
                          index < previewPlans.length - 1 ? "border-b border-white/[0.06]" : ""
                        }`}
                      >
                        <td className="px-6 py-5">
                          <div className="text-[14px] font-medium text-white">{getPlanName(index, true)}</div>
                          <div className="mt-1 text-[12px] text-white/45">{plan.cores}</div>
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-2.5">
                            <Image
                              src={isIntel ? assetUrl("/images/compute-page/intel.png") : assetUrl("/images/compute-page/amd.png")}
                              alt={isIntel ? "Intel" : "AMD"}
                              width={22}
                              height={22}
                              className="h-5 w-5 shrink-0 object-contain brightness-0 invert opacity-50"
                            />
                            <span className="text-[14px] text-white/88">{plan.processor}</span>
                          </div>
                        </td>
                        <td className="px-6 py-5 text-[14px] text-white/74">{plan.ram}</td>
                        <td className="px-6 py-5 text-[14px] text-white/74">{plan.storage}</td>
                        <td className="px-6 py-5 text-[14px] text-white/74">
                          <div>{plan.network}</div>
                          <div className="mt-1 text-[12px] text-white/40">{plan.bandwidth} transfer</div>
                        </td>
                        <td className="px-6 py-5">
                          <div className="text-[20px] font-semibold tracking-tight text-white">${plan.price}</div>
                          <div className="text-[12px] text-white/55">${formatHourlyPrice(plan.price)}/hr</div>
                        </td>
                        <td className="px-6 py-5 text-right">
                          <AuthAwareServiceCta
                            service="compute"
                            intent="new"
                            className="inline-flex h-10 items-center justify-center gap-2 bg-white px-5 text-[13px] font-medium text-black transition-colors hover:bg-[#0095FF] hover:text-white"
                          >
                            Configure
                            <ArrowRight className="h-3.5 w-3.5" />
                          </AuthAwareServiceCta>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <table className="w-full min-w-[860px]">
                <thead>
                  <tr className="bg-[linear-gradient(90deg,rgba(0,149,255,0.10),rgba(255,255,255,0.04)_22%,rgba(255,255,255,0.03)_100%)]">
                    {["Plan", "vCPUs", "Memory", "NVMe Storage", "Transfer", "Price", ""].map((heading) => (
                      <th
                        key={heading}
                        className="border-b border-white/[0.08] px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewPlans.map((plan, index) => {
                    if (isBareMetalPlan(plan)) {
                      return null;
                    }

                    return (
                      <tr
                        key={`${active.key}-${plan.vcpu}-${plan.ram}`}
                        className={`transition-colors duration-150 hover:bg-white/[0.07] ${
                          index % 2 === 1 ? "bg-white/[0.025]" : "bg-transparent"
                        } ${
                          index < previewPlans.length - 1 ? "border-b border-white/[0.06]" : ""
                        }`}
                      >
                        <td className="px-6 py-5">
                          <div className="text-[14px] font-medium text-white">{getPlanName(index, false)}</div>
                          <div className="mt-1 text-[12px] text-white/45">Monthly plan, hourly billed</div>
                        </td>
                        <td className="px-6 py-5">
                          <span className="text-[15px] font-medium text-white">{plan.vcpu}</span>
                          <span className="ml-1.5 text-[12px] text-white/45">
                            {plan.vcpu === 1 ? "vCPU" : "vCPUs"}
                          </span>
                        </td>
                        <td className="px-6 py-5 text-[15px] text-white/74">{plan.ram}</td>
                        <td className="px-6 py-5 text-[15px] text-white/74">{plan.storage}</td>
                        <td className="px-6 py-5 text-[15px] text-white/74">{plan.bandwidth}</td>
                        <td className="px-6 py-5">
                          <div className="text-[20px] font-semibold tracking-tight text-white">${plan.price}</div>
                          <div className="text-[12px] text-white/55">${formatHourlyPrice(plan.price)}/hr</div>
                        </td>
                        <td className="px-6 py-5 text-right">
                          <AuthAwareServiceCta
                            service="compute"
                            intent="new"
                            className="inline-flex h-10 items-center justify-center gap-2 bg-white px-5 text-[13px] font-medium text-black transition-colors hover:bg-[#0095FF] hover:text-white"
                          >
                            Deploy
                            <ArrowRight className="h-3.5 w-3.5" />
                          </AuthAwareServiceCta>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/*
            Footer bar. States plainly how much of the family is on screen
            rather than letting the table just stop, and sends people to the
            wizard for the rest — that is where they can actually filter and
            deploy, and it always reflects live inventory.
          */}
          <div className="flex flex-col gap-3 border-t border-white/[0.08] bg-white/[0.015] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="m-0 text-[12.5px] text-white/45">
              {hiddenPlanCount > 0 ? (
                <>
                  Showing{" "}
                  <span className="text-white/75">{previewPlans.length}</span> of{" "}
                  <span className="text-white/75">{active.plans.length}</span>{" "}
                  {active.label.toLowerCase()} plans
                </>
              ) : (
                <>
                  All{" "}
                  <span className="text-white/75">{active.plans.length}</span>{" "}
                  {active.label.toLowerCase()} plans shown
                </>
              )}
            </p>
            <Link
              href={
                isBareMetalCategory
                  ? "/dashboard/services/compute/bare-metal"
                  : "/dashboard/services/compute/vps"
              }
              className="group inline-flex w-fit items-center gap-2 border border-white/[0.14] px-4 py-2.5 text-[12.5px] font-medium text-white transition-colors hover:border-[#0095FF] hover:bg-[#0095FF]/[0.08]"
            >
              Explore the full lineup
              <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
                <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" />
              </svg>
            </Link>
          </div>
        </div>

        <div className="relative mt-20 lg:mt-24">
          <div className="relative grid gap-8 py-6 lg:grid-cols-[minmax(0,0.5fr)_minmax(0,1.5fr)] lg:items-start lg:gap-12 lg:py-8">
            <div className="pb-2 lg:pr-4">
              <div className="inline-flex items-center gap-2 px-0 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
                <Globe className="h-3.5 w-3.5 text-[#8ecaff]" />
                Global Footprint
              </div>

              <h3 className="mt-4 max-w-sm text-2xl font-[400] tracking-tight text-white lg:text-[30px]">
                <span className="text-[#0095FF]">Deploy compute</span> where your users actually are
              </h3>
            </div>

            <div className="relative">
              <div>
                <div className="relative pb-2 pt-1">
                  <div className="relative px-0 py-0">
                    <div className="relative">
                      <WorldMap locations={POP_LOCATIONS} dotColor="#0095FF" />
                    </div>
                  </div>

                  <div className="mt-5 grid gap-x-10 gap-y-5 md:grid-cols-2">
                    {AVAILABLE_REGIONS.map((region) => (
                      <div key={region.continent} className="relative">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`h-2 w-2 rounded-full shadow-[0_0_10px_rgba(142,202,255,0.32)] ${
                              REGION_ACCENTS[region.continent] ?? "bg-white"
                            }`}
                          />
                          <h4 className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/76">
                            {region.continent}
                          </h4>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {region.locations.map((location) => (
                            <span
                              key={location.city}
                              className="inline-flex items-center gap-2 px-0 py-1 text-[13px] font-medium text-white/82 transition-colors duration-200 hover:text-[#d9ecff]"
                            >
                              <Image
                                src={`https://flagcdn.com/w40/${location.flag}.png`}
                                alt={location.flag}
                                width={16}
                                height={11}
                                className="h-[11px] w-4 rounded-[2px] object-cover opacity-90"
                                unoptimized
                              />
                              <span className="decoration-[#8ecaff]/45 underline-offset-4 hover:underline">
                                {location.city}
                              </span>
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

      </Container>
    </section>
  );
}
