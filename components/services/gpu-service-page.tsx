import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BrainCircuit,
  Cpu,
  Gauge,
  Globe,
  Network,
  Shield,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import { AuthAwareServiceCta } from "@/components/services/auth-aware-service-cta";
import { Container } from "@/components/ui/container";
import type { Tables } from "@/lib/supabase/types";

type Product = Tables<"products">;

type GpuTier = {
  id: string;
  name: string;
  machineType: string;
  shortDescription: string;
  monthlyPrice: number | null;
  billingPeriod: string;
  specs: string[];
  features: string[];
  highlighted?: boolean;
  ctaText: string;
};

type Insight = {
  title: string;
  description: string;
  icon: LucideIcon;
};

const heroTags = [
  "Premium GPU Cloud",
  "Model Training",
  "Fine-tuning",
  "Inference APIs",
] as const;

const heroStats = [
  { value: "H100 to H200", label: "Premium accelerator tiers for training and serving." },
  { value: "Private fabric", label: "Fast networking and local NVMe for GPU-heavy jobs." },
  { value: "Single node to fleet", label: "Start small, then expand into larger AI rollout paths." },
] as const;

const lifecycleStages = [
  {
    id: "01",
    title: "Train & Pretrain",
    description:
      "Train frontier models with high-performance GPUs, fast local NVMe, and private interconnects.",
    image: "/images/main-page/gpu-ai-infrastructure-user-v1.png",
    icon: BrainCircuit,
  },
  {
    id: "02",
    title: "Fine-tune & Adapt",
    description:
      "Adapt models to your data with efficient GPU instances, repeatable environments, and cleaner tuning workflows.",
    image: "/images/main-page/gpu aniamtion resized.png",
    icon: Gauge,
  },
  {
    id: "03",
    title: "Evaluate & Validate",
    description:
      "Benchmark performance, run eval pipelines, and validate quality before pushing models into production paths.",
    image: "/images/main-page/gpu-ai-infrastructure-calm-v1.png",
    icon: Shield,
  },
  {
    id: "04",
    title: "Deploy & Infer",
    description:
      "Serve inference workloads with low latency, strong networking, and room to scale as traffic grows.",
    image: "/images/main-page/service-home-gpu-section-3.png",
    icon: Workflow,
  },
] as const;

const lifecycleBenefits = [
  {
    title: "Unified GPU Platform",
    description: "One consistent platform across the full model lifecycle.",
    icon: BrainCircuit,
  },
  {
    title: "High Performance Infrastructure",
    description: "Latest GPU tiers, fast networking, and scalable local storage.",
    icon: Gauge,
  },
  {
    title: "Elastic Scale",
    description: "Expand or contract around workload demand without awkward rebuilds.",
    icon: Cpu,
  },
  {
    title: "Enterprise Ready",
    description: "Secure, reliable, and built for production AI operations.",
    icon: Shield,
  },
] as const;

const operatingModes = [
  {
    title: "Single GPU nodes",
    description:
      "For notebooks, eval loops, prototyping, and teams that need direct access to premium accelerators without cluster overhead.",
  },
  {
    title: "Scale-out training",
    description:
      "For distributed tuning, checkpoint-heavy experiments, and larger training jobs that need more memory and throughput.",
  },
  {
    title: "Production inference",
    description:
      "For chat, speech, image, and multimodal APIs where latency, steady rollout, and cost discipline all matter.",
  },
];

const platformSignals: Insight[] = [
  {
    title: "Private networking by default",
    description:
      "Keep training nodes, storage, and downstream services on private links instead of stitching public networking together.",
    icon: Network,
  },
  {
    title: "Region-aware deployment",
    description:
      "Place workloads close to users, data gravity, or compliance requirements without rebuilding the stack for each region.",
    icon: Globe,
  },
  {
    title: "Premium hardware mix",
    description:
      "Build around NVIDIA H100 and H200 tiers, efficient inference nodes, and AMD-ready fleet planning for custom deployments.",
    icon: Cpu,
  },
  {
    title: "Operational guardrails",
    description:
      "Provisioning, network isolation, backups, and platform controls are easier to reason about than ad hoc GPU procurement.",
    icon: Shield,
  },
];

