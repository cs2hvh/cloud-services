"use client";

import { useState } from "react";
import { SolutionsAdvisorySection } from "@/components/solutions/solutions-advisory-section";
import { SolutionsDiscoverySection } from "@/components/solutions/solutions-discovery-section";
import { SolutionsHeroSection } from "@/components/solutions/solutions-hero-section";

export default function SolutionsPage() {
  const [activeTab, setActiveTab] = useState<"solutions" | "products">("solutions");

  return (
    <main style={{backgroundColor:"#0E0F0F"}}>
      <SolutionsHeroSection />
      <SolutionsDiscoverySection activeTab={activeTab} setActiveTab={setActiveTab} />
      <SolutionsAdvisorySection activeTab={activeTab} />
    </main>
  );
}
