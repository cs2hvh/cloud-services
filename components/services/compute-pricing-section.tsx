"use client";

import { useState } from "react";
import Image from "next/image";
import {
  ArrowRight,
  CircuitBoard,
  Cpu,
  Globe,
  HardDrive,
  MemoryStick,
  Server,
  Zap,
} from "lucide-react";
import {
  IconFlameFilled,
  IconGaugeFilled,
  IconCloudDataConnectionFilled,
  IconGlobeFilled,
  IconShieldCheckFilled,
  IconClockFilled,
} from "@tabler/icons-react";
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
  icon: React.ComponentType<{ className?: string }>;
  tagline: string;
  description: string;
  features: string[];
  isBareMetalCategory?: boolean;
  plans: (VirtualPlan | BareMetalPlan)[];
}

const HIGHLIGHTS = [
  {
    iconNode: <IconFlameFilled size={20} />,
    accent: "#F59E0B",
    stat: "5.7 GHz",
    title: "AMD EPYC and Ryzen 9",
    desc: "Single-thread and multi-core performance on every plan.",
  },
  {
    iconNode: <IconGaugeFilled size={20} />,
    accent: "#10B981",
    stat: "7 GB/s",
    title: "Enterprise NVMe",
    desc: "Fast boot, low latency, and high random IOPS.",
  },
  {
    iconNode: <IconCloudDataConnectionFilled size={20} />,
    accent: "#0095FF",
    stat: "25 Gbit/s",
    title: "Premium network",
    desc: "Redundant uplinks, free inbound traffic on every plan.",
  },
  {
    iconNode: <IconGlobeFilled size={20} />,
    accent: "#06B6D4",
    stat: "15 locations",
    title: "Global footprint",
    desc: "Americas, Europe, Asia, and Oceania covered.",
  },
  {
    iconNode: <IconShieldCheckFilled size={20} />,
    accent: "#E11D48",
    stat: "L3-L7",
    title: "DDoS protection",
    desc: "Always-on volumetric and app-layer attack mitigation.",
  },
  {
    iconNode: <IconClockFilled size={20} />,
    accent: "#8B5CF6",
    stat: "< 30 sec",
    title: "Fast provisioning",
    desc: "IP, SSH, and firewall ready on first boot.",
  },
];

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
  compute: {
    audience: "CI/CD runners, game servers, and latency-sensitive jobs",
    cpuProfile: "High clock-speed Ryzen cores",
    summary: "CPU-heavy instances optimized for high single-thread performance.",
  },
  memory: {
    audience: "Redis, Postgres, Elasticsearch, analytics",
    cpuProfile: "High RAM-to-vCPU ratio",
    summary: "Memory-dense profiles for caches, databases, and in-memory systems.",
  },
  storage: {
    audience: "Backups, media processing, data-heavy pipelines",
    cpuProfile: "NVMe-heavy storage nodes",
    summary: "Higher local NVMe capacity for data-intensive services.",
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

const FALLBACK_CATEGORIES: ComputeCategory[] = [
  {
    key: "shared",
    label: "Shared CPU",
    icon: Cpu,
    tagline: "From $6/mo",
    description:
      "Burstable performance for development, staging, and low-traffic workloads. Ideal when you need a server fast without breaking the bank.",
    features: [
      "Burstable AMD vCPU cores",
      "Best price/performance for dev and test",
      "Full root access and SSH",
      "Free snapshots and backups",
    ],
    plans: [
      { vcpu: 1, ram: "1 GB", storage: "25 GB", bandwidth: "1 TB", price: 6 },
      { vcpu: 1, ram: "2 GB", storage: "50 GB", bandwidth: "2 TB", price: 12 },
      { vcpu: 2, ram: "4 GB", storage: "80 GB", bandwidth: "4 TB", price: 24 },
      { vcpu: 4, ram: "8 GB", storage: "160 GB", bandwidth: "5 TB", price: 48 },
      { vcpu: 8, ram: "16 GB", storage: "320 GB", bandwidth: "6 TB", price: 96 },
    ],
  },
  {
    key: "dedicated",
    label: "Dedicated CPU",
    icon: Server,
    tagline: "From $48/mo",
    description:
      "Guaranteed CPU resources with no noisy neighbors. Built for production APIs, SaaS platforms, and always-on services.",
    features: [
      "Dedicated AMD EPYC threads",
      "Guaranteed baseline performance",
      "Up to 128 GB DDR5 RAM",
      "10 Gbit/s network interface",
    ],
    plans: [
      { vcpu: 2, ram: "8 GB", storage: "50 GB", bandwidth: "4 TB", price: 48 },
      { vcpu: 4, ram: "16 GB", storage: "100 GB", bandwidth: "5 TB", price: 96 },
      { vcpu: 8, ram: "32 GB", storage: "200 GB", bandwidth: "6 TB", price: 192 },
      { vcpu: 16, ram: "64 GB", storage: "400 GB", bandwidth: "8 TB", price: 384 },
      { vcpu: 32, ram: "128 GB", storage: "800 GB", bandwidth: "10 TB", price: 768 },
    ],
  },
  {
    key: "compute",
    label: "Compute Optimized",
    icon: Zap,
    tagline: "From $42/mo",
    description:
      "High clock-speed AMD Ryzen 9 processors tuned for single-thread performance. Perfect for CI/CD runners, game servers, and batch jobs.",
    features: [
      "Ryzen 9 up to 5.7 GHz boost",
      "Optimized for single-thread performance",
      "Low-latency NVMe I/O path",
      "Ideal for CI/CD and game servers",
    ],
    plans: [
      { vcpu: 2, ram: "4 GB", storage: "50 GB", bandwidth: "4 TB", price: 42 },
      { vcpu: 4, ram: "8 GB", storage: "100 GB", bandwidth: "5 TB", price: 84 },
      { vcpu: 8, ram: "16 GB", storage: "200 GB", bandwidth: "6 TB", price: 168 },
      { vcpu: 16, ram: "32 GB", storage: "400 GB", bandwidth: "8 TB", price: 336 },
      { vcpu: 32, ram: "64 GB", storage: "800 GB", bandwidth: "10 TB", price: 672 },
    ],
  },
  {
    key: "memory",
    label: "Memory Optimized",
    icon: MemoryStick,
    tagline: "From $84/mo",
    description:
      "High RAM-to-CPU ratio with DDR5 ECC memory. Designed for in-memory databases, Redis clusters, Elasticsearch, and real-time analytics.",
    features: [
      "Up to 256 GB DDR5 ECC RAM",
      "8:1 RAM-to-vCPU ratio",
      "Tuned for Redis, Postgres, and Elastic",
      "Low-latency memory bus",
    ],
    plans: [
      { vcpu: 2, ram: "16 GB", storage: "50 GB", bandwidth: "4 TB", price: 84 },
      { vcpu: 4, ram: "32 GB", storage: "100 GB", bandwidth: "5 TB", price: 168 },
      { vcpu: 8, ram: "64 GB", storage: "200 GB", bandwidth: "6 TB", price: 336 },
      { vcpu: 16, ram: "128 GB", storage: "400 GB", bandwidth: "8 TB", price: 672 },
      { vcpu: 32, ram: "256 GB", storage: "800 GB", bandwidth: "10 TB", price: 1344 },
    ],
  },
  {
    key: "storage",
    label: "Storage Optimized",
    icon: HardDrive,
    tagline: "From $65/mo",
    description:
      "Massive NVMe volumes for data-heavy workloads. Ideal for log aggregation, media processing, data lakes, and backup infrastructure.",
    features: [
      "Up to 4.8 TB NVMe per instance",
      "7 GB/s sequential read speeds",
      "3-node replication for durability",
      "S3-compatible block attach",
    ],
    plans: [
      { vcpu: 2, ram: "8 GB", storage: "300 GB", bandwidth: "4 TB", price: 65 },
      { vcpu: 4, ram: "16 GB", storage: "600 GB", bandwidth: "5 TB", price: 130 },
      { vcpu: 8, ram: "32 GB", storage: "1.2 TB", bandwidth: "6 TB", price: 260 },
      { vcpu: 16, ram: "64 GB", storage: "2.4 TB", bandwidth: "8 TB", price: 520 },
      { vcpu: 32, ram: "128 GB", storage: "4.8 TB", bandwidth: "10 TB", price: 1040 },
    ],
  },
  {
    key: "baremetal",
    label: "Bare Metal",
    icon: CircuitBoard,
    tagline: "From $99/mo",
    description:
      "Dedicated physical servers with no virtualization layer. Full hardware access for maximum performance, custom OS installations, and raw compute power.",
    features: [
      "No hypervisor and 100% hardware access",
      "IPMI and KVM remote management",
      "Hardware RAID options",
      "Custom OS and ISO support",
    ],
    isBareMetalCategory: true,
    plans: [
      {
        processor: "Intel Xeon E-2388G",
        cores: "8c / 16t",
        ram: "32 GB DDR4 ECC",
        storage: "2x 512 GB NVMe",
        bandwidth: "10 TB",
        network: "1 Gbit/s",
        price: 99,
      },
      {
        processor: "AMD Ryzen 9 7950X",
        cores: "16c / 32t",
        ram: "64 GB DDR5",
        storage: "2x 1 TB NVMe",
        bandwidth: "20 TB",
        network: "1 Gbit/s",
        price: 179,
      },
      {
        processor: "AMD EPYC 7443P",
        cores: "24c / 48t",
        ram: "128 GB DDR4 ECC",
        storage: "2x 1.92 TB NVMe",
        bandwidth: "30 TB",
        network: "10 Gbit/s",
        price: 329,
      },
      {
        processor: "AMD EPYC 9354P",
        cores: "32c / 64t",
        ram: "256 GB DDR5 ECC",
        storage: "2x 3.84 TB NVMe",
        bandwidth: "50 TB",
        network: "10 Gbit/s",
        price: 549,
      },
      {
        processor: "2x AMD EPYC 9654",
        cores: "2x96c / 384t",
        ram: "512 GB DDR5 ECC",
        storage: "4x 3.84 TB NVMe",
        bandwidth: "100 TB",
        network: "25 Gbit/s",
        price: 1299,
      },
      {
        processor: "2x AMD EPYC 9754",
        cores: "2x128c / 512t",
        ram: "1 TB DDR5 ECC",
        storage: "8x 3.84 TB NVMe",
        bandwidth: "Unmetered",
        network: "25 Gbit/s",
        price: 2499,
      },
    ],
  },
];

interface ComputePricingSectionProps {
  categories?: ComputeCategory[];
}

function isBareMetalPlan(plan: VirtualPlan | BareMetalPlan): plan is BareMetalPlan {
  return "processor" in plan;
}

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
  const hourly = monthlyPrice / 730;
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
        className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 bg-white text-sm font-medium text-black transition-colors hover:bg-white/90"
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
              src={isIntel ? "/images/compute-page/intel.png" : "/images/compute-page/amd.png"}
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
        className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 bg-white text-sm font-medium text-black transition-colors hover:bg-white/90"
      >
        Configure {getPlanName(index, true)}
        <ArrowRight className="h-4 w-4" />
      </AuthAwareServiceCta>
    </div>
  );
}