const workloadCases = [
  {
    title: "LLM training and fine-tuning",
    description:
      "Model adaptation, eval pipelines, checkpoint-heavy workflows, and larger context experiments.",
  },
  {
    title: "Inference APIs",
    description:
      "Real-time serving for chat, copilots, search, summarization, and multimodal production traffic.",
  },
  {
    title: "Vision and media AI",
    description:
      "Image generation, embeddings, video processing, segmentation, ranking, and GPU-heavy media pipelines.",
  },
  {
    title: "Scientific and simulation workloads",
    description:
      "Accelerated compute for numerical models, simulation, genomics, HPC-style jobs, and research pipelines.",
  },
];

const faqs = [
  {
    question: "What workloads is this page designed for?",
    answer:
      "This page is built for AI and ML teams running training, fine-tuning, evaluation, inference, multimodal services, rendering, and accelerated research workflows.",
  },
  {
    question: "Do you support both NVIDIA and AMD GPU planning?",
    answer:
      "Yes. The service direction covers premium NVIDIA classes for mainstream demand and AMD-oriented fleet planning for teams with specific accelerator preferences or procurement requirements.",
  },
  {
    question: "Can I start with one GPU and grow later?",
    answer:
      "Yes. The page now frames single-node development, scale-out training, and production inference as connected stages so teams can start lean and expand cleanly.",
  },
  {
    question: "Where do GPU launches go after sign-in?",
    answer:
      "GPU calls to action route into the compute deployment flow, which is how GPU infrastructure is currently surfaced in the dashboard.",
  },
];

const fallbackGpuTiers: GpuTier[] = [
  {
    id: "gpu-h200",
    name: "H200 Cluster",
    machineType: "H200",
    shortDescription:
      "High-memory GPU capacity for larger training runs, retrieval-heavy systems, and high-throughput inference.",
    monthlyPrice: 2899,
    billingPeriod: "per node/month",
    specs: ["16 vCPU", "128 GB RAM", "1.6 TB NVMe", "200 Gbit/s fabric"],
    features: ["1x NVIDIA H200", "Private networking", "Snapshot backups", "Priority support"],
    highlighted: true,
    ctaText: "Deploy H200",
  },
  {
    id: "gpu-h100",
    name: "H100 Cluster",
    machineType: "H100",
    shortDescription:
      "Balanced flagship tier for model training, high-volume inference, and serious research workloads.",
    monthlyPrice: 2199,
    billingPeriod: "per node/month",
    specs: ["16 vCPU", "96 GB RAM", "1 TB NVMe", "100 Gbit/s fabric"],
    features: ["1x NVIDIA H100", "Multi-node ready", "Managed monitoring", "Daily backups"],
    ctaText: "Deploy H100",
  },
  {
    id: "gpu-l40s",
    name: "L40S Inference",
    machineType: "L40S",
    shortDescription:
      "Efficient GPU profile for visual AI, embeddings, retrieval, and inference services that need stronger cost discipline.",
    monthlyPrice: 899,
    billingPeriod: "per node/month",
    specs: ["8 vCPU", "48 GB RAM", "500 GB NVMe", "25 Gbit/s network"],
    features: ["1x L40S-class GPU", "Fast provisioning", "Managed upgrades", "Standard support"],
    ctaText: "Deploy L40S",
  },
];

function mapGpuProducts(products: Product[]): GpuTier[] {
  if (!products.length) {
    return fallbackGpuTiers;
  }

  return products.slice(0, 4).map((product, index) => ({
    id: product.id,
    name: product.name ?? `GPU Tier ${index + 1}`,
    machineType: product.machine_type ?? product.slug?.toUpperCase() ?? "GPU",
    shortDescription:
      product.short_description ??
      product.description ??
      "GPU capacity designed for AI training, fine-tuning, and production inference.",
    monthlyPrice: typeof product.price === "number" ? product.price : null,
    billingPeriod: product.billing_period ?? "per node/month",
    specs: product.specs?.length
      ? product.specs.slice(0, 4)
      : [
          `${product.resources.cpu} vCPU`,
          `${product.resources.ram} GB RAM`,
          `${product.resources.storage} GB NVMe`,
        ],
    features: product.features?.length
      ? product.features.slice(0, 4)
      : ["Premium GPU capacity", "Private networking", "Fast provisioning", "Platform support"],
    highlighted: product.is_highlighted ?? product.is_featured ?? false,
    ctaText: product.cta_text ?? `Deploy ${product.machine_type ?? product.name ?? "GPU"}`,
  }));
}

