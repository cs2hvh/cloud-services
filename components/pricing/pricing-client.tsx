"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ServiceCategory } from "@/lib/supabase/queries/pricing";
import { PricingContent } from "@/components/pricing/pricing-content";

interface PricingClientProps {
  categories: ServiceCategory[];
}

const BRAND = "#0095FF";

// Humanize raw category slugs that come straight from the DB
// ("ai-agents", "network-ddos", "platform-apps") into proper labels.
const LABEL_OVERRIDES: Record<string, string> = {
  "gpu-instance": "GPU Instances",
  gpu: "GPU Instances",
  "ai-labs": "A.I. Labs",
  "ai-agents": "A.I. Labs",
  "ai-deployment": "A.I. Labs",
  "object-storage": "Object Storage",
  "app-deployment": "App Deployment",
  "platform-apps": "App Deployment",
  "network-ddos": "Network & DDoS",
  database: "Database",
  kubernetes: "Kubernetes",
  compute: "Compute",
  security: "Security",
};

function prettifyLabel(category: ServiceCategory): string {
  const slug = (category.id || "").toLowerCase();
  if (LABEL_OVERRIDES[slug]) return LABEL_OVERRIDES[slug];
  const raw = category.label || slug;
  // Title-case a kebab/space slug as a last resort.
  return raw
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function PricingClient({ categories }: PricingClientProps) {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [activeId, setActiveId] = useState<string>(categories[0]?.id || "");

  const activeCategory =
    categories.find((c) => c.id === activeId) ?? categories[0];

  return (
    <main className="relative min-h-screen bg-[#04060a] text-white">
      {/* Soft brand wash at the top */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] opacity-[0.18]"
        style={{
          background:
            "radial-gradient(60% 100% at 50% 0%, rgba(0,149,255,0.30), transparent 70%)",
        }}
      />

      {/* ─── Header ─── */}
      <section className="relative mx-auto w-full max-w-[1240px] px-[clamp(20px,4vw,48px)] pt-28 pb-10 sm:pt-32">
        <div className="max-w-2xl">
          <p className="font-[var(--font-geist-mono),ui-monospace,monospace] text-[11px] font-semibold uppercase tracking-[0.2em] text-white/45">
            Pricing
          </p>
          <h1 className="mt-4 text-4xl font-semibold leading-[1.02] tracking-tight sm:text-5xl lg:text-[56px]">
            Transparent pricing,
            <br />
            <span style={{ color: BRAND }}>billed by the second.</span>
          </h1>
          <p className="mt-5 max-w-xl text-[15px] leading-7 text-white/55">
            Every service on one bill. No tiers gated behind sales calls, no egress
            surprises — scale up or down whenever you need to.
          </p>
        </div>

        {/* Billing toggle */}
        <div className="mt-8 inline-flex items-center gap-1 rounded-[7px] border border-white/[0.1] bg-white/[0.03] p-1">
          <button
            onClick={() => setBillingCycle("monthly")}
            className={cn(
              "cursor-pointer rounded-[5px] px-4 py-1.5 text-[12.5px] font-medium transition-colors",
              billingCycle === "monthly" ? "bg-white text-black" : "text-white/55 hover:text-white"
            )}
          >
            Monthly
          </button>
          <button
            onClick={() => setBillingCycle("yearly")}
            className={cn(
              "cursor-pointer inline-flex items-center gap-2 rounded-[5px] px-4 py-1.5 text-[12.5px] font-medium transition-colors",
              billingCycle === "yearly" ? "bg-white text-black" : "text-white/55 hover:text-white"
            )}
          >
            Yearly
            <span
              className="rounded-[3px] px-1.5 py-0.5 text-[10px] font-semibold text-[#0095FF]"
              style={{ background: "rgba(0,149,255,0.16)", boxShadow: "0 0 10px rgba(0,149,255,0.55)" }}
            >
              Save 20%
            </span>
          </button>
        </div>
      </section>

      {/* ─── Main content ─── */}
      <section className="relative mx-auto w-full max-w-[1240px] px-[clamp(20px,4vw,48px)] pb-24">
        <div className="flex flex-col gap-10 lg:flex-row lg:gap-12">
          {/* Sidebar nav — selects one category at a time */}
          <aside className="lg:w-52 lg:shrink-0">
            <div className="lg:sticky lg:top-24">
              <p className="mb-3 hidden font-[var(--font-geist-mono),ui-monospace,monospace] text-[10px] uppercase tracking-[0.16em] text-white/35 lg:block">
                Services
              </p>
              {/* Mobile: horizontal scroll. Desktop: vertical list. */}
              <div className="flex gap-1.5 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pb-0">
                {categories.map((category) => {
                  const isActive = activeCategory?.id === category.id;
                  return (
                    <button
                      key={category.id}
                      onClick={() => setActiveId(category.id)}
                      className={cn(
                        "group relative flex shrink-0 items-center gap-2 whitespace-nowrap rounded-[5px] px-3 py-2 text-left text-[13px] font-medium transition-colors lg:w-full",
                        isActive ? "bg-white/[0.06] text-white" : "text-white/45 hover:text-white/80"
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "h-1 w-1 shrink-0 rounded-full transition-opacity",
                          isActive ? "opacity-100" : "opacity-0"
                        )}
                        style={{ background: BRAND, boxShadow: `0 0 6px ${BRAND}` }}
                      />
                      {prettifyLabel(category)}
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>

          {/* Active category */}
          <div className="min-w-0 flex-1 space-y-14">
            {activeCategory && (
              <PricingContent
                key={activeCategory.id}
                category={{ ...activeCategory, label: prettifyLabel(activeCategory) }}
                billingCycle={billingCycle}
              />
            )}

            {/* Enterprise / contact footer */}
            <div className="rounded-[10px] border border-white/[0.08] bg-white/[0.015] p-6 sm:p-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-[18px] font-semibold text-white">Need a custom plan?</h3>
                  <p className="mt-1.5 max-w-md text-[13.5px] leading-relaxed text-white/50">
                    Volume discounts, committed-use pricing, dedicated capacity, and SLAs for
                    teams running at scale.
                  </p>
                </div>
                <a
                  href="/contact"
                  className="inline-flex shrink-0 items-center justify-center rounded-[5px] bg-white px-5 py-2.5 text-[13px] font-medium text-black transition-colors hover:bg-[#0095FF] hover:text-white"
                >
                  Talk to sales
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
