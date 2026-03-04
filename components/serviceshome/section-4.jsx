import { ArrowRight, Check } from "lucide-react";
import { Container } from "@/components/ui/container";

export default function ServicesHomeSectionFour({ plans }) {
  return (
    <section className="relative z-10 py-16 lg:py-24 bg-transparent">
      {/* Background */}
      <div className="absolute inset-0 -z-10 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-black" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[60%] h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>

      <Container>
        {/* Header */}
        <div className="text-center mb-12 lg:mb-16">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-[400] tracking-tight leading-tight text-white">
            Choose Your Perfect{" "}
            <span className="text-[#0095FF]">Plan</span>
          </h2>
          <p className="mt-3 lg:mt-4 mx-auto max-w-2xl text-xs sm:text-sm leading-relaxed text-white/50">
            Transparent pricing with no hidden fees. Scale resources up or down as your needs change.
          </p>
        </div>

        {/* Cards */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan, index) => {
            const isFeatured = index === 1;

            return (
              <article
                key={plan.title}
                className={`relative flex flex-col p-8 lg:p-10 border transition-colors duration-300 ${
                  isFeatured
                    ? "border-[#0095FF]/30 bg-[#0095FF]/[0.03]"
                    : "border-white/[0.08] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.03]"
                }`}
              >
                {/* Featured indicator */}
                {isFeatured && (
                  <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#0095FF] to-transparent" />
                )}

                {/* Badge */}
                {plan.badge && (
                  <div className={`inline-flex self-start items-center gap-2 px-3 py-1 mb-6 text-[11px] font-medium uppercase tracking-widest ${
                    isFeatured
                      ? "bg-[#0095FF]/10 text-[#0095FF] border border-[#0095FF]/20"
                      : "bg-white/[0.04] text-white/40 border border-white/[0.08]"
                  }`}>
                    {isFeatured && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#0095FF] animate-pulse" />
                    )}
                    {plan.badge}
                  </div>
                )}

                {/* Title & Description */}
                <h3 className="text-xl lg:text-2xl font-[500] tracking-tight text-white">
                  {plan.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-white/40">
                  {plan.description}
                </p>

                {/* Features */}
                <ul className="mt-8 space-y-3 flex-1">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <Check className={`w-4 h-4 mt-0.5 shrink-0 ${
                        isFeatured ? "text-[#0095FF]" : "text-white/30"
                      }`} />
                      <span className="text-[13px] leading-relaxed text-white/60">{feature}</span>
                    </li>
                  ))}
                </ul>

                {/* Button */}
                <button
                  type="button"
                  className={`mt-10 inline-flex items-center justify-center gap-2 w-full h-10 text-[13px] font-medium transition-colors duration-200 ${
                    isFeatured
                      ? "bg-white text-black hover:bg-white/90"
                      : "border border-white/[0.12] bg-white/[0.04] text-white/80 hover:bg-white/[0.08] hover:text-white"
                  }`}
                >
                  Choose Plan
                  <ArrowRight className="w-4 h-4" />
                </button>
              </article>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
