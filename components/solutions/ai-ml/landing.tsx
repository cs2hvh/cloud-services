import Image from "next/image";
import Link from "next/link";

import { ReadyToBuild } from "@/components/solutions/sections/ready-to-build";
import { Container } from "@/components/ui/container";

const heroTags = ["Premium GPU Cloud", "Model Training", "Fine-tuning", "Inference APIs"];

const heroStats = [
  { value: "Pods", label: "Private GPU workspaces for notebooks and custom runtimes." },
  { value: "Serverless", label: "Autoscaling endpoints for production AI traffic." },
  { value: "Clusters", label: "Distributed training and multi-node inference." },
  { value: "B200 to L40S", label: "Premium hardware tiers for training and serving." },
] as const;

const spotlightCards = [
  {
    title: "Fine-tune frontier models",
    description:
      "Run LoRA, QLoRA, evals, and checkpoint-heavy fine-tuning on high-memory GPUs.",
    icon: "/solution/secondsection/AI.svg",
    image: "/images/main-page/gpu aniamtion resized.png",
  },
  {
    title: "Ship inference that actually scales",
    description:
      "Serve LLM, speech, image, and multimodal APIs with autoscaling workers and lower idle cost.",
    icon: "/solution/secondsection/Monitor.svg",
    image: "/images/main-page/solution-home-ai.png",
  },
  {
    title: "Connect data, storage, and agents",
    description:
      "Keep datasets, metadata, storage, and orchestration layers operating as one platform.",
    icon: "/solution/secondsection/Stack.svg",
    image: "/images/main-page/service-home-object-space-section-3.png",
  },
] as const;

const operatingModes = [
  {
    title: "Dedicated Pods",
    subtitle: "Best for development, custom runtimes, notebooks, and fine-tuning.",
    icon: "/solution/secondsection/Solutions.svg",
    image: "/images/hero/server-stack.png",
  },
  {
    title: "Serverless Endpoints",
    subtitle: "Best for production inference, event-driven AI jobs, and burst traffic.",
    icon: "/solution/secondsection/Monitor.svg",
    image: "/images/main-page/solution-home-ai.png",
  },
  {
    title: "Public Model APIs",
    subtitle: "Best for instant product features and rapid prototyping without infra work.",
    icon: "/solution/secondsection/Product.svg",
    image: "/images/main-page/app-deploy.png",
  },
  {
    title: "Instant Clusters",
    subtitle: "Best for distributed training and coordinated multi-node GPU systems.",
    icon: "/solution/secondsection/Kubernetes.svg",
    image: "/images/main-page/service-home-kubernetes-section-3.png",
  },
] as const;

const architectureSteps = [
  {
    id: "01",
    title: "Ingest data and artifacts",
    description:
      "Store datasets, documents, checkpoints, and context with access control.",
  },
  {
    id: "02",
    title: "Develop and fine-tune",
    description:
      "Use dedicated GPU environments for notebooks, benchmarks, and repeatable fine-tuning.",
  },
  {
    id: "03",
    title: "Promote into inference",
    description:
      "Move validated models into autoscaling endpoints or cluster-scale serving.",
  },
  {
    id: "04",
    title: "Operate with enterprise guardrails",
    description:
      "Add observability, usage controls, and rollout discipline across the lifecycle.",
  },
] as const;

const gpuFleet = [
  {
    model: "B200",
    fit: "Frontier training and top-end throughput",
    description:
      "Built for very large models and high-density serving.",
  },
  {
    model: "H200",
    fit: "High-memory fine-tuning and large-context serving",
    description:
      "Strong for large context windows, retrieval-heavy pipelines, and heavier tuning jobs.",
  },
  {
    model: "H100",
    fit: "Flagship balanced GPU tier",
    description:
      "A dependable standard for fine-tuning, batched inference, and research workloads.",
  },
  {
    model: "L40S",
    fit: "Efficient multimodal and visual AI",
    description:
      "A practical premium option for generation, vision, and embeddings.",
  },
] as const;

