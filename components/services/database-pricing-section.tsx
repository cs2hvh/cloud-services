"use client";
import { assetUrl } from "@/lib/asset-url";

import Image from "next/image";
import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";

import { Container } from "@/components/ui/container";
import { AuthAwareServiceCta } from "@/components/services/auth-aware-service-cta";
import type { Plan } from "@/types/pricing";

type Cycle = "monthly" | "yearly";

type EnginePricingProfile = {
  key: string;
  name: string;
  image: string;
  logoStyle: "icon" | "wordmark";
  accent: string;
  aliases: string[];
  monthly: number;
  yearly: number;
  summary: string;
  note: string;
  highlights: string[];
};

const ENGINE_PRICING: EnginePricingProfile[] = [
  {
    key: "postgresql",
    name: "PostgreSQL",
    image: assetUrl("/images/database-logos/postgresql.png"),
    logoStyle: "icon",
    accent: "#8ecaff",
    aliases: ["postgresql", "postgres", "pg"],
    monthly: 18,
    yearly: 15,
    summary: "For app backends and production SQL.",
    note: "Free for dev, scales cleanly into HA clusters.",
    highlights: ["1 GB free", "PITR on paid", "Replica ready"],
  },
  {
    key: "mysql",
    name: "MySQL",
    image: assetUrl("/images/database-logos/mysql.svg"),
    logoStyle: "wordmark",
    accent: "#9ad0ff",
    aliases: ["mysql"],
    monthly: 16,
    yearly: 13,
    summary: "For web stacks, commerce, and customer portals.",
    note: "Simple dev entry, managed failover for production.",
    highlights: ["1 GB free", "Managed failover", "Private access"],
  },
  {
    key: "mongodb",
    name: "MongoDB",
    image: assetUrl("/images/database-logos/mongodb.png"),
    logoStyle: "wordmark",
    accent: "#9ae6b4",
    aliases: ["mongodb", "mongo"],
    monthly: 22,
    yearly: 18,
    summary: "For flexible product data and content-heavy apps.",
    note: "Start free, move to replica-backed clusters when traffic grows.",
    highlights: ["1 GB free", "Snapshot recovery", "Replica set ready"],
  },
  {
    key: "redis",
    name: "Redis",
    image: assetUrl("/images/database-logos/redis.png"),
    logoStyle: "wordmark",
    accent: "#f7b4b4",
    aliases: ["redis"],
    monthly: 12,
    yearly: 10,
    summary: "For sessions, queues, and low-latency cache paths.",
    note: "Fast dev cache, then high-availability memory nodes for live traffic.",
    highlights: ["256 MB free", "AOF or snapshot", "Sub-ms reads"],
  },
];

const UNIVERSAL_FEATURES = [
  "TLS endpoints",
  "Automated backups",
  "Metrics and alerts",
  "Private networking",
  "Role-based access",
  "One-click scaling",
];

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function getMatchedPlan(engine: EnginePricingProfile, plans: Plan[]) {
  const aliases = engine.aliases.map(normalize);

  return plans.find((plan) => {
    const haystack = normalize(
      [plan.name, plan.description, ...(plan.features ?? [])].filter(Boolean).join(" ")
    );

    return aliases.some((alias) => haystack.includes(alias));
  });
}

function getEnginePrice(engine: EnginePricingProfile, plan: Plan | undefined, cycle: Cycle) {
  if (!plan) {
    return cycle === "monthly" ? engine.monthly : engine.yearly;
  }

  const dynamicValue = cycle === "monthly" ? plan.monthly : plan.yearly;
  return dynamicValue > 0 ? dynamicValue : cycle === "monthly" ? engine.monthly : engine.yearly;
}

interface DatabasePricingSectionProps {
  plans?: Plan[];
}

