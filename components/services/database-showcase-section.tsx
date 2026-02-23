"use client";

import Image from "next/image";
import { motion } from "motion/react";
import { Container } from "@/components/ui/container";

export default function DatabaseShowcaseSection() {
  return (
    <section className="relative w-full bg-gradient-to-b from-black via-[#050810] to-black py-16 lg:py-24 overflow-hidden">
      {/* Glows */}
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1200px] h-[700px] bg-[#0095FF]/[0.04] rounded-full blur-[140px]" />
        <div className="absolute bottom-0 right-[-200px] w-[500px] h-[500px] bg-[#336791]/[0.03] rounded-full blur-[120px]" />
      </div>

      <Container>
        <motion.div
          className="relative"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          {/* Soft glow behind image */}
          <div className="absolute -inset-6 bg-[#0095FF]/[0.03] rounded-3xl blur-3xl pointer-events-none" />

          <Image
            src="/images/main-page/service-home-db-section-3.png"
            alt="Database Management Dashboard"
            width={2400}
            height={1200}
            sizes="75vw"
            className="relative w-full h-auto object-contain"
          />

          {/* Caption */}
          <div className="mt-6 flex items-center justify-center gap-6 text-[12px] text-white/45">
            <span>Connection Pooling</span>
            <span className="w-1 h-1 rounded-full bg-white/25" />
            <span>Query Monitoring</span>
            <span className="w-1 h-1 rounded-full bg-white/25" />
            <span>Automated Failover</span>
          </div>
        </motion.div>
      </Container>
    </section>
  );
}
