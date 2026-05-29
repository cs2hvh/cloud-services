import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { ServiceCategory, PricingTier } from "@/lib/supabase/queries/pricing";

import { NvidiaLogo } from "@/components/branding/nvidia-logo";

type FilterTab = {
  value: string;
  label: string;
  nvidia?: boolean;
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
  { value: "h200", label: "H200", nvidia: true },
  { value: "h100", label: "H100", nvidia: true },
  { value: "l4os", label: "L4OS", nvidia: true },
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
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/40">{label}</p>
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const isActive = tab.value === activeValue;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => onChange(tab.value)}
              className={cn(
                "cursor-pointer inline-flex items-center gap-1.5 border px-3 py-1.5 text-[11px] font-medium transition-colors",
                isActive
                  ? "border-[#0095FF] bg-[#0095FF] text-white"
                  : "border-white/[0.12] bg-white/[0.02] text-white/65 hover:border-white/45 hover:text-white"
              )}
            >
              {tab.nvidia && (
                <NvidiaLogo width={14} height={10} className={cn("opacity-95", isActive && "brightness-0 invert")} />
              )}
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}



type ParsedSpecs = {
  vcpu?: string;
  memory?: string;
  storage?: string;
  network?: string;
};

type TableColumn = {
  key: string;
  header: string;
  align?: "left" | "right";
  render: (tier: PricingTier) => ReactNode;
};

function formatSizeToken(value?: string | null): string | undefined {
  if (!value) return undefined;
  const match = value.match(/(\d+(?:\.\d+)?)\s*(gb|tb|mb)/i);
  if (!match) return undefined;
  return `${match[1]} ${match[2].toUpperCase()}`;
}

function classifySpec(spec: string): "vcpu" | "memory" | "storage" | "network" | "other" {
  const low = spec.toLowerCase();
  if (/v?cpu|core/.test(low)) return "vcpu";
  if (/ddr|ram|memory/.test(low)) return "memory";
  if (/nvme|ssd|hdd|disk|storage/.test(low)) return "storage";
  if (/gbit|gbps|mbit|mbps|fabric|network|gb\/s/.test(low)) return "network";
  return "other";
}

function parseSpecs(tier: PricingTier): ParsedSpecs {
  const result: ParsedSpecs = {};

  for (const spec of tier.specs ?? []) {
    switch (classifySpec(spec)) {
      case "vcpu": {
        const match = spec.match(/(\d+)/);
        result.vcpu = match ? match[1] : spec.trim();
        break;
      }
      case "memory":
        result.memory = formatSizeToken(spec) ?? spec.trim();
        break;
      case "storage":
        result.storage = formatSizeToken(spec) ?? spec.trim();
        break;
      case "network":
        result.network = spec.trim();
        break;
    }
  }

  // Database/Kubernetes plans keep capacity inside features, e.g. "80GB storage".
  if (!result.storage) {
    const storageFeature = (tier.features ?? []).find((feature) => /storage|disk/i.test(feature));
    result.storage = formatSizeToken(storageFeature);
  }

  return result;
}

function getGpuModel(tier: PricingTier): string | undefined {
  if (tier.machineType) return tier.machineType.toUpperCase();
  for (const feature of tier.features ?? []) {
    const match = feature.match(/nvidia\s+([a-z0-9]+)/i);
    if (match) return match[1].toUpperCase();
  }
  return undefined;
}

function getDatabaseEngineLabel(tier: PricingTier): string | undefined {
  const type = normalizeDatabaseType(tier.subType || tier.name);
  if (type === "mysql") return "MySQL";
  if (type === "mongodb") return "MongoDB";
  if (type === "postgres") return "PostgreSQL";
  return undefined;
}

function getCpuTypeDisplay(tier: PricingTier): string | undefined {
  const normalized = normalizeCpuType(tier.cpuType || tier.machineType || tier.name);
  return normalized ? formatCpuTypeLabel(normalized) : undefined;
}

type PricingContentProps = {
  category?: ServiceCategory;
  billingCycle: "monthly" | "yearly";
};

