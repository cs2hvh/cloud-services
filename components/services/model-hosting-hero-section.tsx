"use client";

import { assetUrl } from "@/lib/asset-url";
import Image from "next/image";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";

import { Container } from "@/components/ui/container";
import PixelBlast from "@/components/hero/pixel-blast";

const BRAND = "#0095FF";

type Action = { label: string; href: string };
type Props = { primaryAction?: Action; secondaryAction?: Action };

export default function ModelHostingHeroSection({
  primaryAction = { label: "Deploy a model", href: "/signup" },
  secondaryAction = { label: "View documentation", href: "/api-docs" },
}: Props) {
  return (
    <section className="relative isolate flex min-h-screen flex-col justify-center overflow-hidden bg-[#0E0F0F] pb-16 pt-28 sm:pb-20 sm:pt-32 lg:pb-24">
      {/* PixelBlast backdrop */}
      <div className="absolute inset-0 -z-10">
        <PixelBlast
          variant="circle"
          color={BRAND}
          pixelSize={5}
          patternScale={3}
          patternDensity={0.7}
          pixelSizeJitter={0.5}
          speed={0.3}
          edgeFade={0.4}
          transparent
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(80% 60% at 50% 0%, rgba(0,149,255,0.10), transparent 70%)",
          }}
        />
      </div>

      <Container className="relative z-10">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
          {/* ── LEFT: copy ── */}
          <div>
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
              className="text-4xl font-[400] leading-[1.04] tracking-tight text-white sm:text-5xl lg:text-[3.8rem]"
            >
              Your weights.{" "}
              <span className="text-[#0095FF]">Our autoscaler.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.14 }}
              className="mt-6 max-w-xl text-[15.5px] leading-7 text-white/60 sm:text-[16.5px]"
            >
              Bring a docker image or a HuggingFace model id. We build,
              register, and expose it as a serverless endpoint — autoscaled,
              billed per second, OpenAI-compatible.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.22 }}
              className="mt-8 flex flex-wrap items-center gap-3"
            >
              <Link
                href={primaryAction.href}
                className="group inline-flex items-center gap-2 rounded-[8px] bg-white px-5 py-2.5 text-[13.5px] font-semibold text-black transition-all hover:bg-[#0095FF] hover:text-white"
              >
                {primaryAction.label}
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href={secondaryAction.href}
                className="inline-flex items-center gap-2 rounded-[8px] border border-white/[0.10] bg-white/[0.02] px-5 py-2.5 text-[13.5px] font-medium text-white/85 transition-colors hover:border-white/25 hover:bg-white/[0.05]"
              >
                {secondaryAction.label}
              </Link>
            </motion.div>

            {/* Metric strip */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.36 }}
              className="mt-12 grid grid-cols-2 gap-px overflow-hidden rounded-[8px] border border-white/[0.07] bg-white/[0.02] sm:grid-cols-4"
            >
              {[
                { v: "<1s", l: "Cold start" },
                { v: "0 → N", l: "Autoscale" },
                { v: "Per second", l: "Billing" },
                { v: "4 SKUs", l: "A40 → H100" },
              ].map((m) => (
                <div key={m.l} className="bg-[#0E0F0F] px-4 py-3">
                  <p className="font-mono text-[14px] font-semibold tabular-nums text-[#0095FF]">
                    {m.v}
                  </p>
                  <p className="mt-0.5 font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/40">
                    {m.l}
                  </p>
                </div>
              ))}
            </motion.div>
          </div>

          {/* ── RIGHT: illustration ── */}
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="relative flex items-center justify-center"
          >
            {/* Soft brand-blue glow */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10 rounded-full opacity-60 blur-3xl"
              style={{
                background:
                  "radial-gradient(55% 50% at 50% 50%, rgba(0,149,255,0.40), transparent 70%)",
              }}
            />
            <div className="relative aspect-square w-full lg:scale-125">
              <Image
                src="https://ahurasense.cs2hvh.com/images/2026-06/0MKYzTDtGsPe.png"
                alt="Model hosting infrastructure"
                fill
                priority
                className="object-contain"
              />
            </div>
          </motion.div>
        </div>
      </Container>
    </section>
  );
}
