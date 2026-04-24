"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Container } from "@/components/ui/container";
import { ArrowRight } from "lucide-react";

export default function AppDeployFinalCtaSection() {
  return (
    <section className="relative overflow-hidden bg-black py-16 lg:py-20">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.08),transparent_55%)]" />
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)", backgroundSize: "30px 30px" }} />
      </div>

      <Container>
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.55, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="mx-auto max-w-3xl text-center"
        >
          <h2 className="text-3xl font-[600] leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
            Ship faster. Scale automatically. Deploy worldwide.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-white/60 sm:text-base">
            Join thousands of teams already deploying with CloudNova.
          </p>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.45, delay: 0.15 }}
            className="mt-8 flex justify-center"
          >
            <Link
              href="/signup"
              className="inline-flex items-center gap-1.5 rounded-[2px] border border-white/20 bg-white px-6 py-3 text-sm font-medium text-black transition-all duration-200 hover:bg-white/90"
            >
              Get Started
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </motion.div>
        </motion.div>
      </Container>
    </section>
  );
}

