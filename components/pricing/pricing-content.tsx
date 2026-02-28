import type { Dispatch, SetStateAction } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type PricingTier = {
  id?: string;
  name: string;
  shortDescription?: string;
  badge?: string;
  price: {
    monthly: number;
    yearly: number;
  };
  billingPeriod?: string;
  specs?: string[];
  features: string[];
  summary?: {
    billing: string;
    support: string;
    provisioning: string;
    guarantee: string;
    buttonText: string;
  };
  highlighted?: boolean;
  isFeatured?: boolean;
  ctaText: string;
  ctaLink: string;
};

type PricingPromo = {
  badge: string;
  badgeNote?: string;
  title: string;
  description: string;
  subtext?: string;
  priceOld?: string;
  priceCurrent?: string;
  linkText: string;
  linkHref: string;
};

export type ServiceCategory = {
  id: string;
  label: string;
  description?: string;
  startingPriceLabel?: string;
  startingPriceDescription?: string;
  promos?: PricingPromo[];
  tiers: PricingTier[];
};

type PricingContentProps = {
  category?: ServiceCategory;
  billingCycle: "monthly" | "yearly";
  expandedTierId: string;
  setExpandedTierId: Dispatch<SetStateAction<string>>;
};

export function PricingContent({
  category,
  billingCycle,
  expandedTierId,
  setExpandedTierId,
}: PricingContentProps) {
  const featuredTier = category?.tiers.find((tier) => tier.isFeatured);
  const listTiers = category?.tiers.filter((tier) => !tier.isFeatured) ?? [];

  const formatPrice = (value: number) =>
    Number.isInteger(value) ? value.toString() : value.toFixed(2);

  const getTierId = (tier: PricingTier) =>
    tier.id ?? tier.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

  return (
    <div className="flex-1">
      <div className="space-y-8">
        <div className="space-y-2">
          <h2 className="text-2xl md:text-3xl font-semibold">
            {category?.label}
          </h2>
          <p className="text-sm md:text-base text-white/50 max-w-2xl">
            {category?.description}
          </p>
        </div>

        {category?.promos && category.promos.length > 0 && (
          <div className="space-y-3">
            {category.promos.map((promo) => (
              <div
                key={promo.title}
                className="border border-white/10 bg-[radial-gradient(74.51%_74.08%_at_50%_50%,_#303030_0%,_#0D0D0D_100%)] p-5 md:p-6"
              >
                <div className="flex items-center gap-2 text-xs text-white mb-2">
                  <span className="flex h-6 w-[90px] items-center justify-center rounded-full bg-white text-[11px] font-semibold text-black">
                    {promo.badge}
                  </span>
                  {promo.badgeNote && <span>{promo.badgeNote}</span>}
                </div>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <h3 className="text-base md:text-lg font-semibold text-white">
                      {promo.title}
                    </h3>
                    <p className="text-xs md:text-sm text-white">
                      {promo.description}
                    </p>
                    {promo.subtext && (
                      <p className="text-xs text-white mt-1">
                        {promo.subtext}
                      </p>
                    )}
                  </div>
                  {promo.priceCurrent ? (
                    <div className="flex items-center gap-2 text-sm font-semibold text-white">
                      {promo.priceOld && (
                        <span className="text-white/40 line-through text-xs">
                          {promo.priceOld}
                        </span>
                      )}
                      <span>{promo.priceCurrent}</span>
                    </div>
                  ) : (
                    <a
                      href={promo.linkHref}
                      className="text-xs md:text-sm text-white underline underline-offset-4"
                    >
                      {promo.linkText}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {featuredTier && (
          <div className="space-y-3">
            <p className="text-sm text-white/60">Most popular Startups</p>
            <h3 className="text-xl md:text-2xl font-semibold">{featuredTier.name}</h3>
            {/* featured -tier box */}
            <div className="border border-white/10 bg-[radial-gradient(74.51%_74.08%_at_50%_50%,_#303030_0%,_#0D0D0D_100%)] p-6 md:p-8">
              <div className="flex flex-col lg:flex-row gap-8">
                <div className="flex-1 space-y-4">
                  {featuredTier.shortDescription && (
                    <p className="text-sm text-white/60 max-w-xl">
                      {featuredTier.shortDescription}
                    </p>
                  )}
                  {featuredTier.specs && featuredTier.specs.length > 0 && (
                    <div className="flex flex-wrap items-center gap-3 text-xs text-white/60">
                      {featuredTier.specs.map((spec, idx) => (
                        <span key={spec} className="flex items-center">
                          {spec}
                          {idx < featuredTier.specs!.length - 1 && (
                            <span className="mx-3 h-3 w-px bg-white/20" />
                          )}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs text-white/70">
                    {featuredTier.features.map((feature) => (
                      <div key={feature} className="flex items-start gap-2">
                        <Check className="w-3.5 h-3.5 text-white/70 mt-0.5 shrink-0" />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="lg:w-64 shrink-0">
                  <div className="border border-white/15 bg-black/30 p-4 text-xs text-white/70">
                    <div className="flex items-baseline justify-between mb-3">
                      <span className="text-base text-white">{featuredTier.name}</span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span>Billing</span>
                        <span className="text-white">{featuredTier.summary?.billing || "Monthly/Yearly"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Support</span>
                        <span className="text-white">{featuredTier.summary?.support || "Standard"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Provisioning</span>
                        <span className="text-white">{featuredTier.summary?.provisioning || "Instant"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Guarantee</span>
                        <span className="text-white">{featuredTier.summary?.guarantee || "60 days"}</span>
                      </div>
                    </div>
                    <button className="mt-4 w-full bg-white/10 hover:bg-white/15 text-white text-xs py-2">
                      {featuredTier.summary?.buttonText}
                    </button>
                    <p className="mt-2 text-[10px] text-white/40">
                      Cancel anytime • Upgrade/downgrade instantly
                    </p>
                  </div>
                  <div className="mt-4 text-right">
                    <div className="text-2xl font-semibold">
                      ${formatPrice(
                        billingCycle === "monthly"
                          ? featuredTier.price.monthly
                          : featuredTier.price.monthly * 12
                      )}
                    </div>
                    <div className="text-xs text-white/50">
                      {billingCycle === "monthly"
                        ? "per month billed monthly"
                        : "per month billed yearly"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <h3 className="text-lg md:text-xl font-semibold">
            {"Starts at just $" + (category?.startingPriceLabel ?? "$9")}
          </h3>
          <p className="text-xs md:text-sm text-white/50">
            {category?.startingPriceDescription ??
              "Upgrade  anytime. Mix tiers across projects as your needs change."}
          </p>
        </div>

        <div className="space-y-3">
          {listTiers.map((tier) => {
            const tierId = getTierId(tier);
            const isOpen = expandedTierId === tierId;
            const priceValue =
              billingCycle === "monthly"
                ? tier.price.monthly
                : tier.price.yearly / 12;

            return (
              <div key={tierId} className="border border-white/10 bg-white/[0.02]">
                <button
                  onClick={() =>
                    setExpandedTierId((prev) => (prev === tierId ? "" : tierId))
                  }
                  className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
                >
                  <div>
                    <p className="text-sm font-semibold text-white">{tier.name}</p>
                    {tier.shortDescription && (
                      <p className="text-xs text-white/50">{tier.shortDescription}</p>
                    )}
                    {tier.specs && tier.specs.length > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-white/50">
                        {tier.specs.map((spec, idx) => (
                          <span key={spec} className="flex items-center">
                            {spec}
                            {idx < tier.specs!.length - 1 && (
                              <span className="mx-2 h-3 w-px bg-white/20" />
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-lg font-semibold">
                        ${formatPrice(priceValue)}
                      </div>
                      <div className="text-[10px] text-white/50">
                        {billingCycle === "monthly"
                          ? "per month billed monthly"
                          : "per month billed yearly"}
                      </div>
                    </div>
                    <ChevronDown
                      className={cn(
                        "w-4 h-4 text-white/60 transition-transform duration-200",
                        isOpen && "rotate-180"
                      )}
                    />
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-white/10 px-5 py-5">
                    <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_0.7fr] gap-6">
                      <div className="space-y-4">
                        {tier.specs && tier.specs.length > 0 && (
                          <div className="flex flex-wrap items-center gap-3 text-xs text-white/60">
                            {tier.specs.map((spec, idx) => (
                              <span key={spec} className="flex items-center">
                                {spec}
                                {idx < tier.specs!.length - 1 && (
                                  <span className="mx-3 h-3 w-px bg-white/20" />
                                )}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs text-white/70">
                          {tier.features.map((feature) => (
                            <div key={feature} className="flex items-start gap-2">
                              <Check className="w-3.5 h-3.5 text-white/70 mt-0.5 shrink-0" />
                              <span>{feature}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      {tier.summary && (
                        <div className="border border-white/15 bg-black/30 p-4 text-xs text-white/70">
                          <div className="flex items-baseline justify-between mb-3">
                            <span className="text-base text-white">{tier.name}</span>
                          </div>
                          <div className="space-y-1">
                            <div className="flex justify-between">
                              <span>Billing</span>
                              <span className="text-white">{tier?.summary?.billing||"Monthly/Yearly"}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Support</span>
                              <span className="text-white">{tier?.summary?.support||"Standard"}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Provisioning</span>
                              <span className="text-white">{tier.summary.provisioning||"Instant"}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Guarantee</span>
                              <span className="text-white">{tier.summary.guarantee||"60 days"}</span>
                            </div>
                          </div>
                          <button className="mt-4 w-full bg-white/10 hover:bg-white/15 text-white text-xs py-2">
                            {tier.summary.buttonText}
                          </button>
                          <p className="mt-2 text-[10px] text-white/40">
                            Cancel anytime • Upgrade/downgrade instantly
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
