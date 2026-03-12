"use client";

import { motion } from "motion/react";
import { Container } from "@/components/ui/container";

const AGENT_CARDS = [
  {
    title: "Personal AI Agents for Your Business",
    items: [
      "Sales Lead Qualification Agents",
      "Customer Support Chat Agents",
      "Internal Knowledge Assistants",
      "DevOps Monitoring Agents",
    ],
  },
  {
    title: "Train & Fine-Tune LLMs on Dedicated GPUs",
    items: ["LLaMA", "Mistral", "Falcon", "Custom Enterprise Models"],
  },
  {
    title: "One-Click Agent Deployment",
    items: [
      "Pre-configured environments",
      "Optimized GPU acceleration",
      "Auto-scaling support",
      "API & Webhook integrations",
    ],
  },
];

const cardEntrance = {
  hidden: { opacity: 0, y: 24, scale: 0.98 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.6, delay: 0.1 + i * 0.12, ease: [0.25, 0.4, 0.25, 1] as const },
  }),
};

export function AiAgentsSection() {
  return (
    <section className="relative z-10 bg-[#AFAFAF] py-16 sm:py-20">
      <Container>
        <div className="mb-4 sm:mb-12 text-center">
          {/* <p className="text-[11px] sm:text-xs uppercase tracking-[0.35em] text-black/60">
            AI Agents
          </p>
          <h2 className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-[400] tracking-tight text-black">
            Intelligence that scales with you
          </h2>
          <p className="mt-3 text-sm sm:text-base text-black/70 max-w-2xl mx-auto">
            Build, train, and deploy agent systems with dedicated infrastructure and one-click orchestration.
          </p> */}
        </div>

        <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-3 xl:gap-5">
          {AGENT_CARDS.map((card, index) => (
            <motion.div
              key={card.title}
              className="relative flex items-center justify-center py-6 overflow-visible"
              variants={cardEntrance}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
              custom={index}
            >
              <div className="rounded-[10px] absolute left-1/2 top-1/2 h-[clamp(200px,34vw,356px)] w-[clamp(220px,38vw,200px)] -translate-x-1/2 -translate-y-1/2 origin-left skew-x-[30deg]  bg-[linear-gradient(134.02deg,#004E97_5.28%,#2D2D2D_76.01%)] shadow-[0_30px_45px_rgba(0,0,0,0.35)] " />
              <div
                className="relative z-10 w-full max-w-[260px] rounded-[10px] bg-white/10 p-6 sm:p-7 text-white/90 backdrop-blur-[20px] md:aspect-square md:flex md:flex-col md:justify-center"
                style={{
                  boxShadow:
                    "inset 3px 3px 0px -3px #00000080, inset -2px -2px 1px -2px #B3B3B3, inset 2px 2px 1px -2px #B3B3B3, inset 0px 0px 0px 1px #999999, inset 0px 0px 22px 0px #F2F2F280",
                }}
              >
                <h3 className="text-lg sm:text-xl font-semibold leading-tight text-white">
                  {card.title}
                </h3>
                <ul className="mt-4 space-y-2 text-sm sm:text-[14px] text-white/85">
                  {card.items.map((item) => (
                    <li key={item} className="leading-relaxed">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          ))}
        </div>
      </Container>
    </section>
  );
}
