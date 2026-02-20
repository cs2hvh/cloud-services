"use client";

import Image from "next/image";
import { Container } from "@/components/ui/container";

const figmaServices = [
  {
    logoSrc: "/images/hero/server-stack.png",
    logoAlt: "GPU instance",
    title: "GPU instance",
    description:
      "I'm a paragraph. Click here to add your own text and edit me. It's easy. Just click \"Edit Text\" or double click me to add your own content and make changes to the font.",
  },
  {
    logoSrc: "/images/Features/database.png",
    logoAlt: "Database",
    title: "Database",
    description:
      "I'm a paragraph. Click here to add your own text and edit me. It's easy. Just click \"Edit Text\" or double click me to add your own content and make changes to the font.",
  },
  {
    logoSrc: "/images/Features/protection.png",
    logoAlt: "Protection",
    title: "Protection",
    description:
      "I'm a paragraph. Click here to add your own text and edit me. It's easy. Just click \"Edit Text\" or double click me to add your own content and make changes to the font.",
  },
  {
    logoSrc: "/images/Features/ai-agent.png",
    logoAlt: "AI Agent",
    title: "AI Agent",
    description:
      "I'm a paragraph. Click here to add your own text and edit me. It's easy. Just click \"Edit Text\" or double click me to add your own content and make changes to the font.",
  },
  {
    logoSrc: "/images/Features/kubernetes.svg",
    logoAlt: "Kubernetes",
    title: "Kubernetes",
    description:
      "I'm a paragraph. Click here to add your own text and edit me. It’s easy. Just click “Edit Text” or double click me to add your own content and make changes to the font. ",
  },
  {
    logoSrc: "/images/Features/object-space.svg",
    logoAlt: "Object Storage",
    title: "Object Storage",
    description:
      "I'm a paragraph. Click here to add your own text and edit me. It's easy. Just click \"Edit Text\" or double click me to add your own content and make changes to the font.",
  },
];

export function ServicesSection() {
  return (
    <section className="relative z-10 py-20">
      {/* Full-bleed background for the entire section */}
      <div className="absolute inset-0 -z-10">
        <Image
          src="/images/Features/feature-bg.png"
          alt=""
          fill
          className="object-cover opacity-80"
          priority
        />
      </div>
      <Container>
        <div className="relative rounded-none xl:rounded-lg overflow-hidden xl:overflow-visible" style={{ fontFamily: "Sansation, sans-serif" }}>
          {/* Glass panel overlay with border and blur */}
          <div className="absolute inset-0 border border-[rgba(255,255,255,0.33)] bg-[rgba(255,255,255,0.01)] backdrop-blur-[6.3px]" />
          {/* Content wrapper adds inner padding on mobile, none on xl for precise layout */}
          <div className="relative p-[clamp(16px,3.5vw,32px)] xl:p-0">
            {/* Desktop exact layout */}
            <div className="relative hidden w-full pb-[41.9%] xl:block [--service-top-1:-12.3%] [--service-top-2:-5.2%] [--service-top-3:1.3%] [--service-top-4:40.1%] [--service-top-5:47.3%] [--service-top-6:50.3%] 2xl:[--service-top-1:-8.5%] 2xl:[--service-top-2:-1.5%]">
              <div className="absolute inset-0">
                <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/15" />

                <div className="absolute left-[11.2%] top-[32.2%] flex h-[23%] w-[21.3%] items-center justify-center text-center text-[clamp(22px,2.2vw,26px)] leading-[1.25]">
                  <span className="bg-[linear-gradient(90deg,#ffffff_28.8%,rgba(255,255,255,0.75517)_45.71%,rgba(255,255,255,0.4)_95%)] bg-clip-text text-transparent">
                    Services to be known
                  </span>
                </div>

                <div className="absolute left-[9.9%] top-[46.9%] flex h-[23%] w-[23.9%] items-center justify-center text-center text-[clamp(13px,1.15vw,15px)] leading-[1.6]">
                  <span className="bg-[linear-gradient(90deg,#ffffff_28.8%,rgba(255,255,255,0.75517)_45.71%,rgba(255,255,255,0.4)_95%)] bg-clip-text text-transparent">
                    I&apos;m a paragraph. Click here to add your own text and edit me. It&apos;s easy. Just click &quot;Edit Text&quot; or
                    double click me to add your own content and make changes to the font.
                  </span>
                </div>

                {[
                  { ...figmaServices[0], left: "44.0%", topVar: "--service-top-1" },
                  { ...figmaServices[1], left: "65.6%", topVar: "--service-top-2" },
                  { ...figmaServices[4], left: "86.6%", topVar: "--service-top-3" },
                  { ...figmaServices[2], left: "44.0%", topVar: "--service-top-4" },
                  { ...figmaServices[3], left: "65.6%", topVar: "--service-top-5" },
                   { ...figmaServices[5], left: "86.6%", topVar: "--service-top-6" },
                ].map((service) => (
                  <div
                    key={service.title}
                    className="absolute flex h-[47%] w-[14.6%] min-w-[190px] flex-col items-center xl:items-start rounded-[5px] border border-transparent bg-[#1B1B1B] px-4 py-5 text-center xl:text-left shadow-[0px_5px_17.7px_rgba(0,0,0,0.75)]"
                    style={{ left: service.left, top: `var(${service.topVar})` }}
                  >
                    <div className="relative h-14 w-14 self-center xl:self-auto">
                      <Image src={service.logoSrc} alt={service.logoAlt} fill className="object-contain" />
                    </div>
                    <h3 className="mt-3 text-[13px] font-medium text-[#2d8cff] text-center xl:text-left">
                      {service.title}
                    </h3>
                    <p className="mt-2 text-[10px] leading-[14px] text-white/60 text-center xl:text-left">
                      {service.description}
                    </p>
                    <div className="mt-auto pt-4 w-full">
                      <div className="h-px w-full bg-white/20" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Responsive layout */}
            <div className="relative xl:hidden">
              <div className="text-center">
                <div className="text-[26px] leading-[1.2] sm:text-[30px]">
                  <span className="bg-[linear-gradient(90deg,#ffffff_28.8%,rgba(255,255,255,0.75517)_45.71%,rgba(255,255,255,0.4)_95%)] bg-clip-text text-transparent">
                    Services to be known
                  </span>
                </div>
                <p className="mt-6 text-[15px] leading-[24px] text-white/70 max-w-[420px] mx-auto">
                  I&apos;m a paragraph. Click here to add your own text and edit me. It&apos;s easy. Just click &quot;Edit Text&quot; or
                  double click me to add your own content and make changes to the font.
                </p>
              </div>

              <div className="mt-10 grid gap-6 sm:grid-cols-2">
                {figmaServices.map((service) => (
                  <div
                    key={service.title}
                    className="flex min-h-[240px] flex-col items-center sm:items-start rounded-[5px] border border-transparent bg-[#1B1B1B] px-4 py-5 text-center sm:text-left shadow-[0px_5px_17.7px_rgba(0,0,0,0.75)]"
                  >
                    <div className="relative h-12 w-12 self-center sm:self-start">
                      <Image src={service.logoSrc} alt={service.logoAlt} fill className="object-contain" />
                    </div>
                    <h3 className="mt-3 text-[13px] font-medium text-[#2d8cff] text-center sm:text-left">
                      {service.title}
                    </h3>
                    <p className="mt-2 text-[10px] leading-[14px] text-white/60 text-center sm:text-left">
                      {service.description}
                    </p>
                    <div className="mt-auto pt-4 w-full">
                      <div className="h-px w-full bg-white/20" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
