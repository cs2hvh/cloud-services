"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { ServiceCategory} from "@/lib/supabase/queries/pricing";
import { PricingContent } from "@/components/pricing/pricing-content";

interface PricingClientProps {
  categories: ServiceCategory[];
}

export default function PricingClient({ categories }: PricingClientProps) {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [activeCategory, setActiveCategory] = useState<string>(categories[0]?.id || "compute");

  // Track active section based on scroll position
  useEffect(() => {
    const handleScroll = () => {
      const sections = categories.map(cat => document.getElementById(cat.id));
      const scrollPosition = window.scrollY + 200; // offset for header

      for (let i = sections.length - 1; i >= 0; i--) {
        const section = sections[i];
        if (section && section.offsetTop <= scrollPosition) {
          setActiveCategory(categories[i].id);
          break;
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [categories]);

  const handleCategoryClick = (categoryId: string) => {
    setActiveCategory(categoryId);
    const element = document.getElementById(categoryId);
    if (element) {
      const offset = 100; // adjust for header
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;
      
      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
  };

  return (
    <main className="min-h-screen bg-[#04060a] text-white pt-20">
      {/* Header Section */}
      <section className="mx-auto w-full max-w-[75%] px-[clamp(24px,3vw,80px)] py-12 md:py-16">
        <div className="text-center">
          <div className="mb-5 inline-flex items-center gap-2.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.22em] text-white/55">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#0095FF] opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#0095FF] shadow-[0_0_6px_#0095FF]" />
            </span>
            <span>Transparent pricing</span>
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-semibold tracking-[-0.03em] mb-4">
            Pricing
          </h1>
          <p className="text-white/60 text-sm md:text-base mb-3">
            Pricing that scales from starter to enterprise
          </p>
          <p className="text-white/40 text-xs md:text-sm mb-8">
            Browse all categories below or jump to a specific service using the navigation menu.
            <br className="hidden sm:block" />
            Transparent pricing with no hidden fees. Scale up or down anytime.
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
              className={cn(
                "relative h-6 w-12 rounded-full border transition-colors duration-200",
                billingCycle === "yearly"
                  ? "border-[#0095FF] bg-[#0095FF]"
                  : "border-white/20 bg-white/10"
              )}
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
              Pay annually get <span className="text-[#0095FF]">20%</span>
            </button>
          </div>
        </div>
      </section>

      {/* Main Content - Tabs and Pricing */}
      <section className="mx-auto w-full max-w-[75%] px-[clamp(24px,3vw,80px)] pb-16 md:pb-24">
        <div className="flex flex-col lg:flex-row gap-10 lg:gap-14">
          {/* Left Side - Category Tabs */}
          <aside className="lg:w-60 shrink-0 border-r border-white/[0.08] pr-4">
            <div className="lg:sticky lg:top-24">
              <div className="space-y-1 font-[family-name:var(--font-sansation)]">
                {categories.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => handleCategoryClick(category.id)}
                    className={cn(
                      "cursor-pointer w-full text-left px-3 py-2 text-sm font-medium transition-colors duration-200",
                      activeCategory === category.id
                        ? "bg-[#0095FF] text-white"
                        : "text-white/50 hover:text-white hover:bg-white/[0.04]"
                    )}
                  >
                    {category.label}
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <div className="flex-1 space-y-8">
            {categories.map((category, index) => (
              <div
                key={category.id}
                id={category.id}
                className={cn(
                  "scroll-mt-24",
                  index > 0 && "border-t border-white/[0.08] pt-8"
                )}
              >
                <PricingContent
                  category={category}
                  billingCycle={billingCycle}
                />
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
