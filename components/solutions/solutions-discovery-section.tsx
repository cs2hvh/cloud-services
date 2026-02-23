"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronUp } from "lucide-react";
import { useMemo, useState } from "react";
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
  "GPU Instances",
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

const TOOLBAR_SHADOW =
  "shadow-[inset_0_0_22px_rgba(242,242,242,0.5),inset_0_0_0_1px_#999999,inset_2px_2px_1px_-2px_#B3B3B3,inset_-2px_-2px_1px_-2px_#B3B3B3,inset_3px_3px_0px_-3px_rgba(0,0,0,0.5)]";

function normalizeText(value: string) {
  return value.toLowerCase().trim();
}

function ToolbarSurface({
  children,
  className,
  active = false,
  asButton = false,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  active?: boolean;
  asButton?: boolean;
  onClick?: () => void;
}) {
  const commonClass = cn(
    "flex h-[62px] items-center rounded-[2px] border border-[#999999]/90 px-4 backdrop-blur-[10px]",
    active ? "bg-[#B1B1B1]" : "bg-[#383838]",
    TOOLBAR_SHADOW,
    className,
  );

  if (asButton) {
    return (
      <button type="button" onClick={onClick} className={cn(commonClass, "text-left")}>
        {children}
      </button>
    );
  }

  return <div className={commonClass}>{children}</div>;
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
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"solutions" | "products">("solutions");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);

  const cardsBySearch = useMemo(() => {
    const normalizedQuery = normalizeText(query);
    if (!normalizedQuery) return SOLUTION_CARDS;

    return SOLUTION_CARDS.filter((card) => {
      const haystack = normalizeText(
        `${card.title} ${card.description} ${card.outcomes.join(" ")} ${card.products.join(" ")}`,
      );
      return haystack.includes(normalizedQuery);
    });
  }, [query]);

  const filteredCards = useMemo(() => {
    if (selectedProducts.length === 0) return cardsBySearch;
    return cardsBySearch.filter((card) =>
      card.products.some((product) => selectedProducts.includes(product)),
    );
  }, [cardsBySearch, selectedProducts]);

  const productCounts = useMemo(() => {
    return PRODUCT_FILTERS.reduce<Record<string, number>>((acc, product) => {
      acc[product] = cardsBySearch.filter((card) => card.products.includes(product)).length;
      return acc;
    }, {});
  }, [cardsBySearch]);

  const toggleProduct = (product: string) => {
    setSelectedProducts((current) =>
      current.includes(product)
        ? current.filter((item) => item !== product)
        : [...current, product],
    );
  };

  return (
    <section className="bg-black pb-16 pt-6 sm:pb-20 sm:pt-8 lg:pb-24">
      <div className="mx-auto w-full max-w-[1438px] px-4 sm:px-6 md:px-10 lg:px-14 xl:px-16">
        <div className="relative grid gap-3 lg:grid-cols-[minmax(0,1fr)_155px_155px_155px]">
          <ToolbarSurface className="px-6 sm:px-8">
            <Image
              src="/solution/secondsection/Search.svg"
              alt=""
              width={35}
              height={35}
              className="opacity-40"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              type="text"
              placeholder="Search solutions by name, use cases, or outcome...."
              className="ml-2 w-full bg-transparent text-[15px] font-medium text-white outline-none placeholder:text-white/40 sm:text-[18px] lg:text-[20px]"
            />
          </ToolbarSurface>

          <ToolbarSurface asButton onClick={() => setShowFilters((prev) => !prev)}>
            <Image src="/solution/secondsection/Filter.svg" alt="" width={35} height={35} />
            <span className="ml-1 text-[20px] font-medium leading-none text-white">Filters</span>
            {selectedProducts.length > 0 ? (
              <span className="ml-2 rounded-sm border border-white/35 px-1.5 text-[11px] text-white">
                {selectedProducts.length}
              </span>
            ) : null}
            <ChevronUp
              className={cn(
                "ml-auto h-5 w-5 text-white transition-transform",
                showFilters ? "rotate-180" : "",
              )}
            />
          </ToolbarSurface>

          <ToolbarSurface
            asButton
            active={activeTab === "solutions"}
            onClick={() => setActiveTab("solutions")}
          >
            <Image src="/solution/secondsection/Solutions.svg" alt="" width={35} height={35} />
            <span
              className={cn(
                "ml-1 text-[20px] font-medium leading-none",
                activeTab === "solutions" ? "text-black" : "text-white",
              )}
            >
              Solutions
            </span>
          </ToolbarSurface>

          <ToolbarSurface
            asButton
            active={activeTab === "products"}
            onClick={() => setActiveTab("products")}
          >
            <Image src="/solution/secondsection/Product.svg" alt="" width={35} height={35} />
            <span
              className={cn(
                "ml-1 text-[20px] font-medium leading-none",
                activeTab === "products" ? "text-black" : "text-white",
              )}
            >
              Products
            </span>
          </ToolbarSurface>

          {showFilters ? (
            <div className="absolute right-0 top-[70px] z-20 w-full max-w-[380px] border border-[#666] bg-[#141414] p-4 shadow-[0_14px_40px_rgba(0,0,0,0.45)]">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-white">
                  Filter By Product
                </p>
                <button
                  type="button"
                  onClick={() => setSelectedProducts([])}
                  className="text-[11px] text-white/70 hover:text-white"
                >
                  Clear all
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {PRODUCT_FILTERS.map((product) => {
                  const selected = selectedProducts.includes(product);
                  return (
                    <button
                      key={product}
                      type="button"
                      onClick={() => toggleProduct(product)}
                      className={cn(
                        "h-9 border px-2 text-left text-[11px]",
                        selected
                          ? "border-white bg-white/12 text-white"
                          : "border-[#555] bg-transparent text-white/80 hover:border-white/60",
                      )}
                    >
                      {product}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-3 h-px w-full bg-[#686868]" />

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="mr-2 text-[10px] font-medium uppercase text-white">Products</span>
          {PRODUCT_FILTERS.map((item) => {
            const selected = selectedProducts.includes(item);
            return (
              <button
                key={item}
                type="button"
                onClick={() => toggleProduct(item)}
                className={cn(
                  "h-[24px] border px-2 text-[8px] font-medium backdrop-blur-[8.1px] sm:h-[30px] sm:px-3 sm:text-[10px] lg:h-[37px] lg:text-[12px]",
                  selected
                    ? "border-white bg-white/16 text-white"
                    : "border-[#464A4D] bg-[rgba(56,56,56,0.18)] text-white shadow-[0_4px_4px_rgba(0,0,0,0.25)]",
                )}
              >
                {item}
              </button>
            );
          })}
        </div>

        {activeTab === "products" ? (
          <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {PRODUCT_FILTERS.map((product) => {
              const selected = selectedProducts.includes(product);
              return (
                <button
                  key={product}
                  type="button"
                  onClick={() => toggleProduct(product)}
                  className={cn(
                    "flex h-12 items-center justify-between border px-3 text-left",
                    selected
                      ? "border-white bg-white/10 text-white"
                      : "border-[#4a4a4a] bg-[#111] text-white/85",
                  )}
                >
                  <span className="text-[12px]">{product}</span>
                  <span className="text-[11px] text-white/70">{productCounts[product]}</span>
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-between text-[11px] text-white/70">
          <p>
            Showing <span className="text-white">{filteredCards.length}</span> solutions
          </p>
          {selectedProducts.length > 0 ? (
            <button
              type="button"
              onClick={() => setSelectedProducts([])}
              className="text-white/80 hover:text-white"
            >
              Reset filters
            </button>
          ) : null}
        </div>

        {filteredCards.length > 0 ? (
          <div className="mt-6 grid gap-6 md:grid-cols-2 lg:gap-10">
            {filteredCards.map((card) => (
              <SolutionCard key={card.title} card={card} />
            ))}
          </div>
        ) : (
          <div className="mt-6 border border-[#4a4a4a] bg-[#101010] p-8 text-center text-[14px] text-white/80">
            No matching solutions found. Try another keyword or remove filters.
          </div>
        )}
      </div>
    </section>
  );
}

