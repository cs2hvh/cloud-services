"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Check } from "lucide-react";

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
}

const FALLBACK_PLANS: Plan[] = [
  {
    name: "Free",
    description: "For side projects and early-stage app deployments.",
    monthly: 0,
    yearly: 0,
    cta: "Get Started",
    featured: false,
    features: [
      "1 app",
      "Shared CPU",
      "512 MB RAM",
      "Auto SSL",
      "Community support",
    ],
  },
  {
    name: "Pro",
    description: "For production workloads and scaling teams.",
    monthly: 20,
    yearly: 16,
    cta: "Get Started",
    featured: true,
    features: [
      "Unlimited apps",
      "Dedicated resources",
      "Custom domains",
      "Preview deployments",
      "Auto scaling",
      "Priority support",
      "API access",
    ],
  },
  {
    name: "Enterprise",
    description: "For regulated environments and large organizations.",
    monthly: 0,
    yearly: 0,
    cta: "Contact Us",
    featured: false,
    isCustom: true,
    features: [
      "Everything in Pro",
      "Private networking",
      "SSO / SAML",
      "Compliance controls",
      "Dedicated support",
    ],
  },
];

const UNIVERSAL_FEATURES = [
  "Global edge delivery",
  "Zero-downtime deploys",
  "Automatic SSL",
  "Built-in logs",
  "Role-based access",
  "Usage analytics",
];

interface AppDeployPricingSectionProps {
  plans?: Plan[];
}

function formatPlanPrice(plan: Plan, cycle: Cycle) {
  if (plan.isCustom) return null;
  return cycle === "monthly" ? plan.monthly : plan.yearly;
}

export default function AppDeployPricingSection({
  plans = FALLBACK_PLANS,
}: AppDeployPricingSectionProps) {
  const [cycle, setCycle] = useState<Cycle>("monthly");

  const pricingPlans = useMemo(() => {
    if (!plans?.length) return FALLBACK_PLANS;
    return plans.slice(0, 3);
  }, [plans]);

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
                App Deployment Pricing
              </span>
              <h2 className="mt-5 text-3xl font-[400] leading-[1.03] tracking-tight text-white sm:text-4xl lg:text-[4rem]">
                Plans for every
                <span className="block text-[#8ecaff]">deployment stage</span>
              </h2>
            </div>

            <div className="flex flex-col gap-4 lg:items-end">
              <p className="max-w-md text-sm leading-7 text-white/52 lg:text-[15px] lg:text-right">
                Start free, upgrade when you need more scale and control.
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

          <div className="mt-12 grid gap-4 xl:grid-cols-3">
            {pricingPlans.map((plan, index) => {
              const isFeatured = plan.featured || index === 1;
              const price = formatPlanPrice(plan, cycle);

              return (
                <article
                  key={plan.name}
                  className={`group relative flex min-h-[100%] flex-col overflow-hidden border p-6 transition-all duration-300 ${
                    isFeatured
                      ? "border-[#0095FF]/40 bg-[linear-gradient(180deg,rgba(0,149,255,0.09),rgba(255,255,255,0.018))] shadow-[0_18px_42px_rgba(0,0,0,0.4)]"
                      : "border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.018))] hover:border-white/[0.14] hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] hover:shadow-[0_24px_60px_rgba(0,0,0,0.38)]"
                  }`}
                >
                  <div
                    className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                    style={{
                      background:
                        "radial-gradient(circle at top right, rgba(142,202,255,0.22), transparent 30%)",
                    }}
                  />
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#8ecaff] to-transparent" />

                  <div className="relative">
                    <h3 className="text-[24px] font-medium tracking-tight text-white">
                      {plan.name}
                    </h3>
                    <p className="mt-3 text-[13px] leading-6 text-white/60">
                      {plan.description}
                    </p>
                  </div>

                  <div className="relative mt-6 border-t border-white/[0.08] pt-5">
                    {plan.isCustom ? (
                      <div className="text-[42px] font-[500] tracking-tight text-white">
                        Custom
                      </div>
                    ) : (
                      <div className="flex items-end gap-2">
                        <span className="text-[42px] font-[500] leading-none tracking-tight text-white">
                          ${price}
                        </span>
                        <span className="mb-1 text-[12px] text-white/36">/mo</span>
                        {isFeatured && cycle === "yearly" && (
                          <span className="mb-1 rounded-full bg-[#0095FF] px-2 py-0.5 text-[10px] font-semibold text-white">
                            -20%
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="relative mt-6">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/34">
                      What&apos;s included
                    </p>
                    <ul className="mt-4 grid gap-3">
                      {plan.features.map((feature) => (
                        <li
                          key={feature}
                          className="flex items-start gap-2 text-[13px] text-white/66"
                        >
                          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#8ecaff]" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="relative mt-8">
                    {plan.isCustom ? (
                      <a
                        href="/contact"
                        className="inline-flex h-11 w-full items-center justify-center gap-2 border border-[#0095FF]/30 bg-[#0d2238] text-[13px] font-medium text-white transition-colors duration-200 hover:bg-[#123050]"
                      >
                        {plan.cta}
                        <ArrowRight className="h-4 w-4" />
                      </a>
                    ) : (
                      <AuthAwareServiceCta
                        service="app-deployment"
                        intent="main"
                        className="inline-flex h-11 w-full items-center justify-center gap-2 border border-[#0095FF]/30 bg-[#0d2238] text-[13px] font-medium text-white transition-colors duration-200 hover:bg-[#123050]"
                      >
                        {plan.cta}
                        <ArrowRight className="h-4 w-4" />
                      </AuthAwareServiceCta>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          <div className="mt-8 border border-white/[0.08] bg-white/[0.02] p-5 sm:p-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/36">
                  Included with every app plan
                </div>
                <p className="mt-2 text-[13px] leading-6 text-white/52">
                  Every tier includes a managed deployment baseline so teams can
                  choose by scale and support requirements.
                </p>
              </div>
              <div className="text-[12px] text-white/34">
                Free to launch, predictable to scale.
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

