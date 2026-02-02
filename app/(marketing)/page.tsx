import { BackgroundRippleEffect } from "@/components/ui/background-ripple-effect";
import { Hero } from "@/components/hero"; // Import new Hero component
import { ServicesSection } from "@/components/services-section";
import { ComplianceCta } from "@/components/compliance-cta";
import { WhyTrustUs } from "@/components/why-trust-us";
import { EverythingSection } from "@/components/everything-section";
import { GlobalNetworkSection } from "@/components/global-network-section";
import { HomeFeaturesSection } from "@/components/home/features-section";

export default function Home() {
  return (
    <div className="min-h-screen bg-black relative overflow-hidden">
      {/* Background Effect */}
      <div className="fixed inset-0 w-full h-full [--color-neutral-300:#1f1f23] [--color-neutral-100:#0a0a0a] [--color-neutral-500:#27272a] [--color-neutral-700:#18181b] [--color-neutral-900:#000000] [--color-neutral-800:#09090b]">
        <BackgroundRippleEffect rows={12} cols={30} cellSize={48} />
      </div>
      
      {/* Hero Section */}
      <Hero />

      {/* Figma Services Section */}
      <ServicesSection />
      
      {/* Stats */}
      {/* <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.2 }}
        className="grid grid-cols-3 gap-8 mt-4 pt-8 border-t border-transparent relative z-10 container mx-auto"
      >
            <div>
              <div className="text-3xl font-bold text-white">1M+</div>
              <div className="text-sm text-gray-500">Happy Customers</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-white">12</div>
              <div className="text-sm text-gray-500">Global Regions</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-white">99.99%</div>
              <div className="text-sm text-gray-500">Uptime SLA</div>
            </div>
          </motion.div> */}


           {/*Everything you build*/}
       <EverythingSection />

      <GlobalNetworkSection />

      <HomeFeaturesSection />


     


      <WhyTrustUs />
      <ComplianceCta />
    </div>
  );
}