export default function ComputePricingSection({
  categories = FALLBACK_CATEGORIES,
}: ComputePricingSectionProps) {
  const [activeKey, setActiveKey] = useState("shared");
  const active = categories.find((category) => category.key === activeKey) ?? categories[0];
  const isBareMetalCategory = !!active.isBareMetalCategory;
  const activeMeta = getCategoryMeta(active);

  return (
    <section className="relative z-10 py-16 lg:py-24">
      <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-black" />
      </div>

      <Container>
        <div className="mx-auto max-w-4xl text-center">
          <span className="inline-flex items-center border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/48">
            Compute Pricing
          </span>
          <h2 className="mt-5 text-3xl font-[400] leading-[1.05] tracking-tight text-white sm:text-4xl lg:text-5xl">
            Built on <span className="text-[#0095FF]">Next-Gen Hardware</span>, priced for real workloads
          </h2>
          <p className="mx-auto mt-4 max-w-3xl text-sm leading-relaxed text-white/45 lg:text-base">
            Compare CPU families fast, then scan plans with cleaner monthly and hourly pricing.
          </p>
        </div>

        <div className="mt-14 border border-white/[0.08] bg-white/[0.02]">
          <div className="grid gap-px bg-white/[0.06] lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <div className="bg-[#0a0a0a] p-6 lg:p-8">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/28">
                Infrastructure Baseline
              </p>
              <h3 className="mt-3 text-2xl font-[400] tracking-tight text-white lg:text-3xl">
                Hardware buyers can trust
              </h3>
              <p className="mt-4 max-w-xl text-sm leading-7 text-white/45 lg:text-[15px]">
                Enterprise AMD and Intel hardware, Gen4 NVMe, and a 25 Gbit/s network — spec-for-spec pricing you can verify.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <div className="flex items-center gap-2 border border-white/[0.08] bg-white/[0.03] px-4 py-2">
                  <Image
                    src="/images/compute-page/amd.png"
                    alt="AMD"
                    width={60}
                    height={22}
                    className="h-auto w-14 object-contain brightness-0 invert opacity-55"
                  />
                  <span className="text-[10px] uppercase tracking-[0.16em] text-white/30">EPYC and Ryzen</span>
                </div>
                <div className="flex items-center gap-2 border border-white/[0.08] bg-white/[0.03] px-4 py-2">
                  <Image
                    src="/images/compute-page/intel.png"
                    alt="Intel"
                    width={52}
                    height={22}
                    className="h-auto w-12 object-contain brightness-0 invert opacity-55"
                  />
                  <span className="text-[10px] uppercase tracking-[0.16em] text-white/30">Xeon platforms</span>
                </div>
              </div>
            </div>

            <div className="grid gap-px bg-white/[0.06] sm:grid-cols-2 xl:grid-cols-3">
              {HIGHLIGHTS.map((highlight) => (
                <div
                  key={highlight.title}
                  className="group bg-[#0a0a0a] p-5 transition-colors duration-200 hover:bg-[#0d0d0d]"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center border transition-all group-hover:brightness-110"
                      style={{
                        borderColor: `${highlight.accent}40`,
                        //background: `${highlight.accent}18`,
                        color: highlight.accent,
                      }}
                    >
                      {highlight.iconNode}
                    </div>
                    <span
                      className="text-xl font-semibold tracking-tight"
                      style={{ color: highlight.accent }}
                    >
                      {highlight.stat}
                    </span>
                  </div>
                  <h4 className="mt-4 text-[15px] font-medium text-white">{highlight.title}</h4>
                  <p className="mt-2 text-[13px] leading-6 text-white/40">{highlight.desc}</p>
                </div>
              ))}
            </div>
          </div>
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

        <div className="mt-8">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            {categories.map((category) => {
              const isActive = category.key === activeKey;
              const meta = getCategoryMeta(category);

              return (
                <button
                  key={category.key}
                  type="button"
                  onClick={() => setActiveKey(category.key)}
                  className={`group relative flex min-h-[90px] items-start gap-3 border px-4 py-3 text-left transition-all duration-300 ${
                    isActive
                      ? "cursor-pointer border-[#0095FF] bg-[linear-gradient(135deg,#ffffff_0%,#eef6ff_100%)] text-black shadow-[0_18px_50px_rgba(0,149,255,0.18)]"
                      : "cursor-pointer border-white/[0.1] bg-[#0f1012] hover:-translate-y-0.5 hover:border-[#0095FF]/35 hover:bg-[#15171b]"
                  }`}
                >
                  {isActive && (
                    <div className="absolute inset-y-3 left-2 w-[3px] bg-[#0095FF]" />
                  )}
                  <div className={`min-w-0 ${isActive ? "pl-3" : ""}`}>
                    <div className={`text-[14px] font-medium leading-snug ${isActive ? "text-black" : "text-white/88"}`}>
                      {category.label}
                    </div>
                    <div className={`mt-1 text-[11px] leading-snug ${isActive ? "text-black/58" : "text-white/42"}`}>
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

          <div className="grid gap-3 p-4 lg:hidden">
            {active.plans.map((plan, index) =>
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
                  {active.plans.map((plan, index) => {
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
                          index < active.plans.length - 1 ? "border-b border-white/[0.06]" : ""
                        }`}
                      >
                        <td className="px-6 py-5">
                          <div className="text-[14px] font-medium text-white">{getPlanName(index, true)}</div>
                          <div className="mt-1 text-[12px] text-white/45">{plan.cores}</div>
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-2.5">
                            <Image
                              src={isIntel ? "/images/compute-page/intel.png" : "/images/compute-page/amd.png"}
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
                            className="inline-flex h-10 items-center justify-center gap-2 bg-white px-5 text-[13px] font-medium text-black transition-colors hover:bg-white/90"
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
                  {active.plans.map((plan, index) => {
                    if (isBareMetalPlan(plan)) {
                      return null;
                    }

                    return (
                      <tr
                        key={`${active.key}-${plan.vcpu}-${plan.ram}`}
                        className={`transition-colors duration-150 hover:bg-white/[0.07] ${
                          index % 2 === 1 ? "bg-white/[0.025]" : "bg-transparent"
                        } ${
                          index < active.plans.length - 1 ? "border-b border-white/[0.06]" : ""
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
                            className="inline-flex h-10 items-center justify-center gap-2 bg-white px-5 text-[13px] font-medium text-black transition-colors hover:bg-white/90"
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
        </div>

        <div className="relative mt-10">
          <div className="relative grid gap-8 py-6 lg:grid-cols-[minmax(0,0.5fr)_minmax(0,1.5fr)] lg:items-start lg:gap-12 lg:py-8">
            <div className="pb-2 lg:pr-4">
              <div className="inline-flex items-center gap-2 px-0 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
                <Globe className="h-3.5 w-3.5 text-[#8ecaff]" />
                Global Footprint
              </div>

              <h3 className="mt-4 max-w-sm text-2xl font-[400] tracking-tight text-white lg:text-[30px]">
                <span className="text-[#8ecaff]">Deploy</span> compute where your users actually are
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
