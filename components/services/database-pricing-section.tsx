"use client";

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
    image: "/images/database-logos/postgresql.png",
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
    image: "/images/database-logos/mysql.svg",
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
    image: "/images/database-logos/mongodb.png",
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
    image: "/images/database-logos/redis.png",
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

  return (
    <section className="relative overflow-hidden bg-black py-16 lg:py-24">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(255,255,255,0.05),transparent_20%),radial-gradient(circle_at_82%_14%,rgba(0,149,255,0.08),transparent_18%),linear-gradient(180deg,#000000_0%,#06080d_48%,#000000_100%)]" />
      </div>

      <Container>
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-2 border border-white/[0.08] bg-white/[0.03] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
                <span className="h-1.5 w-1.5 bg-[#0095FF]" />
                Database Pricing
              </span>
              <h2 className="mt-5 text-3xl font-[400] leading-[1.03] tracking-tight text-white sm:text-4xl lg:text-[4rem]">
                Price the
                <span className="block text-[#8ecaff]">engine you actually deploy</span>
              </h2>
            </div>

            <div className="flex flex-col gap-4 lg:items-end">
              <p className="max-w-md text-sm leading-7 text-white/52 lg:text-[15px] lg:text-right">
                Start free, then move into production pricing by engine.
              </p>

              <div className="inline-flex border border-white/[0.08] bg-white/[0.03] p-1">
                {(["monthly", "yearly"] as const).map((billingCycle) => (
                  <button
                    key={billingCycle}
                    type="button"
                    onClick={() => setCycle(billingCycle)}
                    className={`cursor-pointer px-5 py-2 text-[12px] font-medium uppercase tracking-[0.12em] transition-all duration-200 ${
                      cycle === billingCycle
                        ? "bg-white text-black"
                        : "text-white/45 hover:text-white/78"
                    }`}
                  >
                    {billingCycle === "monthly" ? "Monthly" : "Yearly"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-12 grid gap-4 xl:grid-cols-4">
            {ENGINE_PRICING.map((engine) => {
              const matchedPlan = getMatchedPlan(engine, plans);
              const enginePrice = getEnginePrice(engine, matchedPlan, cycle);

              return (
                <article
                  key={engine.key}
                  className="group relative flex min-h-[100%] flex-col overflow-hidden border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.018))] p-5 transition-all duration-300 hover:border-white/[0.14] hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] hover:shadow-[0_24px_60px_rgba(0,0,0,0.38)]"
                >
                  <div
                    className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                    style={{
                      background: `radial-gradient(circle at top right, ${engine.accent}20, transparent 28%)`,
                    }}
                  />
                  <div
                    className="absolute inset-x-0 top-0 h-px"
                    style={{
                      background: `linear-gradient(90deg, transparent, ${engine.accent}, transparent)`,
                    }}
                  />

                  <div className="relative flex items-start justify-between gap-4">
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
                          engine.logoStyle === "wordmark" ? "h-auto w-full max-w-[92px]" : "h-10 w-10"
                        }`}
                      />
                    </div>

                  </div>

                  <div className="relative mt-6">
                    <h3 className="text-[22px] font-medium tracking-tight text-white">{engine.name}</h3>
                    <p className="mt-3 text-[13px] leading-6 text-white/60">{engine.summary}</p>
                  </div>

                  <div className="relative mt-6 border-t border-white/[0.08] pt-5">
                    <div className="flex items-end justify-between gap-4">
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/34">Start</div>
                        <div className="mt-2 text-[26px] font-[500] tracking-tight text-white">Free</div>
                      </div>

                      <div className="text-right">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/34">Paid</div>
                        <div className="mt-2 text-[28px] font-[500] tracking-tight text-white">
                          ${enginePrice}
                          <span className="ml-1 text-[12px] font-normal text-white/36">/mo</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="relative mt-6 grid gap-3">
                    {engine.highlights.map((highlight) => (
                      <div
                        key={highlight}
                        className="flex items-center gap-2 border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 text-[12px] text-white/66"
                      >
                        <Check className="h-3.5 w-3.5 shrink-0" style={{ color: engine.accent }} />
                        {highlight}
                      </div>
                    ))}
                  </div>

                  <div className="relative mt-6 border-t border-white/[0.08] pt-5">
                    <p className="text-[13px] leading-6 text-white/54">{engine.note}</p>
                  </div>

                  <AuthAwareServiceCta
                    service="database"
                    intent="new"
                    className="relative mt-auto inline-flex h-11 w-full items-center justify-center gap-2 border border-white/[0.08] bg-white text-[13px] font-medium text-black transition-colors duration-200 hover:bg-white/90"
                  >
                    Deploy {engine.name}
                    <ArrowRight className="h-4 w-4" />
                  </AuthAwareServiceCta>
                </article>
              );
            })}
          </div>

          <div className="mt-8 border border-white/[0.08] bg-white/[0.02] p-5 sm:p-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/36">
                  Included with every database
                </div>
                <p className="mt-2 text-[13px] leading-6 text-white/52">
                  Every engine keeps the same managed baseline, so buyers compare database fit instead of guessing which operational pieces are missing.
                </p>
              </div>
              <div className="text-[12px] text-white/34">
                Free tiers for development, paid clusters for production.
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              {UNIVERSAL_FEATURES.map((feature) => (
                <div
                  key={feature}
                  className="flex items-center gap-2 border border-white/[0.08] bg-black/30 px-3 py-3 text-[12px] text-white/62"
                >
                  <Check className="h-3.5 w-3.5 shrink-0 text-[#8ecaff]" />
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
