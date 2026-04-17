"use client";

import { useState } from "react";
import { Check, ArrowRight } from "lucide-react";
import { Container } from "@/components/ui/container";
import { AuthAwareServiceCta } from "@/components/services/auth-aware-service-cta";

type Cycle = "monthly" | "yearly";

interface Plan {
  name: string;
  description: string;
  monthly: number;
  yearly: number;
  cta: string;
  featured: boolean;
  isCustom?: boolean;
  features: string[];
  highlighted?: boolean;
}

const FALLBACK_PLANS: Plan[] = [
  {
    name: "Starter",
    description: "For hobby projects and experiments.",
    monthly: 0,
    yearly: 0,
    cta: "Start Free",
    featured: false,
    features: [
      "3 apps",
      "512 MB RAM / app",
      "Shared CPU",
      "Auto SSL",
      "100 GB bandwidth",
      "Community support",
    ],
  },
  {
    name: "Pro",
    description: "For production apps and growing teams.",
    monthly: 20,
    yearly: 16,
    cta: "Get Started",
    featured: true,
    features: [
      "Unlimited apps",
      "Up to 8 GB RAM / app",
      "Dedicated CPU",
      "Custom domains",
      "1 TB bandwidth",
      "Auto-scaling",
      "Preview deployments",
      "Priority support",
    ],
  },
  {
    name: "Enterprise",
    description: "For teams that need security and compliance.",
    monthly: 0,
    yearly: 0,
    cta: "Contact Sales",
    featured: false,
    isCustom: true,
    features: [
      "Everything in Pro",
      "Dedicated infrastructure",
      "SSO / SAML",
      "SOC 2 compliance",
      "99.99% SLA",
      "Custom contracts",
      "Dedicated support engineer",
      "Audit logs",
    ],
  },
];

interface AppDeployPricingSectionProps {
  plans?: Plan[];
}

export default function AppDeployPricingSection({ plans = FALLBACK_PLANS }: AppDeployPricingSectionProps) {
  const [cycle, setCycle] = useState<Cycle>("monthly");

  return (
    <section className="relative w-full bg-black py-16 lg:py-24 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage:
              "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black via-transparent via-50% to-black" />
      </div>

      <Container>
        {/* Header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-[400] tracking-tight leading-[1.1] text-white">
            Simple,{" "}
            <span className="text-[#0095FF]">Predictable Pricing</span>
          </h2>
          <p className="mt-4 text-sm lg:text-base leading-[1.7] text-white/50 max-w-xl mx-auto">
            Start free, scale as you grow. No surprise bills, no hidden fees.
          </p>

          {/* Billing toggle */}
          <div className="mt-8 inline-flex items-center border border-white/[0.08] bg-white/[0.03] p-1">
            {(["monthly", "yearly"] as const).map((c) => (
              <button
                key={c}
                onClick={() => setCycle(c)}
                className={`cursor-pointer px-5 py-1.5 text-[13px] font-medium transition-all duration-200 ${
                  cycle === c
                    ? "bg-white text-black"
                    : "text-white/40 hover:text-white/70"
                }`}
              >
                {c === "monthly" ? "Monthly" : "Yearly"}
                {c === "yearly" && (
                  <span className="ml-1.5 text-[11px] text-[#0095FF] font-medium">
                    Save 20%
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-px bg-white/[0.06] border border-white/[0.06]">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative bg-[#0a0a0a] p-8 lg:p-10 flex flex-col ${
                plan.featured ? "lg:border-x lg:border-[#0095FF]/30" : ""
              }`}
            >
              {/* Featured badge */}
              {plan.highlighted && (
                <div className="absolute top-0 left-0 right-0 h-px bg-[#0095FF]" />
              )}

              {/* Plan name + description */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-[18px] font-[500] text-white">
                    {plan.name}
                  </h3>
                  {plan.highlighted && (
                    <span className="text-[10px] font-medium text-[#0095FF] bg-[#0095FF]/[0.1] px-2 py-0.5 uppercase tracking-wider">
                      Popular
                    </span>
                  )}
                </div>
                <p className="text-[13px] text-white/40 leading-[1.6]">
                  {plan.description}
                </p>
              </div>

              {/* Price */}
              <div className="mb-8">
                {plan.isCustom ? (
                  <span className="text-[36px] font-[600] text-white tracking-tight">
                    Custom
                  </span>
                ) : (
                  <div className="flex items-baseline gap-1">
                    <span className="text-[36px] font-[600] text-white tabular-nums tracking-tight">
                      ${cycle === "monthly" ? plan.monthly : plan.yearly}
                    </span>
                    <span className="text-[13px] text-white/30">/mo</span>
                  </div>
                )}
              </div>

              {/* CTA */}
              {plan.isCustom ? (
                <a
                  href="/contact"
                  className={`cursor-pointer inline-flex items-center justify-center gap-2 h-10 text-[13px] font-medium transition-colors duration-200 mb-8 ${
                    plan.featured
                      ? "bg-[#0095FF] text-white hover:bg-[#0080dd]"
                      : "border border-white/[0.12] bg-white/[0.04] text-white/80 hover:bg-white/[0.08] hover:text-white"
                  }`}
                >
                  {plan.cta}
                  <ArrowRight className="w-3.5 h-3.5" />
                </a>
              ) : (
                <AuthAwareServiceCta
                  service="app-deployment"
                  intent="main"
                  className={`cursor-pointer inline-flex items-center justify-center gap-2 h-10 text-[13px] font-medium transition-colors duration-200 mb-8 ${
                    plan.featured
                      ? "bg-[#0095FF] text-white hover:bg-[#0080dd]"
                      : "border border-white/[0.12] bg-white/[0.04] text-white/80 hover:bg-white/[0.08] hover:text-white"
                  }`}
                >
                  {plan.cta}
                  <ArrowRight className="w-3.5 h-3.5" />
                </AuthAwareServiceCta>
              )}

              {/* Divider */}
              <div className="border-t border-white/[0.06] pt-6">
                <p className="text-[11px] font-medium text-white/25 uppercase tracking-wider mb-4">
                  {plan.isCustom ? "Everything in Pro, plus" : "Includes"}
                </p>
                <ul className="space-y-3">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-center gap-3 text-[13px] text-white/55"
                    >
                      <Check className="w-3.5 h-3.5 text-[#0095FF]/70 shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom note */}
        <div className="mt-6 text-center">
          <p className="text-[13px] text-white/30">
            All plans include automatic SSL, DDoS protection, and global CDN.
            No credit card required to start.
          </p>
        </div>
      </Container>
    </section>
  );
}
