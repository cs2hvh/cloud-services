import { BackgroundRippleEffect } from "@/components/ui/background-ripple-effect";
import { Hero } from "@/components/hero"; // Import new Hero component
import { ServicesSection } from "@/components/services-section";
import { ComplianceCta } from "@/components/compliance-cta";
import { WhyTrustUs } from "@/components/why-trust-us";
import { EverythingSection } from "@/components/everything-section";
// import { HomeFeaturesSection } from "@/components/home/features-section";
import GlobalNetworkSection from "@/components/global-network-section";
import FeatureSection from "@/components/feature-section";

export default function Home() {
  return (
    <div className="min-h-screen bg-black relative overflow-hidden">
      {/* Background Effect */}
      <div className="fixed inset-0 w-full h-full [--color-neutral-300:#1f1f23] [--color-neutral-100:#0a0a0a] [--color-neutral-500:#27272a] [--color-neutral-700:#18181b] [--color-neutral-900:#000000] [--color-neutral-800:#09090b]">
        <BackgroundRippleEffect rows={12} cols={30} cellSize={48} />
      </div>

      {/* Hero Section */}
      <Hero />

      {/* Feature section */}
      <FeatureSection />

      {/* Figma Services Section */}
      <ServicesSection />
      {/* Everything you build */}
      <EverythingSection />
      {/* AI agents features section */}
      {/* <AiAgentsSection /> */}
      <GlobalNetworkSection />
      {/* <HomeFeaturesSection /> */}
      <WhyTrustUs />
      <ComplianceCta />
    </div>
  );
}
