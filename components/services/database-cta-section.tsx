"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { Container } from "@/components/ui/container";
import { ArrowRight, Database } from "lucide-react";

export default function DatabaseCtaSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });
  const bgY = useTransform(scrollYProgress, [0, 1], [30, -50]);
  const bgY2 = useTransform(scrollYProgress, [0, 1], [0, -40]);

  return (
    <section
      ref={sectionRef}
      className="relative w-full py-20 lg:py-28 overflow-hidden"
    >
      {/* Full gradient background */}
      <div className="absolute inset-0 -z-10 pointer-events-none bg-gradient-to-b from-black via-[#040812] to-[#060810]">
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[600px] rounded-full bg-[#0095FF]/[0.07] blur-[180px]"
          style={{ y: bgY }}
        />
        <motion.div
          className="absolute bottom-0 left-[20%] w-[400px] h-[400px] rounded-full bg-[#336791]/[0.05] blur-[120px]"
          style={{ y: bgY2 }}
        />
        {/* Radial overlay for depth */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.4)_70%)]" />
      </div>

      <Container>
        <motion.div
          className="relative text-center"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          {/* Icon */}
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#0095FF]/[0.1] mb-8">
            <Database className="w-7 h-7 text-[#0095FF]" />
          </div>

          <h2 className="text-3xl sm:text-4xl lg:text-[44px] font-[400] tracking-tight leading-[1.12] text-white max-w-2xl mx-auto">
            Ready to Deploy Your{" "}
            <span className="text-[#0095FF]">Production Database?</span>
          </h2>
          <p className="mt-5 text-[15px] lg:text-base leading-[1.7] text-white/60 max-w-xl mx-auto">
            Launch a fully managed database in under 60 seconds. No credit card
            required to start with our free tier.
          </p>

          {/* CTAs */}
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="/signup"
              className="cursor-pointer inline-flex items-center justify-center gap-2 h-12 px-8 bg-[#0095FF] text-white text-[14px] font-medium hover:bg-[#0080dd] transition-colors duration-200"
            >
              Launch a Database
              <ArrowRight className="w-4 h-4" />
            </a>
            <a
              href="/docs"
              className="cursor-pointer inline-flex items-center justify-center gap-2 h-12 px-8 bg-white/[0.06] text-white/80 text-[14px] font-medium hover:bg-white/[0.1] hover:text-white transition-colors duration-200"
            >
              Read the Documentation
            </a>
          </div>

          {/* Trust badges */}
          <div className="mt-12 flex flex-wrap items-center justify-center gap-8 lg:gap-12">
            {[
              "No credit card required",
              "Free tier included",
              "SOC 2 compliant",
              "99.99% uptime SLA",
            ].map((badge) => (
              <span
                key={badge}
                className="text-[11px] text-white/35 uppercase tracking-wider"
              >
                {badge}
              </span>
            ))}
          </div>
        </motion.div>
      </Container>
    </section>
  );
}
