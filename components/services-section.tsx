"use client";

import Image from "next/image";
import { motion } from "motion/react";
import { Container } from "@/components/ui/container";

const figmaServices = [
  {
    logoSrc: "/images/compute-page/compute-hero.png",
    logoAlt: "Compute",
    title: "Compute",
    description:
      "Elastic virtual machines across 12 global regions. Scale from a single core to hundreds of vCPUs with predictable pricing.",
  },
  {
    logoSrc: "/images/hero/server-stack.png",
    logoAlt: "GPU Instances",
    title: "GPU Instances",
    description:
      "High-performance NVIDIA GPUs on demand. Train models, run inference, and accelerate compute-heavy workloads with bare-metal speed.",
  },
  {
    logoSrc: "/images/Features/database.png",
    logoAlt: "Managed Database",
    title: "Managed Database",
    description:
      "Fully managed PostgreSQL, MySQL, and Redis clusters with automated backups, failover, and point-in-time recovery built in.",
  },
  {
    logoSrc: "/images/Features/protection.png",
    logoAlt: "DDoS Protection",
    title: "DDoS Protection",
    description:
      "Enterprise-grade threat mitigation at the edge. Always-on L3/L4/L7 protection that absorbs attacks before they reach your stack.",
  },
  {
    logoSrc: "/images/Features/ai-agent.png",
    logoAlt: "AI Agents",
    title: "AI Agents",
    description:
      "Deploy autonomous AI agents that monitor, scale, and optimize your infrastructure — reducing manual ops and response times.",
  },
  {
    logoSrc: "/images/Features/kubernetes.svg",
    logoAlt: "Kubernetes",
    title: "Kubernetes",
    description:
      "Production-ready K8s clusters in minutes. Auto-scaling, service mesh, and integrated CI/CD — without the operational overhead.",
  },
  {
    logoSrc: "/images/Features/object-space.svg",
    logoAlt: "Object Storage",
    title: "Object Storage",
    description:
      "S3-compatible storage with 11 nines durability. Store, serve, and manage petabytes of data with predictable, low-cost pricing.",
  },
];

const cardEntrance = {
  hidden: { opacity: 0, y: 30, scale: 0.95 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.5, delay: 0.1 + i * 0.1, ease: [0.25, 0.4, 0.25, 1] as const },
  }),
};

const fadeIn = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.25, 0.4, 0.25, 1] as const },
  },
};

export function ServicesSection() {
  return (
    <section className="relative z-10 py-20">
      {/* Full-bleed background for the entire section */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#0a0a0a] to-black">
        <Image
          src="/images/main-page/our-service.png"
          alt=""
          fill
          className="object-cover opacity-90"
          style={{ objectPosition: "center center" }}
          priority
        />
        {/* Top fade — matches hero #0a0a0a */}
        <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-[#0a0a0a] to-transparent" />
        {/* Bottom fade — blends into next section below */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black to-transparent" />
      </div>
      <Container>
        <div className="relative rounded-none xl:rounded-lg overflow-hidden xl:overflow-visible">
          {/* Content wrapper adds inner padding on mobile, none on xl for precise layout */}
          <div className="relative p-[clamp(16px,3.5vw,32px)] xl:p-0">
            {/* Desktop exact layout */}
            <div className="relative hidden w-full pb-[41.9%] xl:block [--service-top-1:-10%] [--service-top-2:0%] [--service-top-3:10%] [--service-top-4:42.3%] [--service-top-5:52.3%] [--service-top-6:62.3%]">
              <div className="absolute inset-0">

                {/* Heading */}
                <motion.div
                  className="absolute left-[11.2%] top-[32.2%] flex h-[23%] w-[21.3%] items-center justify-center text-center"
                  variants={fadeIn}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, margin: "-50px" }}
                >
                  <h2 className="text-[clamp(28px,3vw,42px)] font-[400] tracking-tight leading-tight text-white whitespace-nowrap">
                    Our Core <span className="text-[#0095FF]">Services</span>
                  </h2>
                </motion.div>

                {/* Subtitle */}
                <motion.div
                  className="absolute left-[9.9%] top-[46.9%] flex h-[23%] w-[23.9%] items-center justify-center text-center"
                  variants={fadeIn}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, margin: "-50px" }}
                >
                  <p className="text-[clamp(13px,1.15vw,15px)] mt-16 leading-relaxed text-white/50">
                    The building blocks behind every deployment. From compute to storage, each service is designed to work seamlessly together.
                  </p>
                </motion.div>

                {[
                  { ...figmaServices[0], left: "44.0%", topVar: "--service-top-1" },
                  { ...figmaServices[1], left: "65.3%", topVar: "--service-top-2" },
                  { ...figmaServices[5], left: "86.6%", topVar: "--service-top-3" },
                  { ...figmaServices[2], left: "44.0%", topVar: "--service-top-4" },
                  { ...figmaServices[4], left: "65.3%", topVar: "--service-top-5" },
                  { ...figmaServices[6], left: "86.6%", topVar: "--service-top-6" },
                ].map((service, i) => (
                  <motion.div
                    key={service.title}
                    className="absolute flex h-[47%] w-[14.6%] min-w-[190px] flex-col items-center xl:items-start rounded-[5px] border border-transparent bg-[#1B1B1B] px-4 py-5 text-center xl:text-left shadow-[0px_5px_17.7px_rgba(0,0,0,0.75)] transition-all duration-300 hover:-translate-y-1 hover:border-[#0095FF]/30 hover:shadow-[0px_5px_25px_rgba(0,149,255,0.15)]"
                    style={{ left: service.left, top: `var(${service.topVar})` }}
                    variants={cardEntrance}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: "-30px" }}
                    custom={i}
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
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Responsive layout */}
            <div className="relative xl:hidden">
              <motion.div
                className="text-center"
                variants={fadeIn}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-50px" }}
              >
                <h2 className="text-3xl sm:text-4xl font-[400] tracking-tight leading-tight text-white">
                  Our Core <span className="text-[#0095FF]">Services</span>
                </h2>
                <p className="mt-4 text-sm sm:text-base leading-relaxed text-white/50 max-w-[420px] mx-auto">
                  The building blocks behind every deployment. From compute to storage, each service is designed to work seamlessly together.
                </p>
              </motion.div>

              <div className="mt-10 grid gap-6 sm:grid-cols-2">
                {figmaServices.map((service, i) => (
                  <motion.div
                    key={service.title}
                    className="flex min-h-[240px] flex-col items-center sm:items-start rounded-[5px] border border-transparent bg-[#1B1B1B] px-4 py-5 text-center sm:text-left shadow-[0px_5px_17.7px_rgba(0,0,0,0.75)] transition-all duration-300 hover:-translate-y-1 hover:border-[#0095FF]/30 hover:shadow-[0px_5px_25px_rgba(0,149,255,0.15)]"
                    variants={cardEntrance}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: "-30px" }}
                    custom={i}
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
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
