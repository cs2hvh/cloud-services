import Image from "next/image";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, Cpu, Gauge, HardDrive, Layers, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ServiceCategory, PricingTier } from "@/lib/supabase/queries/pricing";

import { NvidiaLogo } from "@/components/branding/nvidia-logo";
import { ServiceMark } from "@/components/branding/service-mark";
import { CategoryIcon, DB_ENGINE_LOGOS } from "@/components/pricing/pricing-icons";

const BRAND = "#0095FF";
const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

type FilterTab = {
  value: string;
  label: string;
  nvidia?: boolean;
  icon?: LucideIcon;
  image?: string;
};

const DATABASE_TYPE_TABS: FilterTab[] = [
  { value: "all", label: "All DB Types", icon: Layers },
  { value: "mysql", label: "MySQL", image: DB_ENGINE_LOGOS.mysql.src },
  { value: "mongodb", label: "MongoDB", image: DB_ENGINE_LOGOS.mongodb.src },
  { value: "postgres", label: "PostgreSQL", image: DB_ENGINE_LOGOS.postgres.src },
];

const DEFAULT_CPU_TABS: FilterTab[] = [
  { value: "all", label: "All CPU Types", icon: Layers },
  { value: "basic", label: "Basic", icon: Cpu },
  { value: "general-purpose", label: "General-purpose", icon: Gauge },
  { value: "storage-optimized", label: "Storage-optimized", icon: HardDrive },
];

const GPU_CPU_TABS: FilterTab[] = [
  { value: "all", label: "All GPU Types", icon: Layers },
  { value: "h200", label: "H200", nvidia: true },
  { value: "h100", label: "H100", nvidia: true },
  { value: "l4os", label: "L4OS", nvidia: true },
];

