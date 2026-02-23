"use client";

import { useState } from "react";
import { Check, ArrowRight } from "lucide-react";
import { Container } from "@/components/ui/container";

type Cycle = "monthly" | "yearly";

const PLANS = [
  {
    name: "Starter",
    description: "For dev environments and side projects.",
    monthly: 0,
    yearly: 0,
    cta: "Start Free",
    featured: false,
    features: [
      "1 database",
      "1 GB storage",
      "Shared CPU",
      "Daily backups (7-day retention)",
      "Community support",
      "Single node",
    ],
  },
  {
    name: "Pro",
    description: "For production apps and growing teams.",
    monthly: 25,
    yearly: 20,
    cta: "Get Started",
    featured: true,
    features: [
      "Unlimited databases",
      "Up to 500 GB storage",
      "Dedicated CPU",
      "Point-in-time recovery (30 days)",
      "Read replicas",
      "Connection pooling",
      "VPC peering",
      "Priority support",
    ],
  },
  {
    name: "Enterprise",
    description: "For teams that need compliance and scale.",
    monthly: 0,
    yearly: 0,
    cta: "Contact Sales",
    featured: false,
    isCustom: true,
    features: [
      "Everything in Pro",
      "Multi-region replication",
      "SSO / SAML",
      "SOC 2 & HIPAA compliance",
      "99.999% SLA",
      "Dedicated support engineer",
      "Custom retention policies",
      "Audit logs",
    ],
  },
];

export default function DatabasePricingSection() {
  const [cycle, setCycle] = useState<Cycle>("monthly");

  return (
    <section className="relative z-10 py-16 lg:py-24">
      <div className="absolute inset-0 -z-10 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-black" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[60%] h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>

      <Container>
        {/* Header */}
        <div className="text-center mb-12 lg:mb-16">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-[400] tracking-tight leading-[1.1] text-white">
            Simple,{" "}
            <span className="text-[#0095FF]">Predictable Pricing</span>
          </h2>
          <p className="mt-4 mx-auto max-w-2xl text-sm lg:text-base leading-relaxed text-white/40">
            Start free, scale as your data grows. No surprise bills, no hidden fees.
          </p>

          {/* Billing toggle */}
          <div className="mt-6 inline-flex items-center border border-white/[0.06] bg-white/[0.02] p-1">
            {(["monthly", "yearly"] as const).map((c) => (
              <button
                key={c}
                onClick={() => setCycle(c)}
                className={`cursor-pointer px-5 py-1.5 text-[13px] font-medium transition-all duration-200 ${
                  cycle === c
                    ? "bg-white text-black"
                    : "text-white/50 hover:text-white/80"
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

        {/* Cards — compute-style grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-px bg-white/[0.06] border border-white/[0.06]">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`relative bg-[#0a0a0a] p-6 lg:p-8 flex flex-col group hover:bg-[#0d0d0d] transition-colors duration-300 ${
                plan.featured ? "bg-[#0c0c0c]" : ""
              }`}
            >
              {/* Featured indicator */}
              {plan.featured && (
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#0095FF]" />
              )}

              {/* Plan name + badge */}
              <div className="flex items-center gap-2.5 mb-2">
                <h3 className="text-[18px] font-[500] text-white">
                  {plan.name}
                </h3>
                {plan.featured && (
                  <span className="text-[10px] font-medium text-[#0095FF] bg-[#0095FF]/[0.08] border border-[#0095FF]/20 px-2 py-0.5 uppercase tracking-wider">
                    Popular
                  </span>
                )}
              </div>

              <p className="text-[13px] text-white/40 leading-[1.6] mb-6">
                {plan.description}
              </p>

              {/* Price */}
              <div className="mb-6">
                {plan.isCustom ? (
                  <span className="text-[32px] font-[600] text-white tracking-tight">
                    Custom
                  </span>
                ) : (
                  <div className="flex items-baseline gap-1">
                    <span className="text-[32px] font-[600] text-white tabular-nums tracking-tight">
                      ${cycle === "monthly" ? plan.monthly : plan.yearly}
                    </span>
                    <span className="text-[12px] text-white/25">/mo</span>
                  </div>
                )}
              </div>

              {/* CTA */}
              <a
                href={plan.isCustom ? "/contact" : "/signup"}
                className={`cursor-pointer inline-flex items-center justify-center gap-2 h-10 text-[13px] font-medium transition-colors duration-200 mb-8 ${
                  plan.featured
                    ? "bg-white text-black hover:bg-white/90"
                    : "bg-white/[0.06] text-white/80 hover:bg-white/[0.1] hover:text-white border border-white/[0.06]"
                }`}
              >
                {plan.cta}
                <ArrowRight className="w-3.5 h-3.5" />
              </a>

              {/* Divider + features */}
              <div className="border-t border-white/[0.06] pt-6">
                <p className="text-[11px] font-medium text-white/25 uppercase tracking-[0.12em] mb-4">
                  {plan.isCustom ? "Everything in Pro, plus" : "Includes"}
                </p>
                <ul className="space-y-3">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-center gap-2.5 text-[13px] text-white/55"
                    >
                      <Check className="w-3.5 h-3.5 text-[#0095FF] shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>

        {/* ── Included With Every Database ── */}
        <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {[
            "Automatic SSL",
            "Encryption at Rest",
            "DDoS Protection",
            "Daily Backups",
            "Monitoring",
            "No CC Required",
          ].map((label) => (
            <div
              key={label}
              className="flex items-center gap-2.5 border border-white/[0.06] bg-white/[0.015] px-4 py-3"
            >
              <Check className="w-3.5 h-3.5 text-[#0095FF]/70 shrink-0" />
              <span className="text-[12px] font-medium text-white/45">{label}</span>
            </div>
          ))}
        </div>

        {/* ── CTA ── */}
        <div className="mt-12 flex flex-col items-center">
          <a
            href="/signup"
            className="cursor-pointer inline-flex items-center justify-center gap-2.5 bg-white text-black px-10 h-12 text-[15px] font-[500] hover:bg-white/90 transition-colors"
          >
            Deploy Your First Database
            <ArrowRight className="w-4.5 h-4.5" />
          </a>
          <p className="mt-4 text-[13px] text-white/30">
            No credit card required &middot; Free tier included
          </p>
        </div>
      </Container>
    </section>
  );
}
