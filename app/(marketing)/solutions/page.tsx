"use client";

import { useState } from "react";
import { SolutionsAdvisorySection } from "@/components/solutions/solutions-advisory-section";
import { SolutionsDiscoverySection } from "@/components/solutions/solutions-discovery-section";
import { SolutionsHeroSection } from "@/components/solutions/solutions-hero-section";
import { HeroStats } from "@/components/solutions/shared/hero-stats";

const PLATFORM_STATS = [
  { value: "8", label: "Solution patterns", sub: "purpose-built use cases" },
  { value: "8", label: "Core products", sub: "composable building blocks" },
  { value: "15", label: "Global locations", sub: "low-latency everywhere" },
  { value: "99.99%", label: "Uptime SLA", sub: "across all services" },
];

export default function SolutionsPage() {
  const [activeTab, setActiveTab] = useState<"solutions" | "products">("solutions");

  return (
    <main className="bg-[#0D0D0F]">
      <SolutionsHeroSection />
      <HeroStats metrics={PLATFORM_STATS} eyebrow="Platform at a glance" />
      <SolutionsDiscoverySection activeTab={activeTab} setActiveTabAction={setActiveTab} />
      <SolutionsAdvisorySection activeTab={activeTab} />
    </main>
  );
}
