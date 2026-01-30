"use client";

import Image from "next/image";

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
];

export function ServicesSection() {
  return (
    <section className="relative z-10 px-4 sm:px-6 lg:px-8 pt-8 pb-20">
      <div className="mx-auto w-full max-w-[1504px]">
        <div
          className="relative mx-auto h-[543px] w-full max-w-[1297px] overflow-visible"
          style={{ fontFamily: "Sansation, sans-serif" }}
        >
          <div className="absolute inset-0">
            <Image
              src="/images/Features/feature-bg.png"
              alt=""
              fill
              className="object-cover opacity-80"
              priority
            />
            <div className="absolute inset-0 border border-[rgba(255,255,255,0.33)] bg-[rgba(255,255,255,0.01)] backdrop-blur-[6.3px]" />
          </div>
          <div className="absolute left-1/2 top-0 hidden h-full w-px bg-white/15 lg:block" />

          <div className="absolute left-[145px] top-[175px] flex h-[125px] w-[277px] items-center justify-center text-center text-[26px] leading-[64px]">
            <span className="bg-[linear-gradient(90deg,#ffffff_28.8%,rgba(255,255,255,0.75517)_45.71%,rgba(255,255,255,0.4)_95%)] bg-clip-text text-transparent">
              Services to be known
            </span>
          </div>

          <div className="absolute left-[129px] top-[255px] flex h-[125px] w-[310px] items-center justify-center text-center text-[15px] leading-[24px]">
            <span className="bg-[linear-gradient(90deg,#ffffff_28.8%,rgba(255,255,255,0.75517)_45.71%,rgba(255,255,255,0.4)_95%)] bg-clip-text text-transparent">
              I&apos;m a paragraph. Click here to add your own text and edit me. It&apos;s easy. Just click &quot;Edit Text&quot; or
              double click me to add your own content and make changes to the font.
            </span>
          </div>

          {[
            { ...figmaServices[0], left: 701, top: -67 },
            { ...figmaServices[1], left: 980, top: -28 },
            { ...figmaServices[2], left: 701, top: 218 },
            { ...figmaServices[3], left: 980, top: 257 },
          ].map((service) => (
            <div
              key={service.title}
              className="absolute flex h-[255px] w-[190px] flex-col rounded-[5px] border border-transparent bg-[#1B1B1B] px-4 py-5 text-left shadow-[0px_5px_17.7px_rgba(0,0,0,0.75)]"
              style={{ left: service.left, top: service.top }}
            >
              <div className="relative h-12 w-12">
                <Image src={service.logoSrc} alt={service.logoAlt} fill className="object-contain" />
              </div>
              <h3 className="mt-3 text-[13px] font-medium text-[#2d8cff]">
                {service.title}
              </h3>
              <p className="mt-2 text-[10px] leading-[14px] text-white/60">
                {service.description}
              </p>
              <div className="mt-auto pt-4">
                <div className="h-px w-10 bg-white/20" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
