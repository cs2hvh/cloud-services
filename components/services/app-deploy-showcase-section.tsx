"use client";

import Image from "next/image";
import { motion } from "motion/react";
import { Container } from "@/components/ui/container";

//latest_changes
//latest_changes

export default function AppDeployShowcaseSection() {
  return (
    <section className="relative w-full bg-black py-16 lg:py-24 overflow-hidden">
      {/* Subtle glow */}
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[600px] bg-[#0095FF]/[0.03] rounded-full blur-[120px]" />
      </div>

      <Container>
        <motion.div
          className="relative"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          {/* Image container with border frame */}
          <div className="relative border border-white/[0.08] bg-white/[0.02] p-2 lg:p-3">
            <div className="absolute -inset-4 bg-[#0095FF]/[0.02] rounded-3xl blur-2xl pointer-events-none" />

            <Image
              src="/images/main-page/service-home-app-section-3.png"
              alt="App Deployment Dashboard"
              width={2400}
              height={1200}
              sizes="75vw"
              className="relative w-full h-auto object-contain"
            />
          </div>

          {/* Caption */}
          <div className="mt-6 flex items-center justify-center gap-6 text-[12px] text-white/30">
            <span>CI/CD Pipeline</span>
            <span className="w-1 h-1 rounded-full bg-white/15" />
            <span>Real-time Build Logs</span>
            <span className="w-1 h-1 rounded-full bg-white/15" />
            <span>One-click Rollbacks</span>
          </div>
        </motion.div>
      </Container>
    </section>
  );
}
