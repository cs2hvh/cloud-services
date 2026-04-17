import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { ServiceCategory, PricingTier } from "@/lib/supabase/queries/pricing";

type FilterTab = {
  value: string;
  label: string;
};

const DATABASE_TYPE_TABS: FilterTab[] = [
  { value: "all", label: "All DB Types" },
  { value: "mysql", label: "MySQL" },
  { value: "mongodb", label: "MongoDB" },
  { value: "postgres", label: "PostgreSQL" },
];

const DEFAULT_CPU_TABS: FilterTab[] = [
  { value: "all", label: "All CPU Types" },
  { value: "basic", label: "Basic" },
  { value: "general-purpose", label: "General-purpose" },
  { value: "storage-optimized", label: "Storage-optimized" },
];

const GPU_CPU_TABS: FilterTab[] = [
  { value: "all", label: "All GPU Types" },
  { value: "h200", label: "H200" },
  { value: "h100", label: "H100" },
  { value: "l4os", label: "L4OS" },
];

function normalizeValue(value?: string | null): string {
  if (!value) return "";
  return value.toLowerCase().trim().replace(/[_\s]+/g, "-");
}

function normalizeDatabaseType(value?: string | null): string {
  const normalized = normalizeValue(value);
  if (!normalized) return "";
  if (normalized.includes("mysql")) return "mysql";
  if (normalized.includes("mongo")) return "mongodb";
  if (normalized.includes("postgres") || normalized === "pg") return "postgres";
  return normalized;
}

function normalizeCpuType(value?: string | null): string {
  const normalized = normalizeValue(value);
  if (!normalized) return "";
  if (normalized.includes("general")) return "general-purpose";
  if (normalized.includes("storage")) return "storage-optimized";
  if (normalized.includes("basic")) return "basic";
  return normalized;
}

function formatCpuTypeLabel(value: string): string {
  const normalized = normalizeValue(value);
  if (!normalized) return "CPU";
  return normalized
    .split("-")
    .map((part) => {
      if (part.toLowerCase() === "gpu") return "GPU";
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

function normalizeGpuType(value?: string | null): string {
  const normalized = normalizeValue(value);
  if (!normalized) return "";
  if (normalized.includes("h200")) return "h200";
  if (normalized.includes("h100")) return "h100";
  if (normalized.includes("l4os") || normalized.includes("l40s")) return "l4os";
  return normalized;
}

function FilterTabs({
  label,
  tabs,
  activeValue,
  onChange,
}: {
  label: string;
  tabs: FilterTab[];
  activeValue: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] uppercase tracking-[0.14em] text-white/40">{label}</p>
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const isActive = tab.value === activeValue;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => onChange(tab.value)}
              className={cn(
                "cursor-pointer border px-3 py-1.5 text-[11px] font-medium transition-colors",
                isActive
                  ? "border-white bg-white text-black"
                  : "border-white/20 bg-white/[0.02] text-white/65 hover:border-white/45 hover:text-white"
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}



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
  const [databaseTypeFilter, setDatabaseTypeFilter] = useState("all");
  const [cpuTypeFilter, setCpuTypeFilter] = useState("all");

  const categoryId = normalizeValue(category?.id);
  const isDatabaseCategory = categoryId === "database";
  const isKubernetesCategory = categoryId === "kubernetes";
  const isGpuCategory = categoryId === "gpu" || categoryId === "gpu-instance";

  const kubernetesCpuTabs = useMemo<FilterTab[]>(() => {
    if (!isKubernetesCategory) return DEFAULT_CPU_TABS;

    const uniqueCpuTypes = Array.from(
      new Set(
        (category?.tiers ?? [])
          .map((tier) => normalizeValue(tier.cpuType))
          .filter(Boolean)
      )
    );

    if (uniqueCpuTypes.length === 0) {
      return DEFAULT_CPU_TABS;
    }

    return [
      { value: "all", label: "All CPU Types" },
      ...uniqueCpuTypes.map((cpuType) => ({
        value: cpuType,
        label: formatCpuTypeLabel(cpuType),
      })),
    ];
  }, [category?.tiers, isKubernetesCategory]);

  useEffect(() => {
    setDatabaseTypeFilter("all");
    setCpuTypeFilter("all");
  }, [categoryId]);

  const filteredTiers = useMemo(() => {
    const tiers = category?.tiers ?? [];

    return tiers.filter((tier) => {
      if (isDatabaseCategory) {
        const dbType = normalizeDatabaseType(tier.subType || tier.name);
        const cpuType = normalizeCpuType(tier.cpuType || tier.machineType || tier.name);

        const matchesDatabaseType =
          databaseTypeFilter === "all" || dbType === normalizeDatabaseType(databaseTypeFilter);
        const matchesCpuType =
          cpuTypeFilter === "all" || cpuType === normalizeCpuType(cpuTypeFilter);

        return matchesDatabaseType && matchesCpuType;
      }

      if (isKubernetesCategory) {
        const cpuType = normalizeValue(tier.cpuType);
        if (!cpuType) return cpuTypeFilter === "all";
        return cpuTypeFilter === "all" || cpuType === normalizeValue(cpuTypeFilter);
      }

      if (isGpuCategory) {
        const gpuType = normalizeGpuType(tier.machineType || tier.cpuType || tier.subType || tier.name);
        return cpuTypeFilter === "all" || gpuType === normalizeGpuType(cpuTypeFilter);
      }

      return true;
    });
  }, [
    category?.tiers,
    cpuTypeFilter,
    databaseTypeFilter,
    isDatabaseCategory,
    isGpuCategory,
    isKubernetesCategory,
  ]);

  const featuredTier = filteredTiers.find((tier) => tier.isFeatured);
  const listTiers = filteredTiers.filter((tier) => !tier.isFeatured);

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

        {(isDatabaseCategory || isKubernetesCategory || isGpuCategory) && (
          <div className="space-y-4 border border-white/10 bg-white/[0.02] p-4">
            {isDatabaseCategory && (
              <FilterTabs
                label="Database Type"
                tabs={DATABASE_TYPE_TABS}
                activeValue={databaseTypeFilter}
                onChange={setDatabaseTypeFilter}
              />
            )}

            <FilterTabs
              label={isGpuCategory ? "GPU Type" : "CPU Type"}
              tabs={isGpuCategory ? GPU_CPU_TABS : isKubernetesCategory ? kubernetesCpuTabs : DEFAULT_CPU_TABS}
              activeValue={cpuTypeFilter}
              onChange={setCpuTypeFilter}
            />
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

        {filteredTiers.length === 0 && (
          <div className="border border-white/10 bg-white/[0.02] px-5 py-4 text-sm text-white/70">
            No plans match the selected filters.
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
