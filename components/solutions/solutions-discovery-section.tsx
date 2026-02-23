import Image from "next/image";
import Link from "next/link";
import { ChevronUp } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type SolutionCardData = {
  title: string;
  description: string;
  icon: string;
  outcomes: string[];
  products: string[];
};

const PRODUCT_FILTERS = [
  "Compute",
  "GPU Instance",
  "Database",
  "Security",
  "Kubernetes",
  "Object Storage",
  "AI Agents",
  "Application Deployment",
];

const SOLUTION_CARDS: SolutionCardData[] = [
  {
    title: "AI & Machine Learning",
    description:
      "Train, fine-tune, and serve models with accelerated compute and managed orchestration.",
    icon: "/solution/secondsection/AI.svg",
    outcomes: ["Faster experimentation", "Low-latency inference", "Cost controls"],
    products: ["GPU Instances", "AI Agents", "Kubernetes", "Object Storage"],
  },
  {
    title: "Web Hosting & SaaS Deployment",
    description:
      "Launch modern web apps with reliable compute, managed services, and smooth deployments.",
    icon: "/solution/secondsection/Monitor.svg",
    outcomes: ["Quick launches", "Horizontal scalability", "Operational simplicity"],
    products: ["Compute", "Application Deployment", "Database", "Security"],
  },
  {
    title: "Ecommerce Infrastructure",
    description:
      "Deliver fast storefronts and resilient checkout flows with secure, scalable building blocks.",
    icon: "/solution/secondsection/Shopping%20Bag.svg",
    outcomes: ["High uptime", "Performance under load", "Secure transactions"],
    products: ["Compute", "Database", "Security", "Object Storage"],
  },
  {
    title: "Game Development & Hosting",
    description:
      "Low-latency servers, scalable backends, and storage for assets and telemetry.",
    icon: "/solution/secondsection/Game%20Controller.svg",
    outcomes: ["Low ping", "Burst scale", "Operational visibility"],
    products: ["Compute", "Kubernetes", "Object Storage", "Security"],
  },
  {
    title: "Database-Driven Applications",
    description: "Build data-heavy apps with managed databases and secure networking.",
    icon: "/solution/secondsection/Database.svg",
    outcomes: ["Reliability", "High availability", "Easy scaling"],
    products: ["Database", "Compute", "Security", "Object Storage"],
  },
  {
    title: "Secure Enterprise Cloud",
    description:
      "Harden workloads with identity controls, network segmentation, and governance.",
    icon: "/solution/secondsection/Protect.svg",
    outcomes: ["Least-privilege access", "Audit readiness", "Defense in depth"],
    products: ["Security", "Kubernetes", "Database", "Object Storage"],
  },
  {
    title: "Cloud-Native Kubernetes Platforms",
    description:
      "Run microservices with managed Kubernetes and modern delivery practices.",
    icon: "/solution/secondsection/Kubernetes.svg",
    outcomes: ["Faster releases", "Safer rollouts", "Consistent environments"],
    products: ["Kubernetes", "Application Deployment", "Security", "Database"],
  },
  {
    title: "Storage & Backup Solutions",
    description:
      "Store and protect critical data, backups, media, and build artifacts at scale.",
    icon: "/solution/secondsection/Stack.svg",
    outcomes: ["Durability", "Simpler backups", "Lower storage costs"],
    products: ["Object Storage", "Security", "Database", "Compute"],
  },
];

