"use client";

import { useState } from "react";
import {
  ArrowRight,
  Check,
  Boxes,
  Server,
  Shield,
  Globe,
  Gauge,
  Clock,
  Network,
  Cpu,
  Layers,
} from "lucide-react";
import { Container } from "@/components/ui/container";
import { StarsBackground } from "@/components/ui/stars-background";
import { Spotlight } from "@/components/ui/spotlight";

/* ─── Stat Strip ─── */
const STATS = [
  { value: "100%", label: "Managed" },
  { value: "< 60s", label: "Deploy" },
  { value: "25 Gbit/s", label: "Network" },
  { value: "12", label: "Regions" },
  { value: "99.95%", label: "SLA" },
];

/* ─── Cluster Categories ─── */
const CATEGORIES = [
  {
    key: "dev",
    label: "Dev / Test",
    icon: Cpu,
    tagline: "From $20/mo",
    description:
      "Lightweight clusters for development, staging, and CI/CD pipelines. Shared control plane with cost-effective worker nodes.",
    features: [
      "Shared control plane",
      "Auto-healing worker nodes",
      "kubectl & Helm ready",
      "Free cluster monitoring",
    ],
    plans: [
      { nodes: 1, vcpu: 2, ram: "4 GB", storage: "50 GB", price: 20 },
      { nodes: 2, vcpu: 2, ram: "4 GB", storage: "50 GB", price: 38 },
      { nodes: 3, vcpu: 2, ram: "8 GB", storage: "80 GB", price: 72 },
      { nodes: 3, vcpu: 4, ram: "16 GB", storage: "160 GB", price: 144 },
    ],
  },
  {
    key: "standard",
    label: "Standard",
    icon: Server,
    tagline: "From $75/mo",
    description:
      "Production-grade clusters with dedicated control plane and auto-scaling node pools. Ideal for web apps, APIs, and microservices.",
    features: [
      "Dedicated control plane",
      "Horizontal pod autoscaling",
      "Ingress controller included",
      "Automated rolling updates",
    ],
    plans: [
      { nodes: 3, vcpu: 2, ram: "8 GB", storage: "100 GB", price: 75 },
      { nodes: 3, vcpu: 4, ram: "16 GB", storage: "200 GB", price: 150 },
      { nodes: 5, vcpu: 4, ram: "16 GB", storage: "200 GB", price: 240 },
      { nodes: 5, vcpu: 8, ram: "32 GB", storage: "400 GB", price: 480 },
      { nodes: 10, vcpu: 8, ram: "32 GB", storage: "400 GB", price: 920 },
    ],
  },
  {
    key: "production",
    label: "Production HA",
    icon: Layers,
    tagline: "From $200/mo",
    description:
      "High availability clusters with multi-zone control plane, automatic failover, and production SLA. Built for mission-critical workloads.",
    features: [
      "Multi-zone HA control plane",
      "99.95% uptime SLA",
      "Priority support channel",
      "Pod disruption budgets",
    ],
    plans: [
      { nodes: 3, vcpu: 4, ram: "16 GB", storage: "200 GB", price: 200 },
      { nodes: 5, vcpu: 4, ram: "16 GB", storage: "200 GB", price: 320 },
      { nodes: 5, vcpu: 8, ram: "32 GB", storage: "400 GB", price: 600 },
      { nodes: 10, vcpu: 8, ram: "32 GB", storage: "400 GB", price: 1150 },
      { nodes: 10, vcpu: 16, ram: "64 GB", storage: "800 GB", price: 2200 },
    ],
  },
  {
    key: "gpu",
    label: "GPU Clusters",
    icon: Gauge,
    tagline: "From $350/mo",
    description:
      "GPU-accelerated node pools for AI/ML training, inference, and rendering workloads. NVIDIA A100 and H100 GPUs available on demand.",
    features: [
      "NVIDIA A100 / H100 GPUs",
      "CUDA & cuDNN pre-installed",
      "GPU operator auto-config",
      "Spot GPU nodes for training",
    ],
    plans: [
      { nodes: 1, vcpu: 8, ram: "32 GB", storage: "200 GB", gpu: "1× A100 40GB", price: 350 },
      { nodes: 2, vcpu: 8, ram: "32 GB", storage: "200 GB", gpu: "1× A100 40GB", price: 680 },
      { nodes: 3, vcpu: 16, ram: "64 GB", storage: "400 GB", gpu: "1× A100 80GB", price: 1500 },
      { nodes: 4, vcpu: 16, ram: "64 GB", storage: "400 GB", gpu: "1× H100 80GB", price: 2800 },
      { nodes: 8, vcpu: 32, ram: "128 GB", storage: "800 GB", gpu: "2× H100 80GB", price: 8400 },
    ],
  },
];

