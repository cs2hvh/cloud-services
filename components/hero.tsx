"use client";

import Image from "next/image";

export function Hero() {
  return (
    // Height set to 906px to match Figma
    <section className="relative w-full min-h-[900px] h-auto lg:h-[906px] bg-[#0a0a0f] overflow-hidden">
      
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

      {/* --- DESKTOP LAYOUT (Responsive but Design-Faithful) --- */}
      <div className="hidden lg:block w-full h-full absolute inset-0 max-w-[1440px] mx-auto pointer-events-none">
          
          {/* Globe - Positioned using percentages equivalent to Figma pixels (Start ~31% left) */}
          <div className="absolute left-[31.5%] top-[14.5%] w-[68%] h-[85%] z-10">
             <Image src="/images/hero/globe.png" alt="Globe" fill className="object-contain" priority />
          </div>

          {/* Geometric Chain - Behind Globe (z-0) */}
          <div className="absolute left-[43.7%] top-[24.2%] w-[16.4%] h-[14.5%] z-0 opacity-80">
              <Image src="/images/hero/geometry.png" alt="Geometry" fill className="object-contain" style={{ transform: 'matrix(-0.46, -0.89, -0.89, 0.46, 0, 0)' }} />
          </div>

          {/* Security Lock */}
          <div className="absolute left-[75.3%] top-[26.9%] w-[6.7%] h-[11.2%] z-20">
              <Image src="/images/hero/security-lock.png" alt="Security" fill className="object-contain" />
          </div>

          {/* Server Stack */}
           <div className="absolute left-[73.8%] top-[70.2%] w-[6.2%] h-[11.7%] z-20">
              <Image src="/images/hero/server-stack.png" alt="Server" fill className="object-contain" />
          </div>

          {/* Text Content Layer - Using percentage positioning for responsiveness relative to 1440px container */}
          <div className="absolute z-30 text-left pointer-events-auto flex flex-col justify-start" style={{ left: '12.8%', top: '34%', maxWidth: '42%' }}>
              
              <div className="mb-[10px]">
                <h1 className="font-normal text-[4vw] xl:text-[64px] leading-[1.1] tracking-tight">
                  <span className="text-[#0095FF] block">Deploy at the</span>
                  <span className="text-[#ECECFB] opacity-90 block">Speed of Light</span>
                </h1>
              </div>

              <div className="mt-8">
                 <p className="text-[#ECECFB] text-[1.1vw] xl:text-[14.4px] leading-[1.5] font-normal opacity-90 max-w-[492px]">
                    Deploy, scale, and manage your applications with enterprise-grade security. 
                    From GPU instances to AI agents, we provide the tools modern businesses need.
                 </p>
              </div>
          </div>
      </div>

      {/* --- MOBILE/TABLET COMPATIBLE LAYOUT (Responsive Fallback) --- */}
      <div className="lg:hidden container mx-auto px-6 relative z-20 h-full flex flex-col items-center justify-center pt-32 text-center">
        {/* Mobile Globe */}
        <div className="relative w-full max-w-[400px] h-[300px] mb-8">
           <Image src="/images/hero/globe.png" alt="Globe" fill className="object-contain" />
        </div>

        <h1 className="text-4xl md:text-5xl font-bold leading-tight mb-6 tracking-tight text-white drop-shadow-2xl">
            <span className="block text-[#0095FF]">Deploy at the</span>
            <span className="block text-gray-100">Speed of Light</span>
        </h1>
          
        <p className="text-gray-300 text-lg leading-relaxed mb-10 max-w-xl drop-shadow-md">
            Deploy, scale, and manage your applications with enterprise-grade security. 
            From GPU instances to AI agents, we provide the tools modern businesses need.
        </p>
         
         {/* Mobile Icons (Simplified) */}
         <div className="absolute top-[15%] right-[5%] w-16 h-16 opacity-60">
             <Image src="/images/hero/security-lock.png" alt="lock" fill className="object-contain" />
         </div>
      </div>

    </section>
  );
}