export default function DatabasePricingSection({
  plans = [],
}: DatabasePricingSectionProps) {
  const [cycle, setCycle] = useState<Cycle>("monthly");

  const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

  return (
    <section className="relative overflow-hidden bg-[#E6E4DC] py-20 text-[#1A1814] sm:py-24 lg:py-28">
      <Container>
        <div className="mx-auto max-w-6xl">
          {/* Header — centered for symmetry with other editorial sections */}
          <div className="mx-auto max-w-[760px] text-center">
            <h2 className="text-3xl font-semibold leading-[1.05] tracking-[-0.02em] text-black sm:text-4xl lg:text-[46px]">
              Price the engine you actually deploy
            </h2>
            <p className="mx-auto mt-5 max-w-[580px] text-[15px] leading-[1.6] text-black/65 sm:text-[16px]">
              Start free, then move into production pricing by engine. Same managed baseline on every database — no hidden line items.
            </p>

            {/* Cycle toggle */}
            <div className="mt-7 inline-flex rounded-[6px] border border-black/15 bg-[#EEECE4] p-1">
              {(["monthly", "yearly"] as const).map((billingCycle) => (
                <button
                  key={billingCycle}
                  type="button"
                  onClick={() => setCycle(billingCycle)}
                  className={`${MONO} cursor-pointer rounded-[4px] px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors ${
                    cycle === billingCycle
                      ? "bg-black text-white"
                      : "text-black/55 hover:text-black"
                  }`}
                >
                  {billingCycle === "monthly" ? "Monthly" : "Yearly"}
                </button>
              ))}
            </div>
          </div>

          {/* Engine pricing cards */}
          <div className="mt-12 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {ENGINE_PRICING.map((engine) => {
              const matchedPlan = getMatchedPlan(engine, plans);
              const enginePrice = getEnginePrice(engine, matchedPlan, cycle);

              return (
                <article
                  key={engine.key}
                  className="group relative flex flex-col rounded-[10px] border border-black/10 bg-[#EEECE4] p-6 transition-all hover:border-[#0095FF] hover:shadow-[0_18px_40px_-16px_rgba(0,149,255,0.28)]"
                >
                  {/* Engine logo */}
                  <div
                    className={`flex items-center justify-start ${
                      engine.logoStyle === "wordmark" ? "h-12 w-24" : "h-12 w-12"
                    }`}
                  >
                    <Image
                      src={engine.image}
                      alt={engine.name}
                      width={engine.logoStyle === "wordmark" ? 120 : 56}
                      height={engine.logoStyle === "wordmark" ? 40 : 56}
                      className={`object-contain ${
                        engine.logoStyle === "wordmark"
                          ? "h-auto w-full max-w-[92px]"
                          : "h-10 w-10"
                      }`}
                    />
                  </div>

                  {/* Name + summary */}
                  <div className="mt-5">
                    <h3 className="text-[20px] font-semibold leading-tight tracking-[-0.01em] text-black">
                      {engine.name}
                    </h3>
                    <p className="mt-2 text-[13px] leading-[1.55] text-black/60">
                      {engine.summary}
                    </p>
                  </div>

                  {/* Price block */}
                  <div className="mt-6 border-t border-black/10 pt-5">
                    <div className="flex items-end justify-between gap-4">
                      <div>
                        <div
                          className={`${MONO} text-[9.5px] font-semibold uppercase tracking-[0.18em] text-black/45`}
                        >
                          Start
                        </div>
                        <div className="mt-1.5 text-[24px] font-semibold leading-none tracking-[-0.01em] text-black">
                          Free
                        </div>
                      </div>
                      <div className="text-right">
                        <div
                          className={`${MONO} text-[9.5px] font-semibold uppercase tracking-[0.18em] text-black/45`}
                        >
                          Paid
                        </div>
                        <div
                          className={`${MONO} mt-1.5 text-[26px] font-bold leading-none tabular-nums text-black`}
                        >
                          ${enginePrice}
                          <span className="ml-1 text-[11px] font-normal text-black/55">
                            /mo
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Highlights */}
                  <ul className="mt-5 space-y-2">
                    {engine.highlights.map((highlight) => (
                      <li
                        key={highlight}
                        className="flex items-center gap-2 text-[12.5px] text-black/70"
                      >
                        <Check
                          className="h-3.5 w-3.5 shrink-0 text-black/55"
                          strokeWidth={2.2}
                        />
                        {highlight}
                      </li>
                    ))}
                  </ul>

                  {/* Note */}
                  <p className="mt-5 border-t border-black/10 pt-4 text-[12px] leading-[1.55] text-black/55">
                    {engine.note}
                  </p>

                  {/* CTA — subtle outline so it doesn't dominate the cream card */}
                  <AuthAwareServiceCta
                    service="database"
                    intent="new"
                    className={`${MONO} mt-5 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-[5px] border border-black/15 bg-transparent text-[11px] font-semibold uppercase tracking-[0.14em] text-black/80 transition-colors hover:border-[#0095FF] hover:bg-[#0095FF] hover:text-white`}
                  >
                    <span className="flex items-center gap-1.5">
                      Deploy {engine.name}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </AuthAwareServiceCta>
                </article>
              );
            })}
          </div>

          {/* Universal features — included with every database */}
          <div className="mt-10 rounded-[10px] border border-black/10 bg-[#EEECE4] p-6 sm:p-7">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p
                  className={`${MONO} text-[10.5px] font-semibold uppercase tracking-[0.18em] text-black/55`}
                >
                  Included with every database
                </p>
                <p className="mt-2 max-w-[560px] text-[13px] leading-[1.55] text-black/60">
                  Every engine ships on the same managed baseline. You pick the database that fits the workload — we cover the operational primitives.
                </p>
              </div>
              <p
                className={`${MONO} text-[10.5px] uppercase tracking-[0.16em] text-black/45`}
              >
                Free for dev · paid clusters for production
              </p>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-px overflow-hidden rounded-[6px] border border-black/10 bg-black/10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {UNIVERSAL_FEATURES.map((feature) => (
                <div
                  key={feature}
                  className="flex items-center gap-2 bg-[#EEECE4] px-3 py-3 text-[12.5px] font-medium text-[#0095FF]"
                >
                  <Check
                    className="h-3.5 w-3.5 shrink-0 text-[#0095FF]"
                    strokeWidth={2.2}
                  />
                  {feature}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
