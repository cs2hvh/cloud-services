"use client";

import { assetUrl } from "@/lib/asset-url";
import Image from "next/image";
import { motion } from "motion/react";


export default function ObjectStorageReleaseSection() {
  return (
    <section className="relative z-10 w-full">
      <motion.div
        className="relative w-full overflow-hidden rounded-br-[141px] bg-[#C9C9C9] min-h-[218px] flex items-center"
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
      >
        {/* Spiral line-art background — blurred, right-center */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <Image
            src={assetUrl("/a159e753bfb39b7a12ae7b90c019690a05bab577 (1).png")}
            alt=""
            fill
            sizes="100vw"
            className="object-cover object-center"
            style={{ filter: "blur(2.5px)", opacity: 0.7 }}
          />
        </div>

        {/* Main content row */}
        <div className="relative z-10 w-full flex flex-col lg:flex-row items-center gap-6 px-6 lg:px-16 py-8 lg:py-0 min-h-[218px]">

          {/* Left — megaphone + title */}
          <div className="flex items-center gap-6 flex-1 pl-4 lg:pl-[60px]">
            {/* Megaphone */}
            <div
              className="shrink-0 relative w-[90px] h-[90px] lg:w-[111px] lg:h-[111px]"
              style={{
                filter: "drop-shadow(0px 15px 15px rgba(0,0,0,0.25))",
                transform: "matrix(0.95, -0.32, -0.32, -0.95, 0, 0)",
              }}
            >
              <Image
                src={assetUrl("/e1d5f04fa8af10806f332bf618d0ac4818dbcb78.png")}
                alt="Megaphone"
                fill
                sizes="(min-width: 1024px) 111px, 90px"
                className="object-contain"
              />
            </div>

            {/* Title */}
            <h3
              style={{ fontFamily: "'Sansation', system-ui, sans-serif" }}
              className="text-[28px] lg:text-[40px] font-[700] text-[#1651A9] leading-[1.125] whitespace-nowrap"
            >
              Explore the<br />Latest Release
            </h3>
          </div>

          {/* Right — two glass cards */}
          <div className="flex gap-4 lg:gap-6 shrink-0 pb-2 lg:pb-0">
            {/* Object Pro */}
            <div
              className="w-[180px] lg:w-[281px] min-h-[150px] lg:min-h-[187px] rounded-br-[141px] flex flex-col justify-start px-6 lg:px-8 pt-6 lg:pt-8 pb-6"
              style={{
                background: "rgba(255, 255, 255, 0.18)",
                backdropFilter: "blur(14px)",
                WebkitBackdropFilter: "blur(14px)",
                border: "1px solid rgba(255, 255, 255, 0.45)",
                boxShadow:
                  "0 4px 24px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.6)",
              }}
            >
              <h4 className="text-[16px] lg:text-[22px] font-[700] text-black mb-4">
                Object Pro
              </h4>
              <div className="flex flex-col gap-2 text-[12px] lg:text-[14px] text-black/60">
                <span>10TB</span>
                <span>1.5GB/s</span>
              </div>
            </div>

            {/* Object Ultra */}
            <div
              className="w-[180px] lg:w-[281px] min-h-[150px] lg:min-h-[187px] rounded-br-[141px] flex flex-col justify-start px-6 lg:px-8 pt-6 lg:pt-8 pb-6"
              style={{
                background: "rgba(255, 255, 255, 0.18)",
                backdropFilter: "blur(14px)",
                WebkitBackdropFilter: "blur(14px)",
                border: "1px solid rgba(255, 255, 255, 0.45)",
                boxShadow:
                  "0 4px 24px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.6)",
              }}
            >
              <h4 className="text-[16px] lg:text-[22px] font-[700] text-black mb-4">
                Object Ultra
              </h4>
              <div className="flex flex-col gap-2 text-[12px] lg:text-[14px] text-black/60">
                <span>20TB</span>
                <span>2GB/s throughput</span>
                <span>CDN included</span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
