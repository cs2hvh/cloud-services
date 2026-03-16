"use client";

import { useRef } from "react";
import Image from "next/image";
import { motion, useScroll, useTransform } from "motion/react";
import { Container } from "@/components/ui/container";

const LEFT_FEATURES = [
  {
    title: "Auto-Scaling Nodes",
    description:
      "Automatically scale your node pools based on workload demands. Save costs during low traffic and handle spikes effortlessly.",
    image: "/images/kubernetes-ui/auto scaling.png",
  },
  {
    title: "Multi-Region Clusters",
    description:
      "Deploy clusters across multiple regions for high availability and disaster recovery. Automatic failover keeps your apps running.",
    image: "/images/kubernetes-ui/Multi region clusters png.png",
  },
  {
    title: "GitOps Ready",
    description:
      "Native integration with ArgoCD, Flux, and other GitOps tools. Declarative deployments from your Git repositories.",
    image: "/images/kubernetes-ui/gitops%20ready.png",
  },
];

const RIGHT_FEATURES = [
  {
    title: "Fully Managed Clusters",
    description:
      "We handle the control plane, upgrades, and maintenance so you can focus on deploying your applications. Zero operational overhead.",
    image: "/images/kubernetes-ui/fully managed.png",
  },
  {
    title: "Built-in Load Balancing",
    description:
      "Native integration with our global load balancers. Expose services with automatic SSL certificates and DDoS protection.",
    image: "/images/kubernetes-ui/Built%20in%20load%20balancing%20png.png",
  },
];

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] as const },
  },
};

function FeatureCard({
  feature,
  index,
}: {
  feature: { title: string; description: string; image: string };
  index: number;
}) {
  return (
    <motion.div
      className="group flex flex-col items-center text-center"
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-60px" }}
      variants={fadeUp}
      transition={{ delay: index * 0.08 }}
    >
      {/* Image with hover float effect */}
      <div className="relative w-full aspect-square max-w-[260px] mb-6 transition-transform duration-500 group-hover:-translate-y-2">
        {/* Glow behind image on hover */}
        <div className="absolute inset-[15%] rounded-full bg-[#0095FF]/[0.06] blur-[40px] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        <Image
          src={feature.image}
          alt={feature.title}
          fill
          className="object-contain relative z-10"
        />
      </div>

      {/* Text */}
      <h3 className="text-[16px] lg:text-[17px] font-[600] text-white mb-2 group-hover:text-[#0095FF] transition-colors duration-300">
        {feature.title}
      </h3>
      <p className="text-[13px] text-white/50 leading-[1.7] max-w-[260px]">
        {feature.description}
      </p>
    </motion.div>
  );
}

export default function KubernetesFeaturesSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });

  const bgY1 = useTransform(scrollYProgress, [0, 1], [0, -140]);
  const bgY2 = useTransform(scrollYProgress, [0, 1], [60, -80]);
  const bgY3 = useTransform(scrollYProgress, [0, 1], [0, -200]);
  const lineX = useTransform(scrollYProgress, [0, 1], ["-20%", "120%"]);

  return (
    <section ref={sectionRef} className="relative w-full py-20 lg:py-32 overflow-hidden">
      {/* ── Background effects ── */}
      <div className="absolute inset-0 -z-10 pointer-events-none">
        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage:
              "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
        {/* Fade grid edges */}
        <div className="absolute inset-0 bg-gradient-to-b from-black via-transparent via-50% to-black" />
        <div className="absolute inset-0 bg-gradient-to-r from-black via-transparent via-50% to-black" />

        {/* Parallax glows */}
        <motion.div
          className="absolute top-[-200px] left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-[#0095FF]/[0.04] rounded-full blur-[160px]"
          style={{ y: bgY1 }}
        />
        <motion.div
          className="absolute top-[40%] right-[-150px] w-[500px] h-[500px] bg-[#336791]/[0.03] rounded-full blur-[130px]"
          style={{ y: bgY2 }}
        />
        <motion.div
          className="absolute bottom-[10%] left-[-100px] w-[400px] h-[400px] bg-[#0095FF]/[0.025] rounded-full blur-[100px]"
          style={{ y: bgY3 }}
        />

        {/* Animated horizontal scan line */}
        <motion.div
          className="absolute top-[35%] h-px w-[200px] bg-gradient-to-r from-transparent via-[#0095FF]/30 to-transparent"
          style={{ left: lineX }}
        />
        <motion.div
          className="absolute top-[65%] h-px w-[150px] bg-gradient-to-r from-transparent via-[#0095FF]/20 to-transparent"
          style={{ left: lineX }}
        />

        {/* Static accent lines */}
        <div className="absolute top-[20%] left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.03] to-transparent" />
        <div className="absolute top-[50%] left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.025] to-transparent" />
        <div className="absolute top-[80%] left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.03] to-transparent" />

        {/* Vertical accents */}
        <div className="absolute top-0 bottom-0 left-[25%] w-px bg-gradient-to-b from-transparent via-white/[0.02] to-transparent" />
        <div className="absolute top-0 bottom-0 right-[25%] w-px bg-gradient-to-b from-transparent via-white/[0.02] to-transparent" />
      </div>

      <Container>
        {/* Header */}
        <motion.div
          className="text-center mb-16 lg:mb-24"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-[400] tracking-tight leading-[1.1] text-white">
            Enterprise Cloud{" "}
            <span className="text-[#0095FF]">Without Complexity</span>
          </h2>
        </motion.div>

        {/* Two-column staggered layout */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 lg:gap-x-14">
          {/* Left column — 3 features */}
          <div className="flex flex-col gap-16 lg:gap-20">
            {LEFT_FEATURES.map((feature, i) => (
              <FeatureCard key={feature.title} feature={feature} index={i} />
            ))}
          </div>

          {/* Right column — 2 features, offset down to stagger */}
          <div className="flex flex-col gap-16 lg:gap-20 mt-14 sm:mt-28 lg:mt-36">
            {RIGHT_FEATURES.map((feature, i) => (
              <FeatureCard key={feature.title} feature={feature} index={i + 3} />
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
