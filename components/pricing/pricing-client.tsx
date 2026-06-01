"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { ServiceCategory } from "@/lib/supabase/queries/pricing";
import { PricingContent } from "@/components/pricing/pricing-content";
import { CategoryIcon } from "@/components/pricing/pricing-icons";

const BRAND = "#0095FF";
const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

interface PricingClientProps {
  categories: ServiceCategory[];
}

export default function PricingClient({ categories }: PricingClientProps) {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [activeCategory, setActiveCategory] = useState<string>(categories[0]?.id || "compute");

  // Track active section based on scroll position
  useEffect(() => {
    const handleScroll = () => {
      const sections = categories.map((cat) => document.getElementById(cat.id));
      const scrollPosition = window.scrollY + 200; // offset for header

      for (let i = sections.length - 1; i >= 0; i--) {
        const section = sections[i];
        if (section && section.offsetTop <= scrollPosition) {
          setActiveCategory(categories[i].id);
          break;
        }
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
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
        behavior: "smooth",
      });
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#04060a] text-white pt-20">
      {/* Soft brand-blue ambient glow — echoes the homepage hero backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 -z-0 h-[520px]"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 0%, rgba(0,149,255,0.10), transparent 70%)",
        }}
      />

      {/* Header Section */}
      <section className="relative z-10 mx-auto w-full max-w-[75%] px-[clamp(24px,3vw,80px)] py-12 md:py-16">
        <div className="text-center">
          {/* Eyebrow — mono ping label, matches hero */}
          <div
            className={cn(
              "mb-5 inline-flex items-center gap-2.5 text-[10.5px] font-semibold uppercase tracking-[0.22em] text-white/55",
              MONO
            )}
          >
            <span className="relative flex h-1.5 w-1.5">
              <span
                className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
                style={{ background: BRAND }}
              />
              <span
                className="relative inline-flex h-1.5 w-1.5 rounded-full"
                style={{ background: BRAND, boxShadow: `0 0 6px ${BRAND}` }}
              />
            </span>
            <span>Transparent pricing</span>
          </div>

          <h1 className="text-4xl font-semibold tracking-[-0.03em] md:text-5xl lg:text-6xl">
            Pricing that scales <span style={{ color: BRAND }}>with you</span>.
          </h1>
          <p className="mx-auto mt-4 max-w-[560px] text-sm text-white/60 md:text-base">
            Browse every service below, or jump straight to one using the menu. No hidden
            fees — scale up or down anytime.
          </p>

          {/* Billing toggle */}
          <div className="mt-8 inline-flex items-center gap-3 text-xs font-medium md:text-sm">
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
              aria-label="Toggle annual billing"
              className="relative h-6 w-12 cursor-pointer rounded-full border border-white/15 bg-white/[0.06] transition-colors duration-200 hover:border-white/30"
            >
              <span
                className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full transition-all duration-200"
                style={{
                  background: billingCycle === "yearly" ? BRAND : "#ffffff",
                  left: billingCycle === "yearly" ? "auto" : "4px",
                  right: billingCycle === "yearly" ? "4px" : "auto",
                  boxShadow: billingCycle === "yearly" ? `0 0 8px ${BRAND}` : "none",
                }}
              />
            </button>
            <button
              onClick={() => setBillingCycle("yearly")}
              className={cn(
                "inline-flex cursor-pointer items-center gap-2 transition-colors duration-200",
                billingCycle === "yearly" ? "text-white" : "text-white/50 hover:text-white"
              )}
            >
              Annual
              <span
                className={cn(
                  "rounded-full border border-white/[0.12] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]",
                  MONO
                )}
                style={{
                  color: BRAND,
                  borderColor: "rgba(0,149,255,0.35)",
                  background: "rgba(0,149,255,0.08)",
                }}
              >
                Save 20%
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* Main Content - Nav + Pricing */}
      <section className="relative z-10 mx-auto w-full max-w-[75%] px-[clamp(24px,3vw,80px)] pb-16 md:pb-24">
        <div className="flex flex-col gap-10 lg:flex-row lg:gap-14">
          {/* Left — category nav */}
          <aside className="shrink-0 lg:w-60">
            <div className="lg:sticky lg:top-24">
              <p
                className={cn(
                  "mb-3 px-3 text-[10px] uppercase tracking-[0.2em] text-white/35",
                  MONO
                )}
              >
                Services
              </p>
              <div className="space-y-1">
                {categories.map((category) => {
                  const isActive = activeCategory === category.id;
                  return (
                    <button
                      key={category.id}
                      onClick={() => handleCategoryClick(category.id)}
                      className={cn(
                        "group flex w-full cursor-pointer items-center gap-2.5 rounded-[6px] px-3 py-2 text-left text-sm font-medium transition-all duration-200",
                        isActive
                          ? "bg-white text-black"
                          : "text-white/55 hover:bg-white/[0.04] hover:text-white"
                      )}
                    >
                      <CategoryIcon
                        slug={category.id}
                        strokeWidth={1.75}
                        className={cn(
                          "h-[18px] w-[18px] shrink-0 transition-colors",
                          isActive ? "text-black" : "text-white/45 group-hover:text-[#0095FF]"
                        )}
                      />
                      <span className="truncate">{category.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>

          <div className="flex-1 space-y-12">
            {categories.map((category, index) => (
              <div
                key={category.id}
                id={category.id}
                className={cn("scroll-mt-24", index > 0 && "pt-12")}
              >
                {index > 0 && (
                  <div
                    aria-hidden="true"
                    className="mb-12 h-px w-full bg-gradient-to-r from-transparent via-white/12 to-transparent"
                  />
                )}
                <PricingContent category={category} billingCycle={billingCycle} />
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
