"use client";

import { motion } from "motion/react";
import { Container } from "@/components/ui/container";

const workloadCards = [
  {
    title: "AI & Machine Learning",
    description:
      "Deploy ML models and inference APIs with GPU-optimized containers.",
  },
  {
    title: "Web Hosting & SaaS",
    description:
      "Ship SaaS products with CI/CD, previews, and global edge delivery.",
  },
  {
    title: "Ecommerce Infrastructure",
    description:
      "High-availability storefronts with autoscaling for peak traffic.",
  },
  {
    title: "Database-Driven Apps",
    description:
      "Pair with managed databases for full-stack data applications.",
  },
  {
    title: "Game Development",
    description:
      "Low-latency game servers with real-time scaling across regions.",
  },
  {
    title: "Secure Enterprise Cloud",
    description:
      "SOC 2 compliant deployments with VPC isolation and encryption.",
  },
  {
    title: "Cloud-Native K8s",
    description:
      "Kubernetes-ready workloads with managed orchestration.",
  },
  {
    title: "Storage & Backup",
    description:
      "Persistent volumes and S3-compatible object storage for any workload.",
  },
];

export default function AppDeployWorkloadsSection() {
  return (
    <section className="relative overflow-hidden bg-black py-16 lg:py-24">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
        <div className="absolute left-1/2 top-[12%] h-[380px] w-[900px] -translate-x-1/2 bg-white/[0.02] blur-[120px]" />
      </div>

      <Container>
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.55 }}
          className="mx-auto max-w-2xl text-center"
        >
          <h2 className="text-3xl font-[500] tracking-tight text-white sm:text-4xl">
            Built for every workload
          </h2>
          <p className="mt-3 text-sm leading-7 text-white/55">
            From AI inference to enterprise SaaS, deploy with confidence.
          </p>
        </motion.div>

        <motion.div
          className="mt-12 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-6"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.07 } },
          }}
        >
          {workloadCards.map((card, idx) => {
            const isLastRow = idx >= 6;
            const placementClass =
              idx === 6
                ? "lg:col-start-2"
                : idx === 7
                  ? "lg:col-start-4"
                  : "";

            return (
              <motion.article
                key={card.title}
                variants={{
                  hidden: { opacity: 0, y: 16 },
                  visible: {
                    opacity: 1,
                    y: 0,
                    transition: {
                      duration: 0.45,
                      ease: [0.25, 0.46, 0.45, 0.94],
                    },
                  },
                }}
                className={`group relative overflow-hidden rounded-[2px] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.12),rgba(255,255,255,0.03)_42%,rgba(255,255,255,0.08)_100%)] p-6 sm:p-7 lg:col-span-2 ${placementClass} ${
                  isLastRow ? "sm:col-span-1" : ""
                }`}
              >
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(46,167,255,0.18),transparent_48%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

                <h3 className="relative text-xl font-[500] text-white">
                  {card.title}
                </h3>
                <p className="relative mt-3 text-sm leading-7 text-white/65">
                  {card.description}
                </p>
              </motion.article>
            );
          })}
        </motion.div>
      </Container>
    </section>
  );
}

