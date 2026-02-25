"use client";

import Image from "next/image";
import { motion } from "motion/react";

export default function ObjectStorageReleaseSection() {
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
        <div className="flex-[3] flex items-center gap-5 bg-gradient-to-r from-[#0a0b12] to-[#12131c] px-6 sm:px-10 lg:px-16 py-8 lg:py-10 min-h-[160px] lg:min-h-[200px]">
          {/* Small icon badge */}
          <div className="w-10 h-10 rounded-lg bg-[#0095FF]/10 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" className="w-5 h-5 text-[#0095FF]" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7" />
              <rect x="3" y="3" width="18" height="4" rx="1" />
              <path d="M7 8v8" />
              <path d="M12 8v8" />
              <path d="M17 8v8" />
            </svg>
          </div>

          {/* Object Storage logo */}
          <div className="relative w-14 h-14 shrink-0">
            <Image
              src="/images/main-page/object-space.svg"
              alt="Object Storage"
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
        <div className="flex-[2] flex items-center bg-gradient-to-r from-[#c8c8d0] to-[#d8d8de] px-6 sm:px-10 lg:px-16 py-8 lg:py-10 min-h-[160px] lg:min-h-[200px]">
          <div>
            <span className="text-[18px] lg:text-[22px] font-[700] text-black block mb-2">
              S3 Pro
            </span>
            <div className="flex flex-col gap-1 text-[13px] text-black/50">
              <span>Unlimited buckets</span>
              <span>99.999% durability</span>
              <span>Lifecycle automation</span>
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
