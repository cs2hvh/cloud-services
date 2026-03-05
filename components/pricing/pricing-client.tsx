"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ServiceCategory} from "@/lib/supabase/queries/pricing";
import { PricingContent } from "@/components/pricing/pricing-content";

interface PricingClientProps {
  categories: ServiceCategory[];
}

export default function PricingClient({ categories }: PricingClientProps) {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [activeCategory, setActiveCategory] = useState<string>(categories[0]?.id || "compute");
  const [expandedTierId, setExpandedTierId] = useState<string>("performance");

  const currentCategory = categories.find((cat) => cat.id === activeCategory);

  return (
    <main className="min-h-screen bg-[#191919] text-white pt-20">
      {/* Header Section */}
      <section className="mx-auto w-full max-w-[75%] px-[clamp(24px,3vw,80px)] py-12 md:py-16">
        <div className="text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-semibold mb-4">
            Pricing
          </h1>
          <p className="text-white/60 text-sm md:text-base mb-3">
            Pricing that scales from starter to enterprise
          </p>
          <p className="text-white/40 text-xs md:text-sm mb-8">
            Pick a category from the left and compare tiers. Designed to match a
            thoughtful→lean <br className="hidden sm:block" />
            deploy, scale navigation, easy cost, HTML, and simple top-offs.
          </p>

          {/* Toggle Switch */}
          <div className="inline-flex items-center gap-4 text-xs md:text-sm font-medium">
            <button
              onClick={() => setBillingCycle("monthly")}
              className={cn(
                "cursor-pointer transition-colors duration-200",
                billingCycle === "monthly" ? "text-white" : "text-white/50 hover:text-white"
              )}
            >
              Monthly
            </button>
            <button
              onClick={() =>
                setBillingCycle((prev) => (prev === "monthly" ? "yearly" : "monthly"))
              }
              aria-pressed={billingCycle === "yearly"}
              className="relative h-6 w-12 rounded-full border border-white/20 bg-white/10 transition-colors duration-200"
            >
              <span
                className={cn(
                  "absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white transition-all duration-200",
                  billingCycle === "yearly" ? "right-1" : "left-1"
                )}
              />
            </button>
            <button
              onClick={() => setBillingCycle("yearly")}
              className={cn(
                "cursor-pointer transition-colors duration-200",
                billingCycle === "yearly" ? "text-white" : "text-white/50 hover:text-white"
              )}
            >
              Pay annually get 20%
            </button>
          </div>
        </div>
      </section>

      {/* Main Content - Tabs and Pricing */}
      <section className="mx-auto w-full max-w-[75%] px-[clamp(24px,3vw,80px)] pb-16 md:pb-24">
        <div className="flex flex-col lg:flex-row gap-10 lg:gap-14">
          {/* Left Side - Category Tabs */}
          <aside className="lg:w-60 shrink-0 border-r border-white pr-4">
            <div className="lg:sticky lg:top-24">
              <div className="space-y-1 font-[family-name:var(--font-sansation)]">
                {categories.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => setActiveCategory(category.id)}
                    className={cn(
                      "cursor-pointer w-full text-left px-3 py-2 text-sm font-medium transition-all duration-200",
                      activeCategory === category.id
                        ? "bg-white text-black"
                        : "text-white/50 hover:text-white"
                    )}
                  >
                    {category.label}
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <PricingContent
            category={currentCategory}
            billingCycle={billingCycle}
            expandedTierId={expandedTierId}
            setExpandedTierId={setExpandedTierId}
          />
        </div>
      </section>
    </main>
  );
}
