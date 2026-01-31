"use client";

import { Navbar } from "@/components/navbar";
import { BackgroundRippleEffect } from "@/components/ui/background-ripple-effect";
import { WorldMap } from "@/components/world-map";
import { Hero } from "@/components/hero"; // Import new Hero component
import { ServicesSection } from "@/components/services-section";
import { ComplianceCta } from "@/components/compliance-cta";
import { WhyTrustUs } from "@/components/why-trust-us";
import { EverythingSection } from "@/components/everything-section";
import { motion } from "motion/react";
import { Shield, Zap, Cloud } from "lucide-react";
import Link from "next/link";

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
      
      <Navbar />

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





      {/* Features Section */}
      <section className="relative z-10 py-20 px-4 sm:px-6 lg:px-8 border-t border-white/5">
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
      </section>


     


      {/* World Map Section */}
      <section className="relative z-10">
        <WorldMap />
      </section>

      <WhyTrustUs />
      <ComplianceCta />

      {/* Footer */}
      <footer className="relative z-10 bg-[#161618]">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8 pt-16 pb-8">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,200px)_1fr_minmax(0,220px)]">
            <div className="flex items-start">
              <div className="text-2xl font-normal tracking-tight text-white">
                <span>ahura</span>
                <span className="text-[#00AAFF]">cloud</span>
              </div>
            </div>

            <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <h3 className="text-[15px] text-white mb-4">Company</h3>
                <ul className="space-y-2 text-[13px] text-[#ACACAC] font-mono">
                  <li><Link href="#" className="hover:text-white transition-colors">Blog</Link></li>
                  <li><Link href="#" className="hover:text-white transition-colors">Careers</Link></li>
                  <li><Link href="#" className="hover:text-white transition-colors">Pricing</Link></li>
                  <li><Link href="#" className="hover:text-white transition-colors">Customers</Link></li>
                </ul>
              </div>
              <div>
                <h3 className="text-[15px] text-white mb-4">Resources</h3>
                <ul className="space-y-2 text-[13px] text-[#ACACAC] font-mono">
                  <li><Link href="#" className="hover:text-white transition-colors">Documentation</Link></li>
                  <li><Link href="#" className="hover:text-white transition-colors">Papers</Link></li>
                  <li><Link href="#" className="hover:text-white transition-colors">Press</Link></li>
                </ul>
              </div>
              <div>
                <h3 className="text-[15px] text-white mb-4">Solutions</h3>
                <ul className="space-y-2 text-[13px] text-[#ACACAC] font-mono">
                  <li><Link href="#" className="hover:text-white transition-colors">PCI Compliance</Link></li>
                  <li><Link href="#" className="hover:text-white transition-colors">Encryption as a Service</Link></li>
                  <li><Link href="#" className="hover:text-white transition-colors">Credentials Encryption</Link></li>
                  <li><Link href="#" className="hover:text-white transition-colors">File Encryption</Link></li>
                  <li><Link href="#" className="hover:text-white transition-colors">PII Encryption</Link></li>
                  <li><Link href="#" className="hover:text-white transition-colors">HIPAA Compliance</Link></li>
                </ul>
              </div>
              <div>
                <h3 className="text-[15px] text-white mb-4">Legal</h3>
                <ul className="space-y-2 text-[13px] text-[#ACACAC] font-mono">
                  <li><Link href="#" className="hover:text-white transition-colors">Terms of Service</Link></li>
                  <li><Link href="#" className="hover:text-white transition-colors">Privacy Policy</Link></li>
                  <li><Link href="#" className="hover:text-white transition-colors">Cookies Policy</Link></li>
                  <li><Link href="#" className="hover:text-white transition-colors">Data Processing</Link></li>
                </ul>
              </div>
            </div>

            <div>
              <h3 className="text-[15px] text-white mb-4">Compliance</h3>
              <div className="space-y-3 text-[13px] text-[#ACACAC] font-mono">
                <div className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-[9px] font-semibold text-white/70">
                    PCI
                  </span>
                  <span>PCI Level 1</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-[9px] font-semibold text-white/70">
                    SOC
                  </span>
                  <span>SOC 2 Type II</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-12 border-t border-[#2A2B3A] pt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[12.8px] text-[#BABCD2]">
              © 2026 ahuracloud. All rights reserved.
            </p>
            <div className="flex items-center gap-2 text-[12.8px] text-[#BABCD2] font-mono">
              <span className="h-1.5 w-1.5 rounded-full bg-[#00AAFF]" />
              <span>All systems normal</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