function formatMonthlyPrice(price: number | null) {
  if (price === null) {
    return "Custom";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(price);
}

function SectionHeading({
  label,
  title,
  description,
}: {
  label: string;
  title: string;
  description: string;
}) {
  return (
    <div className="max-w-3xl">
      <div className="inline-flex items-center gap-2 border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] uppercase tracking-[0.26em] text-white/58">
        <span className="h-1.5 w-1.5 bg-[#4c9eff]" />
        {label}
      </div>
      <h2 className="mt-5 text-3xl font-semibold tracking-[-0.05em] text-white sm:text-4xl lg:text-5xl">
        {title}
      </h2>
      <p className="mt-4 max-w-2xl text-sm leading-7 text-white/62 sm:text-base">
        {description}
      </p>
    </div>
  );
}

export function GpuServicePage({ featuredProducts }: { featuredProducts: Product[] }) {
  const gpuTiers = mapGpuProducts(featuredProducts);

  return (
    <main className="overflow-hidden bg-[#020202] text-white">
      <section className="relative isolate min-h-[92svh] border-b border-white/[0.08] pt-16 sm:pt-20">
        <div className="absolute inset-0">
          <Image
            src="/images/main-page/gpu-ai-infrastructure-v1.png"
            alt=""
            fill
            priority
            className="object-cover opacity-30"
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,2,2,0.92)_0%,rgba(2,2,2,0.78)_34%,rgba(2,2,2,0.62)_56%,rgba(2,2,2,0.72)_100%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(76,158,255,0.10),transparent_22%),radial-gradient(circle_at_82%_18%,rgba(255,255,255,0.08),transparent_16%),linear-gradient(180deg,rgba(2,2,2,0.16),rgba(2,2,2,0.86)_72%,#020202)]" />
          <div
            className="absolute inset-0 opacity-[0.035]"
            style={{
              backgroundImage:
                "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
              backgroundSize: "150px 150px",
            }}
          />
        </div>

        <Container className="relative pb-12 sm:pb-14 lg:pb-16">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(400px,0.86fr)] lg:items-center">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-3 border border-white/12 bg-white/[0.05] px-4 py-2 text-[11px] uppercase tracking-[0.3em] text-white/68 backdrop-blur-xl">
                <span className="h-2 w-2 bg-[#4c9eff]" />
                GPU Cloud for AI and ML
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] uppercase tracking-[0.22em] text-white/38">
                {heroTags.map((tag, index) => (
                  <span key={tag} className="inline-flex items-center gap-4">
                    {tag}
                    {index !== heroTags.length - 1 ? <span className="h-px w-4 bg-white/12" /> : null}
                  </span>
                ))}
              </div>

              <h1 className="mt-6 text-[2.7rem] font-semibold leading-[0.96] tracking-[-0.06em] text-white sm:text-[4.2rem] lg:text-[4.9rem]">
                Premium GPU infrastructure
                <span className="mt-2 block bg-[linear-gradient(120deg,#ffffff_0%,#eff4fb_35%,#c6ddff_72%,#7cb0ff_100%)] bg-clip-text text-transparent">
                  for training, fine-tuning, and production inference
                </span>
              </h1>

              <p className="mt-5 max-w-2xl text-[15px] leading-7 text-white/66 sm:text-base">
                Launch AI workloads on premium accelerator tiers with private networking,
                fast NVMe, and a cleaner path from experiments to shipping products.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <AuthAwareServiceCta
                  service="gpu"
                  intent="new"
                  className="inline-flex h-11 items-center justify-center bg-white px-6 text-sm font-medium text-black transition-transform duration-300 hover:-translate-y-0.5 hover:bg-[#efefef]"
                >
                  Deploy GPU Infrastructure
                  <ArrowRight className="ml-2 h-4 w-4" />
                </AuthAwareServiceCta>
                <Link
                  href="/solutions/ai-ml"
                  className="inline-flex h-11 items-center justify-center border border-[#4c9eff]/25 bg-white/[0.05] px-6 text-sm font-medium text-white/82 backdrop-blur-xl transition-colors hover:border-[#4c9eff]/45 hover:bg-white/[0.09] hover:text-white"
                >
                  Explore AI &amp; ML Solutions
                </Link>
              </div>

              <div className="mt-10 grid gap-5 border-t border-white/10 pt-6 md:grid-cols-3">
                {heroStats.map((stat) => (
                  <div key={stat.value} className="relative pl-4">
                    <div className="absolute left-0 top-1 h-10 w-px bg-gradient-to-b from-[#4c9eff]/70 via-white/35 to-transparent" />
                    <div className="text-sm font-semibold uppercase tracking-[0.18em] text-white/88">
                      {stat.value}
                    </div>
                    <p className="mt-3 text-sm leading-6 text-white/54">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="relative mx-auto aspect-[0.88] w-full max-w-[31rem]">
                <div className="absolute inset-x-[14%] top-4 h-px bg-gradient-to-r from-transparent via-white/24 to-transparent" />
                <div className="absolute inset-x-[18%] bottom-6 h-px bg-gradient-to-r from-transparent via-white/14 to-transparent" />
                <div className="absolute inset-x-0 top-[8%] bottom-[12%]">
                  <Image
                    src="/images/main-page/gpu aniamtion resized.png"
                    alt="Premium GPU cluster visualization"
                    fill
                    priority
                    className="object-contain"
                  />
                </div>

                <div className="absolute left-0 top-[20%] max-w-[10rem] border-l border-[#4c9eff]/35 pl-4">
                  <div className="text-[10px] uppercase tracking-[0.24em] text-white/36">Fine-tuning</div>
                  <div className="mt-2 text-sm leading-6 text-white/78">
                    Custom runtimes, eval loops, and checkpoint-heavy jobs.
                  </div>
                </div>

                <div className="absolute right-0 top-[25%] max-w-[10.5rem] border-l border-white/16 pl-4">
                  <div className="text-[10px] uppercase tracking-[0.24em] text-white/36">Inference</div>
                  <div className="mt-2 text-sm leading-6 text-white/74">
                    Lower-latency serving paths with cleaner rollout posture.
                  </div>
                </div>

                <div className="absolute left-[8%] right-[8%] bottom-0 grid gap-4 border-t border-white/10 pt-4 sm:grid-cols-3">
                  {[
                    { title: "Nodes", detail: "Direct GPU access" },
                    { title: "Fleet", detail: "Scale-out training" },
                    { title: "APIs", detail: "Serving motion" },
                  ].map((item) => (
                    <div key={item.title}>
                      <div className="text-[11px] uppercase tracking-[0.22em] text-white/34">{item.title}</div>
                      <div className="mt-2 text-sm text-white/72">{item.detail}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Container>
      </section>

      <section className="relative border-b border-white/[0.08] py-20 sm:py-24 lg:py-32">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(255,255,255,0.04),transparent_24%),radial-gradient(circle_at_78%_70%,rgba(120,120,120,0.05),transparent_24%)]" />
        <div className="relative mt-14 overflow-hidden">
          <div className="relative min-h-[42rem] overflow-hidden sm:min-h-[46rem] lg:min-h-[50rem]">
            <Image
              src="/images/main-page/gpu-ai-infrastructure-user-v1.png"
              alt="GPU datacenter corridor"
              fill
              className="object-cover object-center"
            />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(4,4,5,0.96)_0%,rgba(4,4,5,0.92)_28%,rgba(4,4,5,0.54)_58%,rgba(4,4,5,0.16)_100%)]" />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,4,5,0.08),rgba(4,4,5,0.18)_42%,rgba(4,4,5,0.76)_84%,#020202_100%)]" />

            <div className="relative px-[clamp(20px,5vw,80px)] pt-8 sm:pt-10 lg:pt-12">
              <div className="inline-flex items-center gap-2 border border-white/10 bg-black/20 px-3 py-1.5 text-[11px] uppercase tracking-[0.26em] text-white/56 backdrop-blur-xl">
                <span className="h-1.5 w-1.5 bg-[#0095FF]" />
                AI Lifecycle
              </div>
              <div className="mt-6 max-w-[36rem]">
                <h3 className="max-w-[14ch] text-[2.55rem] font-semibold leading-[0.98] tracking-[-0.065em] text-white sm:text-[3.45rem] lg:text-[4.25rem]">
                  One <span className="text-[#0095FF]">GPU</span> platform that supports the real stages of an AI product.
                </h3>
                <p className="mt-6 max-w-[30rem] text-base leading-8 text-white/70 sm:text-[1.05rem]">
                  From model training to production inference, built for scale, performance, and reliability at every stage.
                </p>
              </div>
            </div>

            <div className="relative z-10 px-[clamp(20px,5vw,80px)] pb-8 pt-[13rem] sm:pb-10 sm:pt-[15rem] lg:pb-12 lg:pt-[17rem]">
              <div className="rounded-[26px] border border-white/10 bg-[#090909]/94 p-4 shadow-[0_20px_70px_rgba(0,0,0,0.32)] backdrop-blur-xl sm:p-5 lg:p-6">
                <div className="grid gap-0 lg:grid-cols-4">
                  {lifecycleStages.map((stage, index) => (
                    <article
                      key={stage.id}
                      className={`relative px-4 py-4 sm:px-5 sm:py-5 ${index < lifecycleStages.length - 1 ? "lg:border-r lg:border-white/10" : ""}`}
                    >
                      {index < lifecycleStages.length - 1 ? (
                        <ArrowRight className="absolute -right-3 top-7 hidden h-5 w-5 text-[#0095FF]/80 lg:block" />
                      ) : null}
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#0095FF]/20 bg-[#0095FF]/[0.08]">
                        <stage.icon className="h-6 w-6 text-[#0095FF]" />
                      </div>
                      <div className="mt-5 text-[1.65rem] font-semibold tracking-[-0.05em] text-[#0095FF]">
                        {stage.id}
                      </div>
                      <h4 className="mt-2 text-2xl font-medium tracking-[-0.03em] text-white">
                        {stage.title}
                      </h4>
                      <p className="mt-4 min-h-[6.5rem] text-[15px] leading-7 text-white/62">
                        {stage.description}
                      </p>
                      <div className="relative mt-5 aspect-[1.4] overflow-hidden rounded-[18px] border border-white/10 bg-black/20">
                        <Image
                          src={stage.image}
                          alt={stage.title}
                          fill
                          className="object-cover"
                        />
                        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,5,6,0.04),rgba(5,5,6,0.2)_100%)]" />
                      </div>
                    </article>
                  ))}
                </div>
              </div>

              <div className="mt-6 grid gap-0 rounded-[24px] border border-white/10 bg-[#090909]/92 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.24)] backdrop-blur-xl sm:p-5 lg:grid-cols-4 lg:p-6">
                {lifecycleBenefits.map((benefit, index) => (
                  <article
                    key={benefit.title}
                    className={`flex gap-4 px-4 py-4 sm:px-5 ${index < lifecycleBenefits.length - 1 ? "lg:border-r lg:border-white/10" : ""}`}
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#0095FF]/18 bg-[#0095FF]/[0.08]">
                      <benefit.icon className="h-5 w-5 text-[#0095FF]" />
                    </div>
                    <div>
                      <h4 className="text-[1.45rem] font-medium tracking-[-0.03em] text-white">
                        {benefit.title}
                      </h4>
                      <p className="mt-3 text-[15px] leading-7 text-white/60">
                        {benefit.description}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative border-b border-white/[0.08] py-20 sm:py-24 lg:py-32">
        <Container className="relative">
          <div className="grid gap-12 lg:grid-cols-[0.86fr_1.14fr] lg:items-start">
            <div>
              <SectionHeading
                label="Operating Modes"
                title="Choose the deployment shape that matches the workload stage"
                description="Single-node development, scale-out training, and production inference each have a different runtime posture."
              />

              <div className="mt-8 flex flex-wrap gap-3 text-[11px] uppercase tracking-[0.2em] text-white/38">
                {["H100", "H200", "B200-class planning", "AMD-ready fleet"].map((item, index) => (
                  <span key={item} className="inline-flex items-center gap-3">
                    {item}
                    {index !== 3 ? <span className="h-px w-5 bg-white/12" /> : null}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid gap-6">
              {operatingModes.map((mode, index) => (
                <article key={mode.title} className="border-t border-white/10 pt-6 sm:pt-7">
                  <div className="grid gap-4 sm:grid-cols-[120px_minmax(0,1fr)]">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-white/34">
                      Mode {String(index + 1).padStart(2, "0")}
                    </div>
                    <div>
                      <h3 className="text-2xl font-semibold tracking-[-0.04em] text-white">{mode.title}</h3>
                      <p className="mt-4 max-w-2xl text-sm leading-7 text-white/62 sm:text-base">
                        {mode.description}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </Container>
      </section>

      <section className="relative border-b border-white/[0.08] py-20 sm:py-24 lg:py-32">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_14%_24%,rgba(255,255,255,0.06),transparent_22%),radial-gradient(circle_at_82%_78%,rgba(76,158,255,0.08),transparent_24%)]" />
        <Container className="relative">
          <div className="grid gap-12 lg:grid-cols-[0.78fr_1.22fr] lg:items-start">
            <div>
              <SectionHeading
                label="GPU Fleet"
                title="Premium GPU tiers without the card wall"
                description="The fleet area is now a cleaner line-separated product list with pricing, specs, and deployment actions."
              />
            </div>

            <div className="space-y-8">
              {gpuTiers.map((tier, index) => (
                <article
                  key={tier.id}
                  className={`border-t pt-7 ${index === gpuTiers.length - 1 ? "border-b pb-7" : "border-white/10"} ${index === gpuTiers.length - 1 ? "border-white/10" : ""}`}
                >
                  <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_auto] xl:items-start">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.24em] text-white/34">{tier.machineType}</div>
                      <h3 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-white">{tier.name}</h3>
                      <p className="mt-4 max-w-md text-sm leading-7 text-white/62">{tier.shortDescription}</p>
                    </div>

                    <div className="space-y-5">
                      <div className="flex flex-wrap gap-2">
                        {tier.specs.slice(0, 4).map((spec) => (
                          <span
                            key={spec}
                            className="inline-flex border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] text-white/74"
                          >
                            {spec}
                          </span>
                        ))}
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {tier.features.slice(0, 4).map((feature) => (
                          <div key={feature} className="flex items-start gap-3">
                            <span className="mt-2 h-1.5 w-1.5 shrink-0 bg-[#9ccaff]" />
                            <span className="text-sm leading-6 text-white/62">{feature}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="xl:text-right">
                      {tier.highlighted ? (
                        <div className="mb-4 inline-flex border border-[#4c9eff]/35 bg-[#4c9eff]/12 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[#9fcbff]">
                          Featured
                        </div>
                      ) : null}
                      <div className="text-[11px] uppercase tracking-[0.2em] text-white/36">Starting at</div>
                      <div className="mt-2 text-4xl font-semibold tracking-[-0.06em] text-white">
                        {formatMonthlyPrice(tier.monthlyPrice)}
                      </div>
                      <div className="mt-2 text-[12px] text-white/46">{tier.billingPeriod}</div>
                      <AuthAwareServiceCta
                        service="gpu"
                        intent="new"
                        className="mt-6 inline-flex h-11 items-center justify-center gap-2 bg-white px-5 text-sm font-medium text-black transition-colors hover:bg-[#efefef]"
                      >
                        {tier.ctaText}
                        <ArrowRight className="h-4 w-4" />
                      </AuthAwareServiceCta>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </Container>
      </section>

      <section className="relative border-b border-white/[0.08]">
        <div className="relative min-h-[58svh] sm:min-h-[66svh]">
          <Image
            src="/images/main-page/gpu-ai-infrastructure-user-v1.png"
            alt="Premium GPU infrastructure for AI and ML"
            fill
            className="object-cover"
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,2,2,0.28),rgba(2,2,2,0.48)_34%,rgba(2,2,2,0.84)_82%,#020202_100%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_22%,rgba(255,255,255,0.06),transparent_20%)]" />

          <Container className="relative flex min-h-[58svh] flex-col justify-end py-14 sm:min-h-[66svh] sm:py-16">
            <div className="max-w-3xl">
              <div className="text-[11px] uppercase tracking-[0.28em] text-white/46">Infrastructure Visual</div>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.05em] text-white sm:text-4xl lg:text-5xl">
                A cleaner visual break in the middle of the page
              </h2>
              <p className="mt-5 max-w-2xl text-sm leading-7 text-white/66 sm:text-base">
                The imagery now carries more of the narrative weight so the page feels less boxed-in and more like a premium AI infrastructure surface.
              </p>
            </div>
          </Container>
        </div>
      </section>

      <section className="relative border-b border-white/[0.08] py-20 sm:py-24 lg:py-32">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),transparent_24%,rgba(76,158,255,0.04)_100%)]" />
        <Container className="relative">
          <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div>
              <SectionHeading
                label="Platform Signals"
                title="Why AI teams want more than raw GPU inventory"
                description="Hardware matters, but the surrounding platform determines how quickly teams can move from experiment to stable product behavior."
              />
            </div>

            <div className="space-y-6">
              {platformSignals.map((item) => (
                <article key={item.title} className="border-t border-white/10 pt-6 sm:pt-7">
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center border border-[#4c9eff]/28 bg-[#4c9eff]/[0.08]">
                      <item.icon className="h-5 w-5 text-[#9ccaff]" />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold tracking-[-0.03em] text-white">{item.title}</h3>
                      <p className="mt-3 max-w-2xl text-sm leading-7 text-white/62 sm:text-base">
                        {item.description}
                      </p>
                    </div>
                  </div>
                </article>
              ))}

              <div className="border-t border-white/10 pt-7">
                <div className="text-[11px] uppercase tracking-[0.24em] text-white/34">Use Cases</div>
                <div className="mt-5 grid gap-5 sm:grid-cols-2">
                  {workloadCases.map((item) => (
                    <div key={item.title}>
                      <h4 className="text-base font-medium text-white">{item.title}</h4>
                      <p className="mt-2 text-sm leading-6 text-white/58">{item.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Container>
      </section>

      <section className="relative border-b border-white/[0.08] py-20 sm:py-24 lg:py-28">
        <Container>
          <div className="grid gap-x-12 gap-y-8 lg:grid-cols-2">
            <SectionHeading
              label="FAQ"
              title="Questions buyers usually ask before launching GPU infrastructure"
              description="The FAQ is now simplified into an open text layout instead of another stack of boxed accordions."
            />

            <div className="space-y-6">
              {faqs.map((item) => (
                <article key={item.question} className="border-t border-white/10 pt-6">
                  <h3 className="text-lg font-medium text-white">{item.question}</h3>
                  <p className="mt-3 text-sm leading-7 text-white/60">{item.answer}</p>
                </article>
              ))}
            </div>
          </div>
        </Container>
      </section>

      <section className="relative py-20 sm:py-24 lg:py-28">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(76,158,255,0.12),transparent_30%),linear-gradient(180deg,rgba(2,2,2,0),#020202_72%)]" />
        <Container className="relative">
          <div className="grid gap-10 border border-white/10 bg-white/[0.03] p-8 sm:p-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
            <div>
              <div className="inline-flex items-center gap-2 border border-white/10 bg-black/24 px-3 py-1.5 text-[11px] uppercase tracking-[0.24em] text-white/60">
                <span className="h-1.5 w-1.5 bg-[#4c9eff]" />
                Launch GPU Infrastructure
              </div>
              <h2 className="mt-5 max-w-2xl text-3xl font-semibold tracking-[-0.05em] text-white sm:text-4xl lg:text-5xl">
                Start with one node, or plan a larger AI fleet with room to grow
              </h2>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-white/62 sm:text-base">
                The page now supports both motions: immediate GPU deployment and a clearer architectural path for teams building real AI products.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
              <AuthAwareServiceCta
                service="gpu"
                intent="new"
                className="inline-flex h-11 items-center justify-center gap-2 bg-white px-6 text-sm font-medium text-black transition-colors hover:bg-[#efefef]"
              >
                Deploy GPU Infrastructure
                <ArrowRight className="h-4 w-4" />
              </AuthAwareServiceCta>
              <Link
                href="/solutions/ai-ml"
                className="inline-flex h-11 items-center justify-center border border-white/12 bg-white/[0.04] px-6 text-sm font-medium text-white/84 transition-colors hover:bg-white/[0.08] hover:text-white"
              >
                Explore AI &amp; ML Solutions
              </Link>
            </div>
          </div>
        </Container>
      </section>
    </main>
  );
}
