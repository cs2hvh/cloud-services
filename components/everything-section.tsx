"use client";

import { useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "motion/react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";

const TABS = [
  {
    id: "compute",
    label: "Compute",
    title: "Compute",
    heading: "Elastic compute for any workload",
    description:
      "Scale from small services to massive distributed systems with consistent performance and predictable pricing.",
    bullets: [
      "Autoscaling instances across global regions",
      "Optimized networking for low-latency services",
      "Built-in metrics, logs, and alerts",
      "Developer-friendly APIs and CLI tooling",
    ],
    imageSrc: "/images/hero/globe.png",
    imageAlt: "Global compute visualization",
  },
  {
    id: "database",
    label: "Database",
    title: "Database",
    heading: "Resilient data, fully managed",
    description:
      "Launch production-ready databases in minutes with automated backups, high availability, and point-in-time recovery.",
    bullets: [
      "Managed PostgreSQL and distributed storage",
      "Automated backups and retention policies",
      "Zero-downtime maintenance windows",
      "Fine-grained access controls and audit trails",
    ],
    imageSrc: "/images/Features/database.png",
    imageAlt: "Database illustration",
  },
  {
    id: "gpu",
    label: "GPU Instance",
    title: "GPU Instance",
    heading: "GPU Instance",
    description:
      "Description Unleash high-performance computing power for your most demanding workloads. Accelerate AI training, 3D rendering, and complex video processing with dedicated GPU resources optimized for maximum throughput and low latency.",
    bullets: [
      "NVIDIA H100 & A100 Tensor Core clusters",
      "Scalable infrastructure for deep learning & LLMs",
      "High-fidelity 3D rendering and transcoding",
      "Jupyter Notebook and container integrations",
    ],
    imageSrc: "/images/main-page/gpu-instance.svg",
    imageAlt: "GPU server stack",
  },
  {
    id: "security",
    label: "Security",
    title: "Security",
    heading: "Security built into every layer",
    description:
      "Protect your workloads with enterprise-grade security controls, real-time monitoring, and automated responses.",
    bullets: [
      "Network-level DDoS protection and WAF",
      "Secrets management and KMS integrations",
      "Continuous configuration and posture scanning",
      "Granular IAM for teams and services",
    ],
    imageSrc: "/images/Features/protection.png",
    imageAlt: "Security shield illustration",
  },
  {
    id: "ai-agent",
    label: "AI Agent",
    title: "AI Agent",
    heading: "Ship AI-native products faster",
    description:
      "Build, deploy, and observe AI agents with first-class tooling, vector storage, and secure model access.",
    bullets: [
      "Managed vector databases and embeddings",
      "Secure model gateways and rate limits",
      "Event streams and observability for agents",
      "Production-ready workflows and automations",
    ],
    imageSrc: "/images/Features/ai-agent.png",
    imageAlt: "AI agent illustration",
  },
  {
    id: "kubernetes",
    label: "Kubernetes",
    title: "Kubernetes",
    heading: "Build and scale on Kubernetes, without the hassle",
    description:
      "Enterprise-grade Kubernetes clusters with automatic scaling, seamless updates, and built-in security. Deploy containerized applications at any scale.",
    bullets: [
      "Fully Managed Clusters",
      "Auto-Scaling Nodes",
      "Built-in Load Balancing",
      "Multi-Region Clusters ",
    ],
    imageSrc: "/images/main-page/kubernetes.svg",
    imageAlt: "Kubernetes illustration",
  },
   {
    id: "object-storage",
    label: "Object Storage",
    title: "Object Storage",
    heading: "create space buckets, store and manage data globally",
    description:
      "Drop-in replacement for Amazon S3. Use your existing tools, SDKs, and workflows without any code changes required.",
    bullets: [
      "S3-Compatible API",
      "Global CDN Integration",
      "11 Nines Durability",
      "Versioning & Immutability ",
    ],
    imageSrc: "/images/main-page/object-space.svg",
    imageAlt: "Object storage illustration",
  },
  {
    id: "App-Deploy",
    label: "App-Deploy",
    title: "App-Deploy",
    heading: "deploy your applications with ease",
    description:
      "Deploy to 100+ edge locations automatically. Static assets cached globally, serverless functions run close to users.",
    bullets: [
      "Git-Based Deployments",
      "Zero Configuration",
      "Preview Environments",
      "Global Edge Network ",
    ],
    imageSrc: "/images/main-page/app-deploy.svg",
    imageAlt: "App deployment illustration",
  },
] as const;

import { Container } from "@/components/ui/container";

export function EverythingSection() {
  
  const [activeId, setActiveId] = useState<string>("gpu");
  const activeTab = TABS.find((t) => t.id === activeId) ?? TABS[0];

  const router=useRouter();

  return (
    <section className="select-none relative z-10 py-16 lg:py-24">
      {/* Responsive background wave image */}
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <Image
          src="/images/main-page/everything-sec-bg.svg"
          alt="Abstract blue wave background"
          fill
          priority={false}
          sizes="100vw"
          className="object-cover"
        />
      </div>

      <Container>
        <div className="max-w-[1200px] mx-auto px-4">
        {/* Heading */}
        <div className="mb-8 md:mb-10 lg:mb-12 max-w-full md:max-w-[1100px]">
          <h2
            className="text-4xl sm:text-5xl lg:text-6xl font-[400] tracking-tight leading-tight"
            style={{
              fontFamily:
                'Sansation Regular',
            }}
          >
            <span className="block bg-gradient-to-r from-white via-[#E3E6EE] to-[#8B909A] bg-clip-text text-transparent">
              Everything You Need to
            </span>
            <span className="block bg-gradient-to-r from-[#00A2FF] via-[#02B3FF] to-[#00D1FF] bg-clip-text text-transparent">
              Build and Scale
            </span>
          </h2>
        </div>

        {/* Tabs */}
        <div
          className="flex flex-nowrap items-center gap-1.5 sm:gap-2 mb-8 md:mb-10 border border-white/10 bg-[#05060A]/90  px-1.5 sm:px-2 h-11 md:h-[46px] max-w-full md:max-w-[1200px] mx-auto overflow-x-auto"
          style={{
            fontFamily:
              'Nunito Sans, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          }}
        >
          {TABS.map((tab) => {
            const isActive = tab.id === activeId;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveId(tab.id)}
                className={`bg-transparent cursor-pointer relative inline-flex items-center px-3 sm:px-4 h-8 md:h-[34px] text-[11px] sm:text-xs md:text-sm  whitespace-nowrap transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black ${
                  isActive
                    ? "bg-white text-[#111827] shadow-sm"
                    : " text-gray-300/90 hover:text-white hover:bg-white/5"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content Card */}
        <div
          className="relative max-w-[1600px] mx-auto border border-white/10 overflow-hidden"
          style={{
            backgroundColor: "#161618",
            fontFamily:
              'Nunito Sans, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          }}
        >
          <div className="relative grid gap-10 lg:gap-12 p-6 sm:p-8 lg:p-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] items-center ">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab.id + "-text"}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.25 }}
                className="space-y-4 sm:space-y-5"
              >

                <div className="ps-6 w-full">
                  <div>
                  <h3 className="text-2xl sm:text-3xl font-semibold text-white mb-2">
                    {activeTab.title}
                  </h3>
                  <p style={{width:'728px'}} className="mb-2 w-full text-sm sm:text-base text-gray-300/90 ">
                    {activeTab.description}
                  </p>
                </div>

                <ul className="space-y-2 sm:space-y-2.5">
                  {activeTab.bullets.map((item) => (
                    <li key={item}>
                      <div className="flex items-center gap-3 rounded-[2px] bg-[#2F2F2F] px-3 py-2 sm:px-4 sm:py-2.5">
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-black/40 text-gray-200">
                          <CheckCircle2 className="h-3 w-3" />
                        </span>
                        <span className="text-xs sm:text-sm text-gray-100/95">
                          {item}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
                 <button
                  onClick={() => router.push(`/services/${activeTab.id}`)}
                  type="button"
                  className=" cursor-pointer mt-4 inline-flex items-center gap-2  border-white/15 bg-white px-4 py-2 text-xs sm:text-sm font-medium text-black hover:bg-white/10 hover:border-white/30 transition-colors"
                >
                  Explore {activeTab.label}
                  <ArrowRight className="h-4 w-4" />
                </button>

                </div>
                

               
              </motion.div>
            </AnimatePresence>

            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab.id + "-image"}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ duration: 0.25 }}
                className=" relative w-full max-w-md mx-auto aspect-[4/3] sm:aspect-[5/3]"
              >
               <div className="mt-2">
                 <Image
                  src={activeTab.imageSrc}
                  alt={activeTab.imageAlt}
                  fill
                  sizes="(min-width: 1024px) 360px, (min-width: 640px) 70vw, 90vw"
                  className="object-contain mt-16"
                  priority={activeTab.id === "gpu"}
                />
               </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
        </div>
      </Container>
    </section>
  );
}