export function PricingContent({
  category,
  billingCycle,
}: PricingContentProps) {
  const [databaseTypeFilter, setDatabaseTypeFilter] = useState("all");
  const [cpuTypeFilter, setCpuTypeFilter] = useState("all");
  // Kubernetes is priced per node; the user picks worker nodes and we always
  // add 1 control plane on top of that (1 worker selected => 2 billable nodes).
  const [workerNodes, setWorkerNodes] = useState(1);

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

  const formatPrice = (value: number) =>
    Number.isInteger(value) ? value.toString() : value.toFixed(2);

  const formatHourly = (monthly: number) => {
    const hourly = monthly / 720;
    if (hourly === 0) return "0";
    return hourly < 1 ? hourly.toFixed(3) : hourly.toFixed(2);
  };

  // Control plane is billed alongside the selected workers.
  const billableNodes = workerNodes + 1;
  const nodeMultiplier = isKubernetesCategory ? billableNodes : 1;

  const getEffectiveMonthly = (tier: PricingTier) =>
    (billingCycle === "monthly" ? tier.price.monthly : tier.price.yearly / 12) * nodeMultiplier;

  const getTierId = (tier: PricingTier) =>
    tier.id ?? tier.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

  const renderValue = (value?: string): ReactNode =>
    value ? value : <span className="text-white/30">—</span>;

  const planColumn: TableColumn = {
    key: "plan",
    header: "Plan",
    render: (tier) => (
      <div className="min-w-[160px]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-white">{tier.name}</span>
          {tier.isFeatured && (
            <span className="rounded-full bg-[#0095FF] px-2 py-0.5 text-[10px] font-semibold text-white">
              Most popular
            </span>
          )}
        </div>
        {tier.shortDescription && (
          <p className="mt-1 max-w-xs text-xs text-white/50">{tier.shortDescription}</p>
        )}
      </div>
    ),
  };

  const featuresColumn: TableColumn = {
    key: "features",
    header: "Features",
    render: (tier) => (
      <div className="flex max-w-md flex-wrap gap-x-4 gap-y-1">
        {tier.features.map((feature) => (
          <span key={feature} className="flex items-center gap-1.5 text-xs text-white/70">
            <Check className="h-3 w-3 shrink-0 text-white/60" />
            {feature}
          </span>
        ))}
      </div>
    ),
  };

  const specColumn = (
    key: string,
    header: string,
    accessor: (parsed: ParsedSpecs) => string | undefined
  ): TableColumn => ({
    key,
    header,
    render: (tier) => renderValue(accessor(parseSpecs(tier))),
  });

  const vcpuColumn = specColumn("vcpu", "vCPU", (parsed) => parsed.vcpu);
  const memoryColumn = specColumn("memory", "Memory", (parsed) => parsed.memory);
  const storageColumn = specColumn("storage", "Storage", (parsed) => parsed.storage);
  const networkColumn = specColumn("network", "Network", (parsed) => parsed.network);

  const gpuColumn: TableColumn = {
    key: "gpu",
    header: "GPU",
    render: (tier) => renderValue(getGpuModel(tier)),
  };

  const engineColumn: TableColumn = {
    key: "engine",
    header: "Engine",
    render: (tier) => renderValue(getDatabaseEngineLabel(tier)),
  };

  const cpuTypeColumn: TableColumn = {
    key: "cpu-type",
    header: "CPU Type",
    render: (tier) => renderValue(getCpuTypeDisplay(tier)),
  };

  const hourlyColumn: TableColumn = {
    key: "hourly",
    header: "$/hr",
    align: "right",
    render: (tier) => (
      <span className="text-sm text-white/80">${formatHourly(getEffectiveMonthly(tier))}</span>
    ),
  };

  const monthlyColumn: TableColumn = {
    key: "monthly",
    header: "$/month",
    align: "right",
    render: (tier) => (
      <div>
        <div className="text-base font-semibold text-white">
          ${formatPrice(getEffectiveMonthly(tier))}
        </div>
        <div className="text-[10px] text-white/40">
          {isKubernetesCategory && `${billableNodes} nodes · `}
          {billingCycle === "monthly" ? "billed monthly" : "billed yearly"}
        </div>
      </div>
    ),
  };

  const ctaColumn: TableColumn = {
    key: "cta",
    header: "",
    align: "right",
    render: (tier) => (
      <a
        href={tier.ctaLink}
        className="group inline-flex items-center justify-center gap-1.5 whitespace-nowrap border border-white/15 bg-white px-3 py-2 text-xs font-semibold text-black transition-colors hover:border-[#0095FF] hover:bg-[#0095FF] hover:text-white"
      >
        {tier.ctaText || tier.summary?.buttonText || "Get Started"}
      </a>
    ),
  };

  const columns: TableColumn[] = (() => {
    switch (categoryId) {
      case "compute":
        return [planColumn, vcpuColumn, memoryColumn, storageColumn, networkColumn, hourlyColumn, monthlyColumn, ctaColumn];
      case "gpu":
      case "gpu-instance":
        return [planColumn, gpuColumn, vcpuColumn, memoryColumn, storageColumn, networkColumn, hourlyColumn, monthlyColumn, ctaColumn];
      case "database":
        return [planColumn, engineColumn, cpuTypeColumn, storageColumn, hourlyColumn, monthlyColumn, ctaColumn];
      case "kubernetes":
        return [planColumn, vcpuColumn, memoryColumn, storageColumn, hourlyColumn, monthlyColumn, ctaColumn];
      default:
        return [planColumn, featuresColumn, hourlyColumn, monthlyColumn, ctaColumn];
    }
  })();

  // Featured plans surface at the top of the table.
  const orderedTiers = [...filteredTiers].sort(
    (a, b) => Number(Boolean(b.isFeatured)) - Number(Boolean(a.isFeatured))
  );

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
                className="border border-white/[0.08] bg-[radial-gradient(74.51%_74.08%_at_50%_50%,_#0c1622_0%,_#070a0f_100%)] p-5 md:p-6"
              >
                <div className="flex items-center gap-2 text-xs text-white mb-2">
                  <span className="flex h-6 items-center justify-center rounded-full bg-[#0095FF] px-3 text-[11px] font-semibold text-white">
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
          <div className="space-y-4 border border-white/[0.08] bg-white/[0.02] p-4">
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

        <div className="space-y-2">
          <h3 className="text-lg md:text-xl font-semibold">
            {"Starts at just $" + (category?.startingPriceLabel ?? "$9")}
          </h3>
          <p className="text-xs md:text-sm text-white/50">
            {category?.startingPriceDescription ??
              "Upgrade  anytime. Mix tiers across projects as your needs change."}
          </p>
        </div>

        {isKubernetesCategory && (
          <div className="flex flex-col gap-4 border border-white/[0.08] bg-white/[0.02] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/40">
                Cluster size
              </p>
              <p className="mt-1.5 text-xs text-white/55">
                1 control plane + {workerNodes} worker{workerNodes === 1 ? "" : "s"} ={" "}
                <span className="font-semibold text-white">
                  {billableNodes} billable node{billableNodes === 1 ? "" : "s"}
                </span>
              </p>
              <p className="mt-1 text-[10px] text-white/35">
                Prices below are per node × billable nodes. The control plane is always billed.
              </p>
            </div>
            <div className="inline-flex items-center self-start border border-white/15 sm:self-auto">
              <button
                type="button"
                onClick={() => setWorkerNodes((n) => Math.max(1, n - 1))}
                disabled={workerNodes <= 1}
                aria-label="Decrease worker nodes"
                className="flex h-9 w-9 cursor-pointer items-center justify-center text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="flex h-9 min-w-[3.25rem] items-center justify-center border-x border-white/15 px-3 text-sm font-semibold tabular-nums text-white">
                {workerNodes}
              </span>
              <button
                type="button"
                onClick={() => setWorkerNodes((n) => Math.min(99, n + 1))}
                disabled={workerNodes >= 99}
                aria-label="Increase worker nodes"
                className="flex h-9 w-9 cursor-pointer items-center justify-center text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {orderedTiers.length === 0 ? (
          <div className="border border-white/[0.08] bg-white/[0.02] px-5 py-4 text-sm text-white/70">
            No plans match the selected filters.
          </div>
        ) : (
          <div className="overflow-x-auto border border-white/[0.08]">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr className="border-b border-white/[0.08] bg-white/[0.02]">
                  {columns.map((column) => (
                    <th
                      key={column.key}
                      className={cn(
                        "px-4 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-white/40",
                        column.align === "right" && "text-right"
                      )}
                    >
                      {column.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orderedTiers.map((tier) => (
                  <tr
                    key={getTierId(tier)}
                    className={cn(
                      "border-b border-white/[0.06] transition-colors last:border-0 hover:bg-white/[0.02]",
                      tier.isFeatured && "bg-[#0095FF]/[0.06] hover:bg-[#0095FF]/[0.08]"
                    )}
                  >
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={cn(
                          "px-4 py-4 align-middle text-sm text-white/80",
                          column.align === "right" && "text-right"
                        )}
                      >
                        {column.render(tier)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