function ToolbarSurface({
  children,
  className,
  active = false,
}: {
  children: ReactNode;
  className?: string;
  active?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-[62px] items-center rounded-[2px] border border-[#999999]/90 px-4 backdrop-blur-[10px]",
        active ? "bg-[#B1B1B1]" : "bg-[#383838]",
        "shadow-[inset_0_0_22px_rgba(242,242,242,0.5),inset_2px_2px_1px_-2px_#B3B3B3,inset_-2px_-2px_1px_-2px_#B3B3B3,inset_3px_3px_0px_-3px_rgba(0,0,0,0.5)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

function SolutionCard({ card }: { card: SolutionCardData }) {
  return (
    <article className="flex min-h-[288px] flex-col border border-[#F2F2F2]/70 bg-transparent p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <Image src={card.icon} alt="" width={41} height={41} />
        <div>
          <h3 className="text-[16px] font-normal leading-[1.2] text-white">{card.title}</h3>
          <p className="mt-2 max-w-[430px] text-[12px] font-light leading-[1.3] text-white">
            {card.description}
          </p>
        </div>
      </div>

      <p className="mt-3 text-[10px] font-light text-white">Key outcomes</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {card.outcomes.map((outcome) => (
          <span
            key={outcome}
            className="inline-flex h-7 items-center border border-[#737373] px-3 text-[10px] font-light text-white"
          >
            {outcome}
          </span>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {card.products.map((product) => (
          <span
            key={product}
            className="inline-flex h-5 items-center border border-[#737373] px-2 text-[9px] font-light leading-none text-white"
          >
            {product}
          </span>
        ))}
      </div>

      <div className="mt-auto pt-8">
        <div className="h-px w-full bg-[#686868]" />
        <div className="mt-3 flex items-center justify-between">
          <Link href="/signup" className="text-[10px] font-semibold text-white">
            View Solution -&gt;
          </Link>
          <Link href="/docs" className="text-[10px] font-normal text-white">
            Architecture Guide
          </Link>
        </div>
      </div>
    </article>
  );
}

export function SolutionsDiscoverySection() {
  return (
    <section className="bg-black pb-16 pt-6 sm:pb-20 sm:pt-8 lg:pb-24">
      <div className="mx-auto w-full max-w-[1438px] px-4 sm:px-6 md:px-10 lg:px-14 xl:px-16">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_155px_155px_155px]">
          <ToolbarSurface className="px-6 sm:px-8">
            <Image
              src="/solution/secondsection/Search.svg"
              alt=""
              width={35}
              height={35}
              className="opacity-40"
            />
            <p className="ml-2 text-[15px] font-medium text-white/40 sm:text-[18px] lg:text-[20px]">
              Search solutions by name, use cases, or outcome....
            </p>
          </ToolbarSurface>

          <ToolbarSurface>
            <Image src="/solution/secondsection/Filter.svg" alt="" width={35} height={35} />
            <span className="ml-1 text-[20px] font-medium leading-none text-white">Filters</span>
            <ChevronUp className="ml-auto h-5 w-5 text-white" />
          </ToolbarSurface>

          <ToolbarSurface active>
            <Image src="/solution/secondsection/Solutions.svg" alt="" width={35} height={35} />
            <span className="ml-1 text-[20px] font-medium leading-none text-black">
              Solutions
            </span>
          </ToolbarSurface>

          <ToolbarSurface>
            <Image src="/solution/secondsection/Product.svg" alt="" width={35} height={35} />
            <span className="ml-1 text-[20px] font-medium leading-none text-white">Products</span>
          </ToolbarSurface>
        </div>

        <div className="mt-3 h-px w-full bg-[#686868]" />

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="mr-2 text-[10px] font-medium uppercase text-white">Products</span>
          {PRODUCT_FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              className="h-[24px] border border-[#464A4D] bg-[rgba(56,56,56,0.18)] px-2 text-[8px] font-medium text-white shadow-[0_4px_4px_rgba(0,0,0,0.25)] backdrop-blur-[8.1px] sm:h-[30px] sm:px-3 sm:text-[10px] lg:h-[37px] lg:text-[12px]"
            >
              {item}
            </button>
          ))}
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-2 lg:gap-10">
          {SOLUTION_CARDS.map((card) => (
            <SolutionCard key={card.title} card={card} />
          ))}
        </div>
      </div>
    </section>
  );
}