interface Plan {
  nodes: number;
  vcpu: number;
  ram: string;
  storage: string;
  price: number;
  gpu?: string;
}

export default function KubernetesPricingSection() {
  const [activeKey, setActiveKey] = useState("dev");
  const active = CATEGORIES.find((c) => c.key === activeKey)!;
  const isGPU = active.key === "gpu";

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
        {/* ═══════════ SECTION 1: CLUSTER HIGHLIGHTS ═══════════ */}
        <div className="text-center mb-12 lg:mb-16">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-[400] tracking-tight leading-[1.1] text-white">
            Enterprise Kubernetes,{" "}
            <span className="text-[#0095FF]">Simple Pricing</span>
          </h2>
          <p className="mt-4 mx-auto max-w-2xl text-sm lg:text-base leading-relaxed text-white/40">
            Fully managed clusters with a dedicated control plane, auto-scaling node pools, and built-in security — pay only for the worker nodes you use.
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

        {/* ═══════════ SECTION 2: CLUSTER PICKER ═══════════ */}
        <div className="mb-8 lg:mb-10">
          <h3 className="text-2xl sm:text-3xl lg:text-4xl font-[400] tracking-tight text-white">
            Choose Your{" "}
            <span className="text-[#0095FF]">Cluster</span>
          </h3>
          <p className="mt-2 text-sm text-white/40 max-w-lg">
            4 cluster tiers optimized for different workloads — from lightweight dev clusters to GPU-accelerated AI infrastructure.
          </p>
        </div>

        {/* Category tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-12">
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
                {(isGPU
                  ? ["Nodes", "vCPU / Node", "RAM / Node", "Storage / Node", "GPU / Node", "Price", ""]
                  : ["Nodes", "vCPU / Node", "RAM / Node", "Storage / Node", "Price", ""]
                ).map((h) => (
                  <th key={h} className="px-6 py-4 text-left text-[11px] font-medium text-white/25 uppercase tracking-[0.12em] border-b border-white/[0.06]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {active.plans.map((plan: Plan, i: number) => (
                <tr
                  key={`${active.key}-${plan.nodes}-${plan.vcpu}-${plan.ram}`}
                  className={`transition-colors duration-150 hover:bg-white/[0.02] ${
                    i % 2 === 0 ? "bg-transparent" : "bg-white/[0.01]"
                  } ${i < active.plans.length - 1 ? "border-b border-white/[0.04]" : ""}`}
                >
                  <td className="px-6 py-5">
                    <span className="text-[15px] font-[500] text-white tabular-nums">{plan.nodes}</span>
                    <span className="text-[12px] text-white/25 ml-1.5">{plan.nodes === 1 ? "node" : "nodes"}</span>
                  </td>
                  <td className="px-6 py-5 text-[15px] text-white/55 tabular-nums">{plan.vcpu} vCPU</td>
                  <td className="px-6 py-5 text-[15px] text-white/55 tabular-nums">{plan.ram}</td>
                  <td className="px-6 py-5 text-[15px] text-white/55 tabular-nums">{plan.storage}</td>
                  {isGPU && (
                    <td className="px-6 py-5 text-[15px] text-white/55 tabular-nums">{plan.gpu}</td>
                  )}
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
        </div>

        {/* ── Included With Every Cluster ── */}
        <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { label: "Free Control Plane", icon: Boxes },
            { label: "Auto-Scaling", icon: Gauge },
            { label: "DDoS Shield", icon: Shield },
            { label: "Monitoring", icon: Clock },
            { label: "Load Balancer", icon: Network },
            { label: "99.95% SLA", icon: Check },
            { label: "kubectl Access", icon: Server },
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
            Deploy Your First Cluster
            <ArrowRight className="w-4.5 h-4.5" />
          </a>
          <p className="mt-4 text-[13px] text-white/30">
            No credit card required &middot; Free control plane on every cluster
          </p>
        </div>
      </Container>
    </section>
  );
}
