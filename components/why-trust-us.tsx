"use client";

import { assetUrl } from "@/lib/asset-url";
import Image from "next/image";
import { Container } from "@/components/ui/container";
import { motion } from "motion/react";

const trustFeatures = [
  {
    title: "Fundamentally Configurable",
    description: (
      <>
        ahura
        <span className="text-[#0095FF]">cloud</span> products work together and
        can be adapted to any type of solution.
      </>
    ),
    iconSrc: assetUrl("/images/whyTrustUs/configure.svg"),
  },
  {
    title: "Volume",
    description: (
      <>
        ahura
        <span className="text-[#0095FF]">cloud</span> processes millions of
        encryption operations every day.
      </>
    ),
    iconSrc: assetUrl("/images/whyTrustUs/volume.svg"),
  },
  {
    title: "Write and Deploy in Seconds",
    description:
      "Built so developers spend less time and money on data security and compliance.",
    iconSrc: assetUrl("/images/whyTrustUs/write-and-deploy.svg"),
  },
  {
    title: "Globally Distributed",
    description: (
      <>
        ahura
        <span className="text-[#0095FF]">cloud</span> resources are deployed in
        multiple regions to optimize uptime.
      </>
    ),
    iconSrc: assetUrl("/images/whyTrustUs/gloabal.png"),
  },
  {
    title: "Enclave-backed",
    description:
      "Built on isolated, hardened, and highly constrained secure enclaves.",
    iconSrc: assetUrl("/images/whyTrustUs/enclave-backend.svg"),
  },
  {
    title: "Ultra-Low Latency",
    description:
      "Encryption and decryption operations introduce a minimal latency penalty.",
    iconSrc: assetUrl("/images/whyTrustUs/latency.svg"),
  },
];

export function WhyTrustUs() {
  return (
    <section className="relative z-10 py-16 lg:py-24">
      {/* Background */}
      <div className="absolute inset-0 -z-10 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-black" />

        {/* Top/bottom fade */}
        <div className="absolute top-0 left-0 right-0 h-48 bg-gradient-to-b from-black to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black to-transparent" />

        {/* Top divider */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[60%] h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>

      <Container>
        {/* Section heading — moved from global network */}
        <motion.div
          className="text-center mb-12 lg:mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.6, ease: [0.25, 0.4, 0.25, 1] as const }}
        >
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-[400] tracking-tight leading-tight text-white">
            Powered by an easy-to-use,
            <br />
            developer-friendly <span className="text-[#0095FF]">platform</span>
          </h2>
          <p className="mt-4 lg:mt-5 mx-auto max-w-2xl text-sm sm:text-base leading-relaxed text-white/50 px-4">
            All services share a common suite of platform features that enhance security
            and ensure seamless integration into your existing infrastructure.
          </p>
        </motion.div>

        {/* Content */}
        <div className="grid gap-10 lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)] lg:items-start lg:gap-16">
          {/* Left — image card */}
          <motion.div
            className="relative overflow-hidden"
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.25, 0.4, 0.25, 1] as const }}
          >
            {/* Double border frame */}
            <div className="relative border border-white/[0.06] p-[1px]">
              <div className="relative border border-white/[0.08] overflow-hidden">
                <div className="absolute inset-0">
                  <Image
                    src={assetUrl("/images/Complince/why-trust-us-bg.png")}
                    alt=""
                    fill
                    className="object-cover object-center"
                    sizes="(min-width: 1024px) 460px, (min-width: 640px) 60vw, 90vw"
                  />
                  <div className="absolute inset-0 bg-black/50" />
                </div>
                <div className="relative z-10 flex h-[520px] flex-col justify-start px-6 pt-16 sm:h-[560px] sm:px-8 sm:pt-20 lg:h-[620px]">
                  <h3 className="text-4xl sm:text-5xl lg:text-[64px] leading-tight text-white">
                    Why trust us?
                  </h3>
                  <p className="mt-6 max-w-[360px] text-sm sm:text-base lg:text-lg leading-relaxed text-white/50">
                    ahura
                    <span className="text-[#0095FF]">cloud</span> is secure by
                    default. We build, manage, and implement security best practices
                    into the platform so you don&apos;t have to.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Right — feature list */}
          <motion.div
            className="space-y-8"
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.6, delay: 0.2, ease: [0.25, 0.4, 0.25, 1] as const }}
          >
            {trustFeatures.map((feature, index) => {
              return (
                <div key={feature.title} className="space-y-4">
                  <div>
                    <h4 className="flex items-center gap-2 text-xl sm:text-2xl lg:text-[32px] leading-tight text-white">
                      <span className="relative h-7 w-7 shrink-0">
                        <Image
                          src={feature.iconSrc}
                          alt=""
                          fill
                          className="object-contain"
                        />
                      </span>
                      <span>{feature.title}</span>
                    </h4>
                    <p className="mt-2 text-sm sm:text-base lg:text-lg leading-relaxed text-white/50">
                      {feature.description}
                    </p>
                  </div>
                  {index !== trustFeatures.length - 1 && (
                    <div className="w-full max-w-[420px] h-px bg-gradient-to-r from-white/15 via-[#0095FF]/20 to-transparent" />
                  )}
                </div>
              );
            })}
          </motion.div>
        </div>
      </Container>
    </section>
  );
}
