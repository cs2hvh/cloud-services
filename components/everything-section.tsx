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
      "Spin up virtual machines in seconds and scale to thousands. Consistent performance across regions with per-second billing — pay only for what you use.",
    bullets: [
      "Autoscaling instances across 12 global regions",
      "Dedicated vCPUs with up to 100 Gbps networking",
      "Built-in monitoring, logs, and alerting",
      "Full API, CLI, and Terraform provider support",
    ],
    imageSrc: "/images/main-page/compute.png",
    imageAlt: "Global compute visualization",
  },
  {
    id: "database",
    label: "Database",
    title: "Managed Database",
    heading: "Resilient data, fully managed",
    description:
      "Production-ready PostgreSQL, MySQL, and Redis in minutes. Automated backups, read replicas, and point-in-time recovery — so you can focus on your application, not your database.",
    bullets: [
      "Managed PostgreSQL, MySQL, and Redis clusters",
      "Automated daily backups with 30-day retention",
      "Zero-downtime failover and rolling upgrades",
      "Fine-grained access controls and audit logging",
    ],
    imageSrc: "/images/Features/database.png",
    imageAlt: "Database illustration",
  },
  {
    id: "gpu",
    label: "GPU Instance",
    title: "GPU Instance",
    heading: "Raw GPU power on demand",
    description:
      "Accelerate AI training, inference, 3D rendering, and video processing with dedicated NVIDIA GPUs. Bare-metal performance with cloud flexibility — scale from a single GPU to multi-node clusters.",
    bullets: [
      "NVIDIA H100 & A100 Tensor Core GPUs",
      "Scalable clusters for deep learning and LLMs",
      "Real-time 3D rendering and video transcoding",
      "Pre-configured with CUDA, PyTorch, and Jupyter",
    ],
    imageSrc: "/images/main-page/gpu aniamtion resized.png",
    imageAlt: "GPU server stack",
  },
  {
    id: "security",
    label: "Security",
    title: "Security",
    heading: "Security built into every layer",
    description:
      "Enterprise-grade protection from edge to workload. Always-on DDoS mitigation, encrypted storage, and continuous compliance scanning — without slowing you down.",
    bullets: [
      "L3/L4/L7 DDoS protection and managed WAF",
      "Secrets management with automatic rotation",
      "Continuous vulnerability and posture scanning",
      "Granular IAM with SSO and MFA enforcement",
    ],
    imageSrc: "/images/Features/protection.png",
    imageAlt: "Security shield illustration",
  },
  {
    id: "ai-agent",
    label: "AI Agent",
    title: "AI Agents",
    heading: "Ship AI-native products faster",
    description:
      "Build autonomous agents that monitor, optimize, and act on your infrastructure. First-class tooling for vector search, model gateways, and agent observability.",
    bullets: [
      "Managed vector databases and embedding pipelines",
      "Secure model gateways with rate limiting",
      "Real-time event streams and agent observability",
      "Production-ready orchestration and workflows",
    ],
    imageSrc: "/images/Features/ai-agent.png",
    imageAlt: "AI agent illustration",
  },
  {
    id: "kubernetes",
    label: "Kubernetes",
    title: "Kubernetes",
    heading: "Production K8s without the overhead",
    description:
      "Fully managed Kubernetes clusters ready in minutes. Auto-scaling, rolling updates, service mesh, and built-in security — so your team ships features, not YAML.",
    bullets: [
      "One-click managed clusters with auto-upgrades",
      "Horizontal and vertical pod autoscaling",
      "Integrated load balancing and ingress",
      "Multi-region clusters with cross-zone HA",
    ],
    imageSrc: "/images/main-page/kubernetes.png",
    imageAlt: "Kubernetes illustration",
  },
  {
    id: "object-storage",
    label: "Object Storage",
    title: "Object Storage",
    heading: "Store and serve petabytes, globally",
    description:
      "S3-compatible object storage with 11 nines durability. Use your existing tools, SDKs, and workflows — zero code changes required.",
    bullets: [
      "Fully S3-compatible API and SDKs",
      "Global CDN integration for edge delivery",
      "99.999999999% data durability guarantee",
      "Versioning, lifecycle rules, and immutability",
    ],
    imageSrc: "/images/main-page/object-space.png",
    imageAlt: "Object storage illustration",
  },
  {
    id: "App-Deploy",
    label: "App Deploy",
    title: "App Deploy",
    heading: "Push code, we handle the rest",
    description:
      "Git-push deployments to 100+ edge locations. Preview environments on every PR, automatic SSL, and instant rollbacks — zero config required.",
    bullets: [
      "Git-based deployments from any repository",
      "Preview environments on every pull request",
      "Automatic SSL, custom domains, and edge caching",
      "Instant rollbacks and deployment history",
    ],
    imageSrc: "/images/main-page/app-deploy.png",
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
      {/* Background */}
      <div className="absolute inset-0 -z-10 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-black" />

        {/* Subtle radial vignette */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.02)_0%,transparent_70%)]" />

        {/* Top/bottom fade */}
        <div className="absolute top-0 left-0 right-0 h-48 bg-gradient-to-b from-black to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black to-transparent" />

        {/* Top divider */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[60%] h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>

      <Container>
        {/* Heading */}
        <div className="mb-8 md:mb-10 lg:mb-12">
          <h2
            className="text-4xl sm:text-5xl lg:text-6xl font-[400] tracking-tight leading-tight text-white"
          >
            Everything You Need to
            <br />
            Build and <span className="text-[#0095FF]">Scale</span>
          </h2>
        </div>

        {/* Tabs */}
        <div
          className="flex flex-nowrap items-stretch gap-1.5 sm:gap-2 mb-8 md:mb-10 px-1.5 sm:px-2 h-11 md:h-[46px] overflow-x-auto border border-white/[0.08]"
        >
          {TABS.map((tab) => {
            const isActive = tab.id === activeId;
                return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveId(tab.id)}
                className={`cursor-pointer relative inline-flex items-center px-3 sm:px-4 h-full text-[11px] sm:text-xs md:text-sm whitespace-nowrap transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-black ${
                  isActive
                    ? "bg-white text-black"
                    : "bg-transparent text-white/50 hover:text-white hover:bg-white/[0.04]"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content Card */}
        <div className="relative overflow-hidden">
          {/* Outer frame */}
          <div className="relative border border-white/[0.06] p-[1px]">
            {/* Inner frame */}
            <div className="relative border border-white/[0.08] bg-[#0a0a0a] overflow-hidden">

              {/* Corner brackets — top left */}
              <div className="absolute top-3 left-3 w-5 h-5">
                <div className="absolute top-0 left-0 w-full h-px bg-white/15" />
                <div className="absolute top-0 left-0 h-full w-px bg-white/15" />
              </div>
              {/* Corner brackets — top right */}
              <div className="absolute top-3 right-3 w-5 h-5">
                <div className="absolute top-0 right-0 w-full h-px bg-white/15" />
                <div className="absolute top-0 right-0 h-full w-px bg-white/15" />
              </div>
              {/* Corner brackets — bottom left */}
              <div className="absolute bottom-3 left-3 w-5 h-5">
                <div className="absolute bottom-0 left-0 w-full h-px bg-white/15" />
                <div className="absolute bottom-0 left-0 h-full w-px bg-white/15" />
              </div>
              {/* Corner brackets — bottom right */}
              <div className="absolute bottom-3 right-3 w-5 h-5">
                <div className="absolute bottom-0 right-0 w-full h-px bg-white/15" />
                <div className="absolute bottom-0 right-0 h-full w-px bg-white/15" />
              </div>

              <div className="relative grid gap-10 lg:gap-12 p-8 sm:p-10 lg:p-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] items-center min-h-[420px] lg:min-h-[480px]">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeTab.id + "-text"}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                    transition={{ duration: 0.25 }}
                    className="space-y-4 sm:space-y-5"
                  >

                    <div className="w-full pl-0 sm:pl-6">
                      <div>
                      <h3 className="text-2xl sm:text-3xl font-semibold text-white mb-2">
                        {activeTab.title}
                      </h3>
                      <p className="mb-2 w-full max-w-[728px] text-sm sm:text-base text-white/60">
                        {activeTab.description}
                      </p>
                    </div>

                    <ul className="space-y-2 sm:space-y-2.5">
                      {activeTab.bullets.map((item) => (
                        <li key={item}>
                          <div className="flex items-center gap-3 rounded-[2px] bg-white/[0.04] border border-white/[0.06] px-3 py-2 sm:px-4 sm:py-2.5">
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[#0095FF]/70">
                              <CheckCircle2 className="h-3 w-3" />
                            </span>
                            <span className="text-xs sm:text-sm text-white/80">
                              {item}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                     <button
                      onClick={() => router.push(`/services/${activeTab.id}`)}
                      type="button"
                      className="cursor-pointer mt-4 inline-flex items-center gap-2 bg-white px-4 py-2 text-xs sm:text-sm font-medium text-black hover:bg-white/90 transition-colors"
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
                    className="relative w-full max-w-lg lg:max-w-none mx-auto aspect-[4/3] sm:aspect-[4/3] lg:aspect-[4/3]"
                  >
                    <div className="mt-0 w-full h-full relative">
                      <Image
                        src={activeTab.imageSrc}
                        alt={activeTab.imageAlt}
                        fill
                        sizes="(min-width: 1280px) 600px, (min-width: 1024px) 420px, (min-width: 640px) 70vw, 90vw"
                        className="object-contain"
                        priority={activeTab.id === "gpu"}
                      />
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
