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
    <section className="relative z-10 px-4 sm:px-6 lg:px-8 pt-20 pb-20">
      <div className="mx-auto w-full max-w-[1504px]">
        <div
          className="relative mx-auto w-full max-w-[1297px] overflow-visible rounded-lg"
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
          {/* Desktop exact layout */}
          <div className="relative hidden w-full pb-[41.9%] xl:block">
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
                { ...figmaServices[0], left: "54.0%", top: "-12.3%" },
                { ...figmaServices[1], left: "75.6%", top: "-5.2%" },
                { ...figmaServices[2], left: "54.0%", top: "40.1%" },
                { ...figmaServices[3], left: "75.6%", top: "47.3%" },
              ].map((service) => (
                <div
                  key={service.title}
                  className="absolute flex h-[47%] w-[14.6%] min-w-[190px] flex-col rounded-[5px] border border-transparent bg-[#1B1B1B] px-4 py-5 text-left shadow-[0px_5px_17.7px_rgba(0,0,0,0.75)]"
                  style={{ left: service.left, top: service.top }}
                >
                  <div className="relative h-14 w-14">
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

          {/* Responsive layout */}
          <div className="relative px-6 py-10 xl:hidden">
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
                  className="flex min-h-[240px] flex-col rounded-[5px] border border-transparent bg-[#1B1B1B] px-4 py-5 text-left shadow-[0px_5px_17.7px_rgba(0,0,0,0.75)]"
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
        </div>
      </div>
    </section>
  );
}