function iconForCpuType(value: string): LucideIcon {
  const normalized = normalizeCpuType(value);
  if (normalized === "basic") return Cpu;
  if (normalized === "general-purpose") return Gauge;
  if (normalized === "storage-optimized") return HardDrive;
  return Cpu;
}

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
      <p className={cn("text-[10px] uppercase tracking-[0.18em] text-white/40", MONO)}>
        {label}
      </p>
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const isActive = tab.value === activeValue;
          const Icon = tab.icon;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => onChange(tab.value)}
              className={cn(
                "group cursor-pointer inline-flex items-center gap-1.5 rounded-[4px] border px-3 py-1.5 text-[11px] font-medium transition-all duration-200",
                isActive
                  ? "border-white bg-white text-black"
                  : "border-white/[0.12] bg-white/[0.02] text-white/65 hover:border-white/35 hover:text-white"
              )}
            >
              {tab.nvidia && (
                <NvidiaLogo
                  width={14}
                  height={10}
                  className={cn("opacity-95", isActive && "brightness-0")}
                />
              )}
              {tab.image && (
                <Image
                  src={tab.image}
                  alt={tab.label}
                  width={18}
                  height={14}
                  unoptimized
                  className="h-3.5 w-auto max-w-[22px] shrink-0 object-contain"
                />
              )}
              {Icon && (
                <Icon
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 transition-colors",
                    isActive ? "text-black" : "text-white/45 group-hover:text-white"
                  )}
                  strokeWidth={1.6}
                />
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
      { value: "all", label: "All CPU Types", icon: Layers },
      ...uniqueCpuTypes.map((cpuType) => ({
        value: cpuType,
        label: formatCpuTypeLabel(cpuType),
        icon: iconForCpuType(cpuType),
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

  const getEffectiveMonthly = (tier: PricingTier) =>
    billingCycle === "monthly" ? tier.price.monthly : tier.price.yearly / 12;

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
            <span
              className={cn(
                "inline-flex items-center rounded-[3px] border px-2 py-0.5 text-[9px] uppercase tracking-[0.14em]",
                MONO
              )}
              style={{
                color: BRAND,
                borderColor: "rgba(0,149,255,0.35)",
                background: "rgba(0,149,255,0.08)",
              }}
            >
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
  const diskColumn = specColumn("disk", "Disk", (parsed) => parsed.storage);
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

  // Security plans expose per-protocol data allowances (see attachment).
  const attributeColumn = (key: string, header: string): TableColumn => ({
    key,
    header,
    render: (tier) => {
      const value = tier.attributes?.[key];
      if (!value) return <span className="text-white/30">—</span>;
      if (value.toLowerCase() === "included" || value === "✓") {
        return <Check className="h-4 w-4" style={{ color: BRAND }} strokeWidth={2.2} />;
      }
      return <span className="text-xs leading-snug text-white/75">{value}</span>;
    },
  });

  const sshColumn = attributeColumn("ssh", "SSH");
  const minecraftColumn = attributeColumn("minecraft", "Minecraft");
  const rdpColumn = attributeColumn("rdp", "RDP");
  const otherProtocolsColumn = attributeColumn("other", "Other TCP/UDP");

  // AI Labs — open-weight models billed per million tokens.
  const modelColumn: TableColumn = {
    key: "model",
    header: "Model",
    render: (tier) => (
      <div className="min-w-[220px]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-white">{tier.name}</span>
          {tier.attributes?.openWeight && (
            <span
              className={cn(
                "inline-flex items-center rounded-[3px] border px-2 py-0.5 text-[9px] uppercase tracking-[0.14em]",
                MONO
              )}
              style={{
                color: BRAND,
                borderColor: "rgba(0,149,255,0.35)",
                background: "rgba(0,149,255,0.08)",
              }}
            >
              Open weight
            </span>
          )}
          {tier.attributes?.matryoshka && (
            <span
              className={cn(
                "inline-flex items-center rounded-[3px] border border-white/[0.12] bg-white/[0.03] px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] text-white/55",
                MONO
              )}
            >
              Matryoshka
            </span>
          )}
        </div>
        {tier.attributes?.provider && (
          <p className={cn("mt-1 text-[10px] uppercase tracking-[0.16em] text-white/40", MONO)}>
            {tier.attributes.provider}
          </p>
        )}
        {tier.shortDescription && (
          <p className="mt-1 max-w-md text-xs text-white/50">{tier.shortDescription}</p>
        )}
      </div>
    ),
  };

  const dimensionsColumn: TableColumn = {
    key: "dimensions",
    header: "Dimensions",
    render: (tier) => renderValue(tier.attributes?.dimensions),
  };

  const contextColumn: TableColumn = {
    key: "context",
    header: "Context",
    render: (tier) => renderValue(tier.attributes?.context),
  };

  const tokenPriceColumn: TableColumn = {
    key: "token-price",
    header: "Price",
    align: "right",
    render: (tier) => (
      <div>
        <div className={cn("text-base font-semibold tabular-nums text-white", MONO)}>
          {tier.attributes?.priceInput ?? "—"}
          <span className="ml-1 text-[10px] font-normal text-white/55">/ 1M</span>
        </div>
        <div className={cn("text-[9px] uppercase tracking-[0.14em] text-white/40", MONO)}>
          input · cached/output free
        </div>
      </div>
    ),
  };

  const hourlyColumn: TableColumn = {
    key: "hourly",
    header: "$/hr",
    align: "right",
    render: (tier) => (
      <span className={cn("text-sm tabular-nums text-white/75", MONO)}>
        ${formatHourly(getEffectiveMonthly(tier))}
      </span>
    ),
  };

  const monthlyColumn: TableColumn = {
    key: "monthly",
    header: "$/month",
    align: "right",
    render: (tier) => (
      <div>
        <div className={cn("text-base font-semibold tabular-nums text-white", MONO)}>
          ${formatPrice(getEffectiveMonthly(tier))}
        </div>
        <div className={cn("text-[9px] uppercase tracking-[0.14em] text-white/40", MONO)}>
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
        className={cn(
          "group inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-none border px-3.5 py-2 text-xs font-medium transition-all duration-200",
          tier.isFeatured
            ? "border-white/85 bg-white text-black hover:bg-white/90"
            : "border-white/15 bg-white/[0.04] text-white/85 hover:border-white/30 hover:bg-white/[0.08] hover:text-white"
        )}
      >
        {tier.ctaText || tier.summary?.buttonText || "Get Started"}
        <ServiceMark
          kind="arrow"
          className="h-3 w-3 transition-transform group-hover:translate-x-0.5"
        />
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
        return [planColumn, engineColumn, vcpuColumn, memoryColumn, diskColumn, hourlyColumn, monthlyColumn, ctaColumn];
      case "kubernetes":
        return [planColumn, vcpuColumn, memoryColumn, storageColumn, hourlyColumn, monthlyColumn, ctaColumn];
      case "security":
        return [planColumn, sshColumn, minecraftColumn, rdpColumn, otherProtocolsColumn, monthlyColumn, ctaColumn];
      case "ai-deployment":
        return [modelColumn, dimensionsColumn, contextColumn, tokenPriceColumn, ctaColumn];
      default:
        return [planColumn, featuresColumn, hourlyColumn, monthlyColumn, ctaColumn];
    }
  })();

  // Featured plans surface at the top of the table.
  const orderedTiers = [...filteredTiers].sort(
    (a, b) => Number(Boolean(b.isFeatured)) - Number(Boolean(a.isFeatured))
  );

  // "Starts at" — prefer an explicit label, else derive from the cheapest plan.
  const cheapestMonthly = orderedTiers.length
    ? Math.min(...orderedTiers.map(getEffectiveMonthly))
    : null;
  const startsAtLabel = category?.startingPriceLabel
    ? `$${category.startingPriceLabel.replace(/^\$/, "")}`
    : cheapestMonthly != null
      ? `$${formatPrice(cheapestMonthly)}`
      : "$9";

  return (
    <div className="flex-1">
      <div className="space-y-8">
        <div className="space-y-2">
          <h2 className="flex items-center gap-3 text-2xl font-semibold tracking-[-0.02em] md:text-3xl">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[7px] border border-white/[0.08] bg-white/[0.03]"
              style={{ color: BRAND }}
            >
              <CategoryIcon slug={category?.id} strokeWidth={1.75} className="h-5 w-5" />
            </span>
            {category?.label}
          </h2>
          <p className="max-w-2xl text-sm text-white/50 md:text-base">
            {category?.description}
          </p>
        </div>

        {category?.promos && category.promos.length > 0 && (
          <div className="space-y-3">
            {category.promos.map((promo) => (
              <div
                key={promo.title}
                className="rounded-[8px] border border-white/[0.08] bg-[#0a0c10] p-5 md:p-6"
                style={{
                  boxShadow:
                    "inset 0 1px 0 rgba(255,255,255,0.04), 0 6px 22px -8px rgba(0,0,0,0.6)",
                }}
              >
                <div className="mb-2 flex items-center gap-2 text-xs text-white/60">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]",
                      MONO
                    )}
                    style={{
                      color: BRAND,
                      borderColor: "rgba(0,149,255,0.35)",
                      background: "rgba(0,149,255,0.08)",
                    }}
                  >
                    {promo.badge}
                  </span>
                  {promo.badgeNote && (
                    <span className={cn("uppercase tracking-[0.12em] text-white/45", MONO)}>
                      {promo.badgeNote}
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-white md:text-lg">
                      {promo.title}
                    </h3>
                    <p className="text-xs text-white/65 md:text-sm">{promo.description}</p>
                    {promo.subtext && (
                      <p className="mt-1 text-xs text-white/45">{promo.subtext}</p>
                    )}
                  </div>
                  {promo.priceCurrent ? (
                    <div
                      className={cn(
                        "flex items-center gap-2 text-sm font-semibold tabular-nums text-white",
                        MONO
                      )}
                    >
                      {promo.priceOld && (
                        <span className="text-xs text-white/40 line-through">
                          {promo.priceOld}
                        </span>
                      )}
                      <span>{promo.priceCurrent}</span>
                    </div>
                  ) : (
                    // <a
                    //   href={promo.linkHref}
                    //   className="text-xs font-medium underline underline-offset-4 transition-colors hover:text-white md:text-sm"
                    //   style={{ color: BRAND }}
                    // >
                    //   {promo.linkText}
                    // </a>
                    <>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {(isDatabaseCategory || isKubernetesCategory || isGpuCategory) && (
          <div className="space-y-4 rounded-[8px] border border-white/[0.08] bg-white/[0.02] p-4">
            {isDatabaseCategory && (
              <FilterTabs
                label="Database Type"
                tabs={DATABASE_TYPE_TABS}
                activeValue={databaseTypeFilter}
                onChange={setDatabaseTypeFilter}
              />
            )}

            {(isDatabaseCategory || isKubernetesCategory || isGpuCategory) && (
              <FilterTabs
                label={isGpuCategory ? "GPU Type" : "CPU Type"}
                tabs={
                  isGpuCategory
                    ? GPU_CPU_TABS
                    : isKubernetesCategory
                      ? kubernetesCpuTabs
                      : DEFAULT_CPU_TABS
                }
                activeValue={cpuTypeFilter}
                onChange={setCpuTypeFilter}
              />
            )}
          </div>
        )}

        <div className="space-y-2">
          <h3 className="text-lg font-semibold md:text-xl">
            Starts at{" "}
            <span className={cn("tabular-nums", MONO)} style={{ color: BRAND }}>
              {startsAtLabel}
            </span>
          </h3>
          <p className="text-xs text-white/50 md:text-sm">
            {category?.startingPriceDescription ??
              "Upgrade anytime. Mix tiers across projects as your needs change."}
          </p>
        </div>

        {orderedTiers.length === 0 ? (
          <div className="rounded-[8px] border border-white/[0.08] bg-white/[0.02] px-5 py-4 text-sm text-white/70">
            No plans match the selected filters.
          </div>
        ) : (
          <div
            className="overflow-x-auto rounded-[8px] border border-white/[0.08] bg-[#0a0c10]"
            style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)" }}
          >
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr className="border-b border-white/[0.08] bg-white/[0.02]">
                  {columns.map((column) => (
                    <th
                      key={column.key}
                      className={cn(
                        "px-4 py-3 text-[10px] font-medium uppercase tracking-[0.16em] text-white/40",
                        MONO,
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
                      tier.isFeatured && "bg-white/[0.03]"
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