const readyToBuildData = {
  title: "Design your AI platform around the full lifecycle",
  description:
    "Tell us what you are building and the GPU profile you need. We will help shape the rollout plan.",
  formFields: [
    { name: "fullName", placeholder: "Full Name", type: "text" as const },
    { name: "workEmail", placeholder: "Work Email", type: "email" as const },
    {
      name: "workload",
      placeholder: "Describe your models, team size, target workloads, and GPU needs...",
      type: "textarea" as const,
    },
  ],
  buttonText: "Request AI Architecture Review",
  consultationService: "AI & ML",
};

function SectionHeader({
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
      <div className="inline-flex items-center gap-2 rounded-none border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] uppercase tracking-[0.24em] text-white/56">
        <span className="h-1.5 w-1.5 bg-[#4c9eff]" />
        {label}
      </div>
      <h2 className="mt-5 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl lg:text-5xl">
        {title}
      </h2>
      <p className="mt-4 max-w-2xl text-sm leading-7 text-white/60 sm:text-base">
        {description}
      </p>
    </div>
  );
}

export function AiMlLanding() {
  return (
    <main className="overflow-hidden bg-[#020202] text-white">
      <section className="relative isolate min-h-[88svh] border-b border-white/[0.08] pt-16 sm:pt-20">
        <div className="absolute inset-0">
          <Image
            src="/images/hero/service-hero-bg.png"
            alt=""
            fill
            priority
            className="object-cover opacity-16"
          />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(76,158,255,0.05),transparent_22%),radial-gradient(circle_at_82%_18%,rgba(255,255,255,0.06),transparent_20%),linear-gradient(180deg,rgba(2,2,2,0.24),rgba(2,2,2,0.88)_62%,#020202)]" />
          <div
            className="absolute inset-0 opacity-[0.035]"
            style={{
              backgroundImage:
                "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
              backgroundSize: "160px 160px",
            }}
          />
        </div>

        <Container className="relative pb-12 sm:pb-14 lg:pb-16">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(400px,0.86fr)] lg:items-center">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-3 rounded-none border border-white/12 bg-white/[0.05] px-4 py-2 text-[11px] uppercase tracking-[0.3em] text-white/68 backdrop-blur-xl">
                <span className="h-2 w-2 bg-[#4c9eff]" />
                AI Infrastructure Solutions
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] uppercase tracking-[0.22em] text-white/38">
                {heroTags.map((tag, index) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-4"
                  >
                    {tag}
                    {index !== heroTags.length - 1 ? <span className="h-px w-4 bg-white/12" /> : null}
                  </span>
                ))}
              </div>

              <h1 className="mt-6 text-[2.65rem] font-semibold leading-[0.96] tracking-[-0.06em] text-white sm:text-[4.25rem] lg:text-[4.75rem]">
                From experiments to
                <span className="mt-2 block bg-[linear-gradient(120deg,#ffffff_0%,#f2f2f2_32%,#c7dfff_74%,#7aaeff_100%)] bg-clip-text text-transparent">
                  production AI, on one premium GPU cloud
                </span>
              </h1>

              <p className="mt-5 max-w-2xl text-[15px] leading-7 text-white/66 sm:text-base">
                Build AI products on one platform: private GPU pods, autoscaling inference,
                public model APIs, and instant GPU clusters.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/signup"
                  className="inline-flex h-11 items-center justify-center rounded-none bg-white px-6 text-sm font-medium text-black transition-transform duration-300 hover:-translate-y-0.5 hover:bg-[#efefef]"
                >
                  Launch AI Infrastructure
                </Link>
                <Link
                  href="/services/gpu"
                  className="inline-flex h-11 items-center justify-center rounded-none border border-[#4c9eff]/25 bg-white/[0.05] px-6 text-sm font-medium text-white/82 backdrop-blur-xl transition-colors hover:border-[#4c9eff]/45 hover:bg-white/[0.09] hover:text-white"
                >
                  Explore GPU Fleet
                </Link>
              </div>

              <div className="mt-10 grid gap-5 border-t border-white/10 pt-6 sm:grid-cols-2 xl:grid-cols-4">
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
              <div className="relative mx-auto aspect-[0.86] w-full max-w-[29rem]">
                <div className="absolute inset-x-[10%] top-3 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                <div className="absolute inset-x-[16%] bottom-5 h-px bg-gradient-to-r from-transparent via-white/12 to-transparent" />
                <div className="absolute inset-x-0 top-[8%] bottom-[12%]">
                  <Image
                    src="/images/main-page/gpu aniamtion resized.png"
                    alt="Premium GPU cluster visualization"
                    fill
                    className="object-contain"
                    priority
                  />
                </div>

                <div className="absolute left-0 top-[18%] max-w-[10rem] border-l border-[#4c9eff]/35 pl-4">
                  <div className="text-[10px] uppercase tracking-[0.24em] text-white/36">Fine-tuning</div>
                  <div className="mt-2 text-sm leading-6 text-white/78">Custom runtimes, eval loops, and checkpoint-heavy jobs.</div>
                </div>

                <div className="absolute right-0 top-[24%] max-w-[10.5rem] border-l border-white/16 pl-4">
                  <div className="text-[10px] uppercase tracking-[0.24em] text-white/36">Inference</div>
                  <div className="mt-2 text-sm leading-6 text-white/74">Autoscaling APIs with lower idle cost and cleaner rollout paths.</div>
                </div>

                <div className="absolute left-[8%] right-[8%] bottom-0 grid gap-4 border-t border-white/10 pt-4 sm:grid-cols-3">
                  {[
                    { title: "Pods", detail: "Private environments" },
                    { title: "Endpoints", detail: "Serverless traffic" },
                    { title: "Clusters", detail: "Scale-out training" },
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
        <Container className="relative">
          <SectionHeader
            label="AI Lifecycle"
            title="One platform that supports every serious AI team motion"
            description="Experiments, fine-tuning, inference, and scale-out systems on one platform."
          />

          <div className="mt-14 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <article className="group relative overflow-hidden rounded-none">
              <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent,rgba(2,2,2,0.78)_78%)]" />
              <div className="relative aspect-[1.2] w-full">
                <Image
                  src={spotlightCards[0].image}
                  alt={spotlightCards[0].title}
                  fill
                  className="object-cover transition-transform duration-700 group-hover:scale-105"
                />
              </div>
              <div className="absolute left-0 right-0 top-0 flex items-center justify-between p-6">
                <div className="inline-flex items-center gap-3 border-b border-white/12 pb-2">
                  <div className="relative h-8 w-8">
                    <Image src={spotlightCards[0].icon} alt="" fill className="object-contain grayscale brightness-150" />
                  </div>
                  <span className="text-[11px] uppercase tracking-[0.22em] text-white/70">Training Motion</span>
                </div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8">
                <h3 className="max-w-xl text-2xl font-semibold tracking-[-0.04em] text-white sm:text-3xl">
                  {spotlightCards[0].title}
                </h3>
                <p className="mt-4 max-w-xl text-sm leading-7 text-white/66 sm:text-base">
                  {spotlightCards[0].description}
                </p>
              </div>
            </article>

            <div className="grid gap-6">
              {spotlightCards.slice(1).map((card) => (
                <article key={card.title} className="group relative border-t border-white/10 pt-6">
                  <div className="grid min-h-[15rem] gap-6 sm:grid-cols-[0.9fr_1.1fr] sm:items-center">
                    <div className="relative z-10">
                      <div className="inline-flex items-center gap-3 border-b border-white/12 pb-2">
                        <div className="relative h-8 w-8">
                          <Image src={card.icon} alt="" fill className="object-contain grayscale brightness-150" />
                        </div>
                        <span className="text-[11px] uppercase tracking-[0.22em] text-white/62">Operational Flow</span>
                      </div>
                      <h3 className="mt-5 text-2xl font-semibold tracking-[-0.04em] text-white">
                        {card.title}
                      </h3>
                      <p className="mt-4 text-sm leading-7 text-white/62">{card.description}</p>
                    </div>
                    <div className="relative h-52 overflow-hidden">
                      <Image
                        src={card.image}
                        alt={card.title}
                        fill
                        className="object-cover transition-transform duration-700 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </Container>
      </section>

      <section className="relative border-b border-white/[0.08] py-20 sm:py-24 lg:py-32">
        <div
          className="absolute inset-0 opacity-[0.045]"
          style={{
            backgroundImage:
              "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
            backgroundSize: "70px 70px",
          }}
        />
        <Container className="relative">
          <div className="grid gap-12 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
            <SectionHeader
              label="Operating Modes"
              title="Pods, serverless, model APIs, and clusters each have a clear role"
              description="Choose the right runtime for each stage of the AI lifecycle."
            />

            <div className="grid gap-5 sm:grid-cols-2">
              {operatingModes.map((mode, index) => (
                <article key={mode.title} className="group relative overflow-hidden rounded-none border border-white/10 bg-white/[0.03]">
                  <div className="absolute inset-0">
                    <Image
                      src={mode.image}
                      alt={mode.title}
                      fill
                      className="object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,8,8,0.16),rgba(8,8,8,0.84)_65%,rgba(8,8,8,0.96)_100%)]" />
                  </div>
                  <div className="relative flex min-h-[24rem] flex-col justify-between p-6">
                    <div className="flex items-center justify-between">
                      <div className="inline-flex items-center gap-3 rounded-none border border-white/10 bg-black/25 px-3 py-2 backdrop-blur-xl">
                        <div className="relative h-8 w-8">
                          <Image src={mode.icon} alt="" fill className="object-contain grayscale brightness-150" />
                        </div>
                        <span className="text-[11px] uppercase tracking-[0.22em] text-white/64">
                          Mode {index + 1}
                        </span>
                      </div>
                      <div className="text-xs uppercase tracking-[0.26em] text-white/34">AI Runtime</div>
                    </div>
                    <div>
                      <h3 className="text-2xl font-semibold tracking-[-0.04em] text-white">
                        {mode.title}
                      </h3>
                      <p className="mt-4 max-w-sm text-sm leading-7 text-white/66">
                        {mode.subtitle}
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
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(255,255,255,0.08),transparent_28%),linear-gradient(180deg,rgba(2,2,2,0)_0%,rgba(2,2,2,0.5)_100%)]" />
        <Container className="relative">
          <SectionHeader
            label="Reference Architecture"
            title="A believable path from data and experiments to hardened AI products"
            description="From datasets and tuning to autoscaled inference and operations."
          />

          <div className="mt-14 grid gap-10 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
            <div className="relative mx-auto aspect-[0.92] w-full max-w-[32rem]">
              <div className="absolute inset-0 rounded-none border border-white/10 bg-[linear-gradient(160deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02)_24%,rgba(110,110,110,0.08)_74%,rgba(2,2,2,0.84)_100%)] shadow-[0_28px_100px_rgba(0,0,0,0.32)]" />
              <div className="absolute inset-[1.2rem] overflow-hidden rounded-none border border-white/10 bg-[#080808]">
                <Image
                  src="/images/main-page/service-home-kubernetes-section-3.png"
                  alt="AI infrastructure architecture"
                  fill
                  className="object-cover opacity-72"
                />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,8,8,0.2),rgba(8,8,8,0.85)_72%)]" />
                <div className="absolute left-[12%] top-[22%] h-px w-[58%] bg-gradient-to-r from-transparent via-white/60 to-transparent" />
                <div className="absolute right-[8%] top-[48%] h-px w-[40%] bg-gradient-to-r from-transparent via-white/40 to-transparent" />
                {[
                  { title: "Data + artifacts", pos: "left-[11%] top-[18%]" },
                  { title: "GPU tuning pods", pos: "right-[9%] top-[27%]" },
                  { title: "Autoscaling APIs", pos: "left-[18%] bottom-[18%]" },
                  { title: "Ops + governance", pos: "right-[8%] bottom-[16%]" },
                ].map((item) => (
                  <div
                    key={item.title}
                    className={`absolute ${item.pos} rounded-none border border-white/10 bg-black/35 px-4 py-2 text-xs uppercase tracking-[0.18em] text-white/70 backdrop-blur-xl`}
                  >
                    {item.title}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-6">
              {architectureSteps.map((step, index) => (
                <article key={step.id} className="relative pl-10">
                  <div className="absolute left-0 top-1 flex h-7 w-7 items-center justify-center rounded-none border border-[#4c9eff]/30 bg-[#4c9eff]/[0.08] text-[11px] font-medium tracking-[0.16em] text-white/82">
                    {step.id}
                  </div>
                  {index !== architectureSteps.length - 1 ? (
                    <div className="absolute left-[13px] top-10 h-[calc(100%+18px)] w-px bg-gradient-to-b from-white/40 via-white/15 to-transparent" />
                  ) : null}
                  <h3 className="text-xl font-semibold tracking-[-0.03em] text-white">
                    {step.title}
                  </h3>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-white/62 sm:text-base">
                    {step.description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </Container>
      </section>

      <section className="relative border-b border-white/[0.08] py-20 sm:py-24 lg:py-32">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_26%,rgba(255,255,255,0.08),transparent_22%),radial-gradient(circle_at_80%_70%,rgba(90,90,90,0.12),transparent_22%)]" />
        <Container className="relative">
          <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div>
              <SectionHeader
                label="Premium GPU Fleet"
                title="Match hardware tiers to the actual stage of your AI product"
                description="Choose hardware for frontier training, high-memory inference, or efficient multimodal workloads."
              />
              <div className="relative mt-10 aspect-[1.05] w-full overflow-hidden rounded-none border border-white/10 bg-[#080808]">
                <Image
                  src="/images/main-page/service-home-gpu-section-3.png"
                  alt="Premium GPU infrastructure"
                  fill
                  className="object-cover opacity-82"
                />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,8,8,0.12),rgba(8,8,8,0.92)_76%)]" />
                <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
                  <div className="text-[11px] uppercase tracking-[0.26em] text-white/42">Premium Compute</div>
                  <h3 className="mt-3 max-w-md text-2xl font-semibold tracking-[-0.04em] text-white sm:text-3xl">
                    Enterprise-grade acceleration for model training, fine-tuning, and inference density
                  </h3>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              {gpuFleet.map((gpu) => (
                <article key={gpu.model} className="group relative border-t border-white/10 pt-6 sm:pt-7">
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.24em] text-white/34">GPU Tier</div>
                      <h3 className="mt-3 text-4xl font-semibold tracking-[-0.06em] text-white">
                        {gpu.model}
                      </h3>
                    </div>
                    <div className="relative h-14 w-14 shrink-0">
                      <Image
                        src="/solution/secondsection/Filter.svg"
                        alt=""
                        fill
                        className="object-contain opacity-80 grayscale brightness-150 transition-transform duration-500 group-hover:scale-110"
                      />
                    </div>
                  </div>
                  <p className="mt-5 text-sm font-medium text-[#9fcbff] sm:text-base">{gpu.fit}</p>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-white/62 sm:text-base">
                    {gpu.description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </Container>
      </section>

      <ReadyToBuild {...readyToBuildData} />
    </main>
  );
}
