"use client";

import Image from "next/image";
import { motion } from "motion/react";

export default function KubernetesReleaseSection() {
  return (
    <section className="relative z-10 w-full">
      <motion.div
        className="flex flex-col sm:flex-row w-full"
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
      >
        {/* Left — dark side (~60%) */}
        <div className="flex-[3] flex items-center gap-5 bg-gradient-to-r from-[#0a0b12] to-[#12131c] px-10 lg:px-16 py-8 lg:py-10 min-h-[160px] lg:min-h-[200px]">
          {/* Small icon badge */}
          <div className="w-10 h-10 rounded-lg bg-[#0095FF]/10 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" className="w-5 h-5 text-[#0095FF]" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="7.5 4.21 12 6.81 16.5 4.21" />
              <polyline points="7.5 19.79 7.5 14.6 3 12" />
              <polyline points="21 12 16.5 14.6 16.5 19.79" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
          </div>

          {/* Kubernetes logo */}
          <div className="relative w-14 h-14 shrink-0">
            <Image
              src="/images/main-page/kubernetes.png"
              alt="Kubernetes"
              fill
              className="object-contain"
            />
          </div>

          <div>
            <h3 className="text-[20px] lg:text-[24px] font-[600] text-[#0095FF] leading-[1.2]">
              Explore the
            </h3>
            <h3 className="text-[20px] lg:text-[24px] font-[600] text-[#0095FF] leading-[1.2]">
              Latest Release
            </h3>
          </div>
        </div>

        {/* Right — white/light side (~40%) */}
        <div className="flex-[2] flex items-center bg-gradient-to-r from-[#c8c8d0] to-[#d8d8de] px-10 lg:px-16 py-8 lg:py-10 min-h-[160px] lg:min-h-[200px]">
          <div>
            <span className="text-[18px] lg:text-[22px] font-[700] text-black block mb-2">
              K8s Pro
            </span>
            <div className="flex flex-col gap-1 text-[13px] text-black/50">
              <span>3 nodes (12 vCPU / 48GB)</span>
              <span>Auto-scaling</span>
              <span>2TB storage</span>
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
