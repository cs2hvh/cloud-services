"use client";
import { BackgroundRippleEffect } from "@/components/ui/background-ripple-effect";
import { Hero } from "@/components/hero"; // Import new Hero component
import { ServicesSection } from "@/components/services-section";
import { ComplianceCta } from "@/components/compliance-cta";
import { WhyTrustUs } from "@/components/why-trust-us";
import { EverythingSection } from "@/components/everything-section";
import { Shield, Zap, Cloud } from "lucide-react";
import GlobalNetworkSection from "@/components/global-network-section";

export default function Home() {
  const features = [
    {
      icon: Shield,
      title: "Enterprise Security",
      description: "Bank-grade encryption and security protocols to protect your infrastructure.",
    },
    {
      icon: Zap,
      title: "Lightning Fast",
      description: "Optimized network routes and NVMe storage for maximum performance.",
    },
    {
      icon: Cloud,
      title: "99.99% Uptime",
      description: "Redundant infrastructure with guaranteed uptime SLA.",
    },
  ];

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

      {/* Features Section */}
      {/* <section className="relative z-10 py-20 px-4 sm:px-6 lg:px-8 border-t border-white/5">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                viewport={{ once: true }}
                className="text-center"
              >
                <div className="inline-flex items-center justify-center w-16 h-16 bg-white/5 rounded-xl mb-4">
                  <feature.icon className="h-8 w-8 text-blue-400" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">
                  {feature.title}
                </h3>
                <p className="text-gray-500 text-sm">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section> */}


     


      <WhyTrustUs />
      <ComplianceCta />

    </div>
  );
}
