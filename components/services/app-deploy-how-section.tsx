"use client";

import Image from "next/image";
import { motion } from "motion/react";
import { Container } from "@/components/ui/container";

function RevolvingCubeStack() {
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 [perspective:900px]">
      <motion.div
        className="[transform-style:preserve-3d]"
        animate={{
          rotateY: [0, 360],
          y: [0, -8, 0, 8, 0],
        }}
        transition={{
          rotateY: { duration: 7.5, repeat: Infinity, ease: "linear" },
          y: { duration: 3.8, repeat: Infinity, ease: "easeInOut" },
        }}
      >
        <div className="relative h-28 w-16 sm:h-32 sm:w-20 [transform-style:preserve-3d]">
          {[0, 1, 2, 3].map((layer) => {
            const top = layer * 24;
            return (
              <div
                key={layer}
                className="absolute left-0 [transform-style:preserve-3d]"
                style={{ top }}
              >
                <div className="absolute h-5 w-10 border border-cyan-300/60 bg-cyan-400/35 sm:h-6 sm:w-12" />
                <div className="absolute h-5 w-10 border border-cyan-300/30 bg-cyan-500/25 sm:h-6 sm:w-12 [transform:rotateY(90deg)_translateZ(20px)] sm:[transform:rotateY(90deg)_translateZ(24px)]" />
                <div className="absolute h-5 w-10 border border-white/35 bg-white/10 sm:h-6 sm:w-12 [transform:translateZ(20px)] sm:[transform:translateZ(24px)]" />
              </div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}

export default function AppDeployHowSection() {
  return (
    <section className="relative overflow-hidden bg-black py-16 lg:py-24">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />
        <div className="absolute left-1/2 top-0 h-[620px] w-[900px] -translate-x-1/2 bg-cyan-400/[0.07] blur-[120px]" />
      </div>

      <Container>
        <div className="grid gap-10 md:grid-cols-2 md:items-center">
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6 }}
          >
            <p className="text-sm text-white/55">How it works</p>
            <h2 className="mt-3 text-3xl font-[500] tracking-tight text-white sm:text-4xl">
              Deploy From Git
              <span className="text-[#2EA7FF]"> in Minutes</span>
            </h2>
            <p className="mt-4 max-w-md text-sm leading-7 text-white/50">
              Push your code, we detect the runtime, build your app, and bring it
              live with automatic networking, SSL, and scaling defaults.
            </p>
          </motion.div>

          {/* animated-1 */}
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.65 }}
            className="mx-auto w-full max-w-[360px]"
          >
            <div className="relative aspect-square overflow-hidden rounded-sm border border-white/10 bg-[#0B0D12]">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.2),transparent_62%)]" />

              <div className="pointer-events-none absolute bottom-[13%] left-1/2 z-10 -translate-x-1/2">
                <motion.div
                  className="h-28 w-28 rounded-full border border-cyan-300/30 sm:h-32 sm:w-32"
                  animate={{ scale: [1, 1.08, 1], opacity: [0.35, 0.8, 0.35] }}
                  transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
                />
                <motion.div
                  className="absolute inset-[-12px] rounded-full border border-cyan-200/25 border-dashed"
                  animate={{ rotate: [0, 360], opacity: [0.2, 0.45, 0.2] }}
                  transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                />
                <motion.div
                  className="absolute inset-[-22px] rounded-full bg-cyan-400/10 blur-xl"
                  animate={{ opacity: [0.15, 0.35, 0.15] }}
                  transition={{ duration: 3.1, repeat: Infinity, ease: "easeInOut" }}
                />
              </div>

              <motion.div
                className="absolute inset-0"
                animate={{ y: [0, -8, 0], scale: [1, 1.02, 1] }}
                transition={{ duration: 4.4, ease: "easeInOut", repeat: Infinity }}
              >
                <Image
                  src="/images/main-page/service-home-app-deploy-sec-2.svg"
                  alt="Deployment workflow visual"
                  fill
                  className="object-contain p-5 sm:p-6"
                />
              </motion.div>
              <RevolvingCubeStack />
            </div>
          </motion.div>
        </div>

      </Container>
    </section>
  );
}
