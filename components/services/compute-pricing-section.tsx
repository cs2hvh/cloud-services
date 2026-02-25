"use client";

import { useState } from "react";
import Image from "next/image";
import {
  ArrowRight,
  Cpu,
  Server,
  Zap,
  MemoryStick,
  HardDrive,
  Shield,
  Globe,
  Gauge,
  Clock,
  Network,
  Check,
  CircuitBoard,
} from "lucide-react";
import { Container } from "@/components/ui/container";

/* ─── Type Definitions ─── */
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


/* ─── Hardware Highlights ─── */
const HIGHLIGHTS = [
  {
    icon: Cpu,
    stat: "5.7 GHz",
    title: "AMD EPYC & Ryzen 9",
    desc: "Latest-gen processors with industry-leading single & multi-thread performance",
  },
  {
    icon: Gauge,
    stat: "7 GB/s",
    title: "NVMe SSD Only",
    desc: "Enterprise-grade Gen4 NVMe with up to 1M IOPS random read",
  },
  {
    icon: Network,
    stat: "25 Gbit/s",
    title: "Premium Network",
    desc: "Redundant uplinks, low jitter, and free inbound traffic on every plan",
  },
  {
    icon: Globe,
    stat: "12",
    title: "Global Regions",
    desc: "Deploy closest to your users across NA, EU, and APAC with sub-20ms latency",
  },
  {
    icon: Shield,
    stat: "L3-L7",
    title: "DDoS Protection",
    desc: "Always-on mitigation absorbs volumetric and application-layer attacks",
  },
  {
    icon: Clock,
    stat: "< 30s",
    title: "Instant Deploy",
    desc: "Full root access with your SSH key, public IP, and firewall ready instantly",
  },
];

/* ─── Instance Categories ─── */
const CATEGORIES = [
  {
    key: "shared",
    label: "Shared CPU",
    icon: Cpu,
    tagline: "From $6/mo",
    description:
      "Burstable performance for development, staging, and low-traffic workloads. Ideal when you need a server fast without breaking the bank.",
    features: [
      "Burstable AMD vCPU cores",
      "Best $/performance for dev & test",
      "Full root access & SSH",
      "Free snapshots & backups",
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
      "Ryzen 9 — up to 5.7 GHz boost",
      "Optimized for single-thread perf",
      "Low-latency NVMe I/O path",
      "Ideal for CI/CD & game servers",
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
      "Tuned for Redis, Postgres, Elastic",
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
      "No hypervisor — 100% hardware",
      "IPMI / KVM remote management",
      "Hardware RAID options",
      "Custom OS & ISO support",
    ],
    isBareMetalCategory: true,
    plans: [
      { processor: "Intel Xeon E-2388G", cores: "8c / 16t", ram: "32 GB DDR4 ECC", storage: "2× 512 GB NVMe", bandwidth: "10 TB", network: "1 Gbit/s", price: 99 },
      { processor: "AMD Ryzen 9 7950X", cores: "16c / 32t", ram: "64 GB DDR5", storage: "2× 1 TB NVMe", bandwidth: "20 TB", network: "1 Gbit/s", price: 179 },
      { processor: "AMD EPYC 7443P", cores: "24c / 48t", ram: "128 GB DDR4 ECC", storage: "2× 1.92 TB NVMe", bandwidth: "30 TB", network: "10 Gbit/s", price: 329 },
      { processor: "AMD EPYC 9354P", cores: "32c / 64t", ram: "256 GB DDR5 ECC", storage: "2× 3.84 TB NVMe", bandwidth: "50 TB", network: "10 Gbit/s", price: 549 },
      { processor: "2× AMD EPYC 9654", cores: "2×96c / 384t", ram: "512 GB DDR5 ECC", storage: "4× 3.84 TB NVMe", bandwidth: "100 TB", network: "25 Gbit/s", price: 1299 },
      { processor: "2× AMD EPYC 9754", cores: "2×128c / 512t", ram: "1 TB DDR5 ECC", storage: "8× 3.84 TB NVMe", bandwidth: "Unmetered", network: "25 Gbit/s", price: 2499 },
    ],
  },
];

