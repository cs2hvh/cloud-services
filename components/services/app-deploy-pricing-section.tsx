"use client";

import { useMemo } from "react";
import { ArrowRight } from "lucide-react";

import { Container } from "@/components/ui/container";
import { AuthAwareServiceCta } from "@/components/services/auth-aware-service-cta";

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

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

const FALLBACK_PLANS: Plan[] = [
    {
        name: "Starter",
        description: "Side projects and proofs of concept.",
        monthly: 0,
        yearly: 0,
        cta: "Start free",
        featured: false,
        features: [
            "3 apps",
            "512 MB RAM per app",
            "100 GB bandwidth / month",
            "Automatic TLS",
        ],
    },
    {
        name: "Pro",
        description: "Production apps and growing teams.",
        monthly: 25,
        yearly: 20,
        cta: "Get started",
        featured: true,
        features: [
            "Unlimited apps",
            "Up to 8 GB RAM per app",
            "Autoscaling and preview environments",
            "1 TB bandwidth / month",
        ],
    },
    {
        name: "Enterprise",
        description: "Compliance, SLAs, and dedicated capacity.",
        monthly: 0,
        yearly: 0,
        cta: "Contact sales",
        featured: false,
        isCustom: true,
        features: [
            "Everything in Pro",
            "SSO and private networking",
            "99.99% SLA",
            "SOC 2 and HIPAA ready",
        ],
    },
];

interface AppDeployPricingSectionProps {
    plans?: Plan[];
}

export default function AppDeployPricingSection({
    plans = FALLBACK_PLANS,
}: AppDeployPricingSectionProps) {
    const pricingPlans = useMemo(() => {
        if (!plans?.length) return FALLBACK_PLANS;
        return plans.slice(0, 3);
    }, [plans]);

    return (
        <section className="relative overflow-hidden bg-[#E6E4DC] py-20 text-[#1A1814] sm:py-24 lg:py-28">
            <Container>
                {/* Header */}
                <div className="mx-auto max-w-[720px] text-center">
                    <p
                        className={`${MONO} mb-5 inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-black/55`}
                    >
                        <span className="h-1.5 w-1.5 rounded-full bg-[#0095FF]" />
                        Pricing
                    </p>
                    <h2 className="text-3xl font-semibold leading-[1.05] tracking-[-0.02em] text-[#1A1814] sm:text-4xl lg:text-[46px]">
                        Three plans. Pay for what you ship.
                    </h2>
                    <p className="mx-auto mt-5 max-w-[540px] text-[15px] leading-[1.6] text-black/60 sm:text-[16px]">
                        Transparent monthly pricing with no per-seat fees and no
                        surprise build minutes.
                    </p>
                </div>

                {/* Plans */}
                <div className="mx-auto mt-12 grid max-w-[1080px] gap-4 lg:grid-cols-3 lg:gap-5">
                    {pricingPlans.map((plan) => {
                        const isFeatured = plan.featured;
                        return (
                          <article
                            key={plan.name}
                            className={`cursor-pointer relative flex flex-col rounded-[10px] border bg-[#EEECE4] p-7 transition-all duration-300 hover:bg-[#E6E2D7] hover:shadow-sm hover:-translate-y-1 ${
                              isFeatured
                                ? "border-black"
                                : "border-black/10 hover:border-black/25"
                            }`}
                          >
                            {isFeatured && (
                              <span
                                className={`${MONO} absolute -top-2.5 left-7 inline-flex items-center gap-1.5 rounded-[3px] bg-[#1A1814] px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-[#EEECE4]`}
                              >
                                <span className="h-1 w-1 rounded-full bg-[#0095FF]" />
                                Recommended
                              </span>
                            )}

                            <h3 className="text-[20px] font-semibold tracking-[-0.01em] text-[#1A1814]">
                              {plan.name}
                            </h3>

                            <p className="mt-1.5 text-[13px] leading-[1.5] text-black/60">
                              {plan.description}
                            </p>

                            <div className="mt-6 border-t border-black/10 pt-5">
                              {plan.isCustom ? (
                                <span
                                  className={`${MONO} text-[32px] font-bold leading-none tabular-nums text-[#1A1814]`}
                                >
                                  Custom
                                </span>
                              ) : (
                                <div className="flex items-end gap-1">
                                  <span
                                    className={`${MONO} text-[36px] font-bold leading-none tabular-nums text-[#1A1814]`}
                                  >
                                    ${plan.monthly}
                                  </span>
                                  <span className="mb-1 text-[12.5px] text-black/55">
                                    / month
                                  </span>
                                </div>
                              )}
                            </div>

                            <ul className="mt-6 flex-1 space-y-2.5">
                              {plan.features.map((f) => (
                                <li
                                  key={f}
                                  className="flex items-start gap-2.5 text-[13px] leading-[1.55] text-black/75"
                                >
                                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-black/45" />
                                  {f}
                                </li>
                              ))}
                            </ul>

                            <div className="mt-7">
                              {plan.isCustom ? (
                                <a
                                  href="/contact"
                                  className={`${MONO} inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-[5px] border border-black/15 bg-transparent text-[11px] font-semibold uppercase tracking-[0.14em] text-black/80 transition-colors hover:border-black/35 hover:bg-black/[0.04] hover:text-[#1A1814]`}
                                >
                                  {plan.cta}
                                  <ArrowRight className="h-3.5 w-3.5" />
                                </a>
                              ) : (
                                <AuthAwareServiceCta
                                  service="app-deployment"
                                  intent="main"
                                  className={`${MONO} inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-[5px] text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors ${
                                    isFeatured
                                      ? "border border-[#1A1814] bg-[#1A1814] text-[#EEECE4] hover:bg-black"
                                      : "border border-black/15 bg-transparent text-black/80 hover:border-black/35 hover:bg-black/[0.04] hover:text-[#1A1814]"
                                  }`}
                                >
                                  <span className="flex items-center gap-1.5">
                                    {plan.cta}
                                    <ArrowRight className="h-3.5 w-3.5" />
                                  </span>
                                </AuthAwareServiceCta>
                              )}
                            </div>
                          </article>
                        );
                    })}
                </div>

                {/* Footnote */}
                <p
                    className={`${MONO} mx-auto mt-10 max-w-[640px] text-center text-[10.5px] uppercase tracking-[0.16em] text-black/45`}
                >
                    All plans include zero-downtime deploys · Automatic TLS · Global CDN · Instant rollback
                </p>
            </Container>
        </section>
    );
}
