"use client";

import Image from "next/image";
import { WideContainer } from "@/components/ui/container";

export function Hero() {
  return (
    // Fill full viewport height on laptops and larger screens
    <section className="relative w-full min-h-screen bg-[#0a0a0f] overflow-hidden">
      
      {/* 1. Main Background Layer */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/images/hero/hero-bg.png"
          alt="Background Pattern"
          fill
          className="object-cover"
          priority
        />
      </div>

        <div className="relative z-10 h-full">
        <WideContainer className="min-h-screen flex items-center pt-25 pb-12 lg:pt-10 lg:pb-0">
          <div className="grid w-full grid-cols-1 items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="text-center lg:text-left lg:pr-4">
            <h1 className="font-normal text-[clamp(36px,5vw,112px)] leading-[1.05] tracking-tight">
              <span className="text-[#0095FF] block">Deploy at the</span>
              <span className="text-[#ECECFB] opacity-90 block">Speed of Light</span>
            </h1>
            <p className="mt-6 text-[#ECECFB] text-[clamp(16px,1.1vw,20px)] leading-[1.6] font-normal opacity-90 max-w-[clamp(520px,42vw,820px)] mx-auto lg:mx-0">
              Deploy, scale, and manage your applications with enterprise-grade security. 
              From GPU instances to AI agents, we provide the tools modern businesses need.
            </p>
            </div>

            <div className="relative w-[min(86vw,560px)] max-w-[560px] aspect-square mx-auto lg:mx-0 lg:w-[clamp(560px,46vw,1400px)] lg:max-w-[1400px] lg:-ml-8">
              {/* Globe */}
              <div className="absolute inset-0 m-auto w-full h-full z-10">
                <Image src="/images/hero/globe.png" alt="Globe" fill className="object-contain object-center" priority />
              </div>

              {/* Geometric Chain */}
              <div className="absolute left-[30%] top-[14%] w-[26%] h-[22%] z-0 opacity-80">
                <Image src="/images/hero/geometry.png" alt="Geometry" fill className="object-contain" style={{ transform: "matrix(-0.46, -0.89, -0.89, 0.46, 0, 0)" }} />
              </div>

              {/* Security Lock */}
              <div className="absolute left-[70%] top-[16%] w-[12%] h-[18%] z-20">
                <Image src="/images/hero/security-lock.png" alt="Security" fill className="object-contain" />
              </div>

              {/* Server Stack */}
              <div className="absolute left-[66%] top-[68%] w-[12%] h-[18%] z-20">
                <Image src="/images/hero/server-stack.png" alt="Server" fill className="object-contain" />
              </div>
            </div>
          </div>
        </WideContainer>
      </div>

    </section>
  );
}