export default function ComputePricingSection() {
  const [activeKey, setActiveKey] = useState("shared");
  const active = CATEGORIES.find((c) => c.key === activeKey)!;
  const isBM = !!(active.isBareMetalCategory);

  return (
    <section className="relative z-10 py-16 lg:py-24">
      <div className="absolute inset-0 -z-10 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-black" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[60%] h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>

      <Container>
        {/* ═══════════ SECTION 1: HARDWARE ═══════════ */}
        <div className="text-center mb-12 lg:mb-16">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-[400] tracking-tight leading-[1.1] text-white">
            Built on{" "}
            <span className="text-[#0095FF]">Next-Gen Hardware</span>
          </h2>
          <p className="mt-4 mx-auto max-w-2xl text-sm lg:text-base leading-relaxed text-white/40">
            Every instance runs on AMD EPYC &amp; Ryzen 9 processors with DDR5 memory and enterprise NVMe — no spinning disks, no shared bottlenecks.
          </p>

          {/* Powered-by brand strip */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3 sm:gap-6">
            <div className="flex items-center gap-2 border border-white/[0.06] bg-white/[0.02] px-3 py-1 sm:px-4 sm:py-2">
              <Image
                src="/images/compute-page/amd.png"
                alt="AMD"
                width={60}
                height={22}
                className="object-contain w-12 sm:w-16 h-auto brightness-0 invert opacity-50"
              />
              <span className="text-[9px] sm:text-[10px] text-white/25 uppercase tracking-wider">EPYC &bull; Ryzen 9</span>
            </div>
            <div className="flex items-center gap-2 border border-white/[0.06] bg-white/[0.02] px-3 py-1 sm:px-4 sm:py-2">
              <Image
                src="/images/compute-page/intel.png"
                alt="Intel"
                width={52}
                height={22}
                className="object-contain w-12 sm:w-14 h-auto brightness-0 invert opacity-50"
              />
              <span className="text-[9px] sm:text-[10px] text-white/25 uppercase tracking-wider">Xeon &bull; Core</span>
            </div>
          </div>
        </div>

        {/* Hardware cards — stat-driven design */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-white/[0.06] border border-white/[0.06] mb-14 lg:mb-16">
          {HIGHLIGHTS.map((h) => (
            <div
              key={h.title}
              className="bg-[#0a0a0a] p-4 sm:p-6 lg:p-8 group hover:bg-[#0d0d0d] transition-colors duration-300"
            >
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-3">
                <div className="flex h-10 w-10 items-center justify-center bg-[#0095FF]/[0.08] border border-[#0095FF]/20 flex-shrink-0">
                  <h.icon className="w-5 h-5 text-[#0095FF]" />
                </div>
                <span className="text-[18px] sm:text-[22px] lg:text-[26px] font-[600] text-white tabular-nums tracking-tight break-words">
                  {h.stat}
                </span>
              </div>
              <h3 className="text-[14px] sm:text-[15px] font-[500] text-white mb-1">
                {h.title}
              </h3>
              <p className="text-[13px] leading-[1.5] text-white/40">
                {h.desc}
              </p>
            </div>
          ))}
        </div>

        {/* ═══════════ SECTION 2: INSTANCE PICKER ═══════════ */}
        <div className="mb-8 lg:mb-10">
          <h3 className="text-2xl sm:text-3xl lg:text-4xl font-[400] tracking-tight text-white">
            Choose Your{" "}
            <span className="text-[#0095FF]">Instance</span>
          </h3>
          <p className="mt-2 text-sm text-white/40 max-w-lg">
            6 instance families optimized for different workloads — from $6/mo shared VMs to enterprise bare metal.
          </p>
        </div>

        {/* Category tabs — card style */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-12">
          {CATEGORIES.map((cat) => {
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
            <div className="w-full lg:max-w-[520px]">
              <h4 className="text-lg lg:text-xl font-[500] text-white mb-2">
                {active.label}
              </h4>
              <p className="text-[14px] leading-[1.7] text-white/45">
                {active.description}
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2.5 w-full sm:w-auto">
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
          {isBM ? (
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="bg-white/[0.02]">
                  {["Processor", "RAM", "Storage", "Network", "Price", ""].map((h) => (
                    <th key={h} className="px-6 py-4 text-left text-[11px] font-medium text-white/25 uppercase tracking-[0.12em] border-b border-white/[0.06]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(active.plans as BareMetalPlan[]).map((plan, i: number) => (
                  <tr
                    key={`bm-${plan.processor}`}
                    className={`transition-colors duration-150 hover:bg-white/[0.02] ${
                      i % 2 === 0 ? "bg-transparent" : "bg-white/[0.01]"
                    } ${i < active.plans.length - 1 ? "border-b border-white/[0.04]" : ""}`}
                  >
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-2.5">
                        <Image
                          src={plan.processor.includes("Intel") ? "/images/compute-page/intel.png" : "/images/compute-page/amd.png"}
                          alt={plan.processor.includes("Intel") ? "Intel" : "AMD"}
                          width={24}
                          height={24}
                          className="object-contain brightness-0 invert opacity-50 shrink-0"
                        />
                        <div>
                          <span className="text-[14px] font-[500] text-white block">{plan.processor}</span>
                          <span className="text-[12px] text-white/30 tabular-nums">{plan.cores}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-[14px] text-white/55 tabular-nums">{plan.ram}</td>
                    <td className="px-6 py-5 text-[14px] text-white/55 tabular-nums">{plan.storage}</td>
                    <td className="px-6 py-5 text-[14px] text-white/55 tabular-nums">{plan.network}</td>
                    <td className="px-6 py-5">
                      <span className="text-[20px] font-[600] text-white tabular-nums">${plan.price}</span>
                      <span className="text-[12px] text-white/25 ml-0.5">/mo</span>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <a
                        href="/signup"
                        className="cursor-pointer inline-flex items-center gap-2 bg-white text-black px-5 py-2 text-[13px] font-medium hover:bg-white/90 transition-colors"
                      >
                        Configure
                        <ArrowRight className="w-3.5 h-3.5" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full min-w-[680px]">
              <thead>
                <tr className="bg-white/[0.02]">
                  {["vCPUs", "Memory", "NVMe Storage", "Transfer", "Price", ""].map((h) => (
                    <th key={h} className="px-6 py-4 text-left text-[11px] font-medium text-white/25 uppercase tracking-[0.12em] border-b border-white/[0.06]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(active.plans as VirtualPlan[]).map((plan, i: number) => (
                  <tr
                    key={`${active.key}-${plan.vcpu}-${plan.ram}`}
                    className={`transition-colors duration-150 hover:bg-white/[0.02] ${
                      i % 2 === 0 ? "bg-transparent" : "bg-white/[0.01]"
                    } ${i < active.plans.length - 1 ? "border-b border-white/[0.04]" : ""}`}
                  >
                    <td className="px-6 py-5">
                      <span className="text-[15px] font-[500] text-white tabular-nums">{plan.vcpu}</span>
                      <span className="text-[12px] text-white/25 ml-1.5">{plan.vcpu === 1 ? "vCPU" : "vCPUs"}</span>
                    </td>
                    <td className="px-6 py-5 text-[15px] text-white/55 tabular-nums">{plan.ram}</td>
                    <td className="px-6 py-5 text-[15px] text-white/55 tabular-nums">{plan.storage}</td>
                    <td className="px-6 py-5 text-[15px] text-white/55 tabular-nums">{plan.bandwidth}</td>
                    <td className="px-6 py-5">
                      <span className="text-[20px] font-[600] text-white tabular-nums">${plan.price}</span>
                      <span className="text-[12px] text-white/25 ml-0.5">/mo</span>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <a
                        href="/signup"
                        className="cursor-pointer inline-flex items-center gap-2 bg-white text-black px-5 py-2 text-[13px] font-medium hover:bg-white/90 transition-colors"
                      >
                        Deploy
                        <ArrowRight className="w-3.5 h-3.5" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Included With Every Instance ── */}
        <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { label: "Free Inbound", icon: ArrowRight },
            { label: "IPv4 + IPv6", icon: Globe },
            { label: "Snapshots", icon: HardDrive },
            { label: "DDoS Shield", icon: Shield },
            { label: "99.99% SLA", icon: Check },
            { label: "24/7 Monitoring", icon: Gauge },
            { label: "IPMI Access", icon: Server },
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
            Deploy Your First Server
            <ArrowRight className="w-4.5 h-4.5" />
          </a>
          <p className="mt-4 text-[13px] text-white/30">
            No credit card required &middot; Pay only for what you use
          </p>
        </div>
      </Container>
    </section>
  );
}
