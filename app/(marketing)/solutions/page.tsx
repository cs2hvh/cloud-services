import { SolutionsAdvisorySection } from "@/components/solutions/solutions-advisory-section";
import { SolutionsDiscoverySection } from "@/components/solutions/solutions-discovery-section";
import { SolutionsHeroSection } from "@/components/solutions/solutions-hero-section";

export default function SolutionsPage() {
  return (
    <main className="bg-black">
      <SolutionsHeroSection />
      <SolutionsDiscoverySection />
      <SolutionsAdvisorySection />
    </main>
  );
}
