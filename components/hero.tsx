"use client";

import Image from "next/image";

export function Hero() {
  return (
    // Height set to 906px to match Figma
    <section className="relative w-full min-h-[760px] sm:min-h-[820px] lg:min-h-[900px] lg:h-[906px] bg-[#0a0a0f] overflow-hidden">
      
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
        <div className="mx-auto grid h-full max-w-[1040px] grid-cols-1 items-center gap-6 px-6 pb-6 pt-16 sm:pt-20 lg:grid-cols-[0.95fr_1.05fr] lg:gap-0 lg:px-8 lg:pt-0">
          <div className="text-center lg:text-left lg:pr-4">
            <h1 className="font-normal text-[clamp(36px,4.4vw,64px)] leading-[1.1] tracking-tight">
              <span className="text-[#0095FF] block">Deploy at the</span>
              <span className="text-[#ECECFB] opacity-90 block">Speed of Light</span>
            </h1>
            <p className="mt-6 text-[#ECECFB] text-[clamp(14px,1.05vw,14.4px)] leading-[1.6] font-normal opacity-90 max-w-[520px] mx-auto lg:mx-0">
              Deploy, scale, and manage your applications with enterprise-grade security. 
              From GPU instances to AI agents, we provide the tools modern businesses need.
            </p>
          </div>

          <div className="relative mx-auto w-full max-w-[900px] aspect-[1/1] lg:aspect-[1/1] lg:-ml-6 lg:scale-110 xl:scale-125">
            {/* Globe */}
            <div className="absolute left-[0%] top-[0%] w-[100%] h-[100%] z-10">
              <Image src="/images/hero/globe.png" alt="Globe" fill className="object-contain" priority />
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
      </div>

    </section>
  );
}
