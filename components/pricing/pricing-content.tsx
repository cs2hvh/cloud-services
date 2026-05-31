import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ServiceCategory, PricingTier } from "@/lib/supabase/queries/pricing";

import { NvidiaLogo } from "@/components/branding/nvidia-logo";

const BRAND = "#0095FF";

// Flat pricing everywhere — region is a deployment choice, not a price lever.
const REGIONS = [
  "New York",
  "San Francisco",
  "Toronto",
  "London",
  "Frankfurt",
  "Singapore",
  "Tokyo",
  "Sydney",
  "Mumbai",
];

// ─── normalizers ────────────────────────────────────────────────────
function normalizeValue(value?: string | null): string {
  if (!value) return "";
  return value.toLowerCase().trim().replace(/[_\s]+/g, "-");
}

function normalizeDatabaseType(value?: string | null): string {
  const n = normalizeValue(value);
  if (!n) return "";
  if (n.includes("mysql")) return "mysql";
  if (n.includes("mongo")) return "mongodb";
  if (n.includes("postgres") || n === "pg") return "postgres";
  return n;
}

function normalizeCpuType(value?: string | null): string {
  const n = normalizeValue(value);
  if (!n) return "";
  if (n.includes("general")) return "general-purpose";
  if (n.includes("storage")) return "storage-optimized";
  if (n.includes("dedicated")) return "dedicated";
  if (n.includes("shared")) return "shared";
  if (n.includes("basic")) return "basic";
  return n;
}

function titleCase(value: string): string {
  return value
    .split("-")
    .map((p) => (p.toLowerCase() === "gpu" ? "GPU" : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");
}

// ─── spec parsing ───────────────────────────────────────────────────
type ParsedSpecs = { vcpu?: string; memory?: string; storage?: string; network?: string };

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
  if (/gbit|gbps|mbit|mbps|tbit|fabric|network|gb\/s/.test(low)) return "network";
  return "other";
}

function parseSpecs(tier: PricingTier): ParsedSpecs {
  const result: ParsedSpecs = {};
  for (const spec of tier.specs ?? []) {
    switch (classifySpec(spec)) {
      case "vcpu": {
        const m = spec.match(/(\d+)/);
        result.vcpu = m ? m[1] : spec.trim();
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
  if (!result.storage) {
    const f = (tier.features ?? []).find((x) => /storage|disk/i.test(x));
    result.storage = formatSizeToken(f);
  }
  return result;
}

function getGpuModel(tier: PricingTier): string | undefined {
  if (tier.machineType) return tier.machineType;
  for (const f of tier.features ?? []) {
    const m = f.match(/nvidia\s+([a-z0-9× ]+)/i);
    if (m) return m[1].trim().toUpperCase();
  }
  return undefined;
}

function getEngine(tier: PricingTier): string | undefined {
  const t = normalizeDatabaseType(tier.subType || tier.name);
  if (t === "mysql") return "MySQL";
  if (t === "mongodb") return "MongoDB";
  if (t === "postgres") return "PostgreSQL";
  return undefined;
}

function getClass(tier: PricingTier): string | undefined {
  const n = normalizeCpuType(tier.cpuType || tier.machineType || tier.name);
  return n ? titleCase(n) : undefined;
}

// ─── facets (the "type" dimensions a category exposes) ───────────────
type Facet = {
  key: string;
  label: string;
  nvidia?: boolean;
  options: string[];
  valueOf: (tier: PricingTier) => string | undefined;
};

function buildFacets(categoryId: string, tiers: PricingTier[]): Facet[] {
  const distinct = (fn: (t: PricingTier) => string | undefined) =>
    Array.from(new Set(tiers.map(fn).filter((x): x is string => Boolean(x))));

  if (categoryId === "database") {
    const facets: Facet[] = [];
    const engines = distinct(getEngine);
    if (engines.length > 1) facets.push({ key: "engine", label: "Engine", options: engines, valueOf: getEngine });
    const classes = distinct(getClass);
    if (classes.length > 1) facets.push({ key: "class", label: "Class", options: classes, valueOf: getClass });
    return facets;
  }
  if (categoryId === "gpu" || categoryId === "gpu-instance") {
    const models = distinct(getGpuModel);
    return models.length > 1
      ? [{ key: "gpu", label: "GPU", nvidia: true, options: models, valueOf: getGpuModel }]
      : [];
  }
  if (categoryId === "compute" || categoryId === "kubernetes") {
    const classes = distinct(getClass);
    return classes.length > 1 ? [{ key: "class", label: "Type", options: classes, valueOf: getClass }] : [];
  }
  return [];
}

// ─── chip row ───────────────────────────────────────────────────────
function ChipRow({
  label,
  options,
  active,
  nvidia,
  onChange,
}: {
  label: string;
  options: string[];
  active: string;
  nvidia?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 font-[var(--font-geist-mono),ui-monospace,monospace] text-[10px] uppercase tracking-[0.16em] text-white/40">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const isActive = opt === active;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={cn(
                "inline-flex cursor-pointer items-center gap-1.5 rounded-[5px] border px-3 py-1.5 text-[12px] font-medium transition-colors",
                isActive
                  ? "border-white bg-white text-black"
                  : "border-white/12 bg-white/[0.02] text-white/60 hover:border-white/35 hover:text-white"
              )}
            >
              {nvidia && <NvidiaLogo width={14} height={10} className={cn("opacity-95", isActive && "brightness-0")} />}
              {opt}
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
};

export function PricingContent({ category, billingCycle }: PricingContentProps) {
  const categoryId = normalizeValue(category?.id);
  const tiers = useMemo(() => category?.tiers ?? [], [category?.tiers]);

  const formatPrice = (v: number) => (Number.isInteger(v) ? v.toLocaleString() : v.toFixed(2));
  const formatHourly = (monthly: number) => {
    const h = monthly / 720;
    if (h === 0) return "0";
    return h < 1 ? h.toFixed(3) : h.toFixed(2);
  };
  const effMonthly = (tier: PricingTier) =>
    billingCycle === "monthly" ? tier.price.monthly : tier.price.yearly / 12;

  // Configurator only makes sense when tiers carry CPU/RAM specs.
  const configurable = useMemo(
    () => categoryId !== "ai-labs" && tiers.some((t) => { const p = parseSpecs(t); return p.vcpu || p.memory; }),
    [categoryId, tiers]
  );

  const facets = useMemo(() => buildFacets(categoryId, tiers), [categoryId, tiers]);

  return (
    <div>
      {/* Category header */}
      <div className="max-w-2xl">
        <h2 className="text-[24px] font-semibold tracking-tight text-white sm:text-[30px]">
          {category?.label}
        </h2>
        {category?.description && (
          <p className="mt-2.5 text-[14px] leading-relaxed text-white/50">{category.description}</p>
        )}
      </div>

      <div className="mt-8">
        {configurable ? (
          <Configurator
            tiers={tiers}
            facets={facets}
            billingCycle={billingCycle}
            categoryLabel={category?.label ?? ""}
            effMonthly={effMonthly}
            formatPrice={formatPrice}
            formatHourly={formatHourly}
          />
        ) : (
          <PlanCards tiers={tiers} billingCycle={billingCycle} effMonthly={effMonthly} formatPrice={formatPrice} />
        )}
      </div>
    </div>
  );
}

// ─── Configurator ───────────────────────────────────────────────────
function Configurator({
  tiers,
  facets,
  billingCycle,
  categoryLabel,
  effMonthly,
  formatPrice,
  formatHourly,
}: {
  tiers: PricingTier[];
  facets: Facet[];
  billingCycle: "monthly" | "yearly";
  categoryLabel: string;
  effMonthly: (t: PricingTier) => number;
  formatPrice: (v: number) => string;
  formatHourly: (v: number) => string;
}) {
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [sizeIndex, setSizeIndex] = useState(0);
  const [region, setRegion] = useState(REGIONS[0]);

  // Initialize / reset facet selections when the facet set changes.
  const facetKey = facets.map((f) => `${f.key}:${f.options.join(",")}`).join("|");
  useEffect(() => {
    const init: Record<string, string> = {};
    facets.forEach((f) => (init[f.key] = f.options[0]));
    setSelected(init);
    setSizeIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facetKey]);

  // Tiers matching the current facet selection, sorted by price (small → large).
  const sizes = useMemo(() => {
    const matched = tiers.filter((t) =>
      facets.every((f) => {
        const want = selected[f.key] ?? f.options[0];
        return f.valueOf(t) === want;
      })
    );
    const base = matched.length > 0 ? matched : tiers;
    return [...base].sort((a, b) => a.price.monthly - b.price.monthly);
  }, [tiers, facets, selected]);

  const safeIndex = Math.min(sizeIndex, Math.max(0, sizes.length - 1));
  const tier = sizes[safeIndex];

  if (!tier) return null;

  const specs = parseSpecs(tier);
  const monthly = effMonthly(tier);
  const gpuModel = getGpuModel(tier);

  const specRows: Array<[string, string | undefined]> = [
    ["GPU", categoryLabel.toLowerCase().includes("gpu") ? gpuModel : undefined],
    ["vCPU", specs.vcpu],
    ["Memory", specs.memory],
    ["Storage", specs.storage],
    ["Network", specs.network],
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8">
      {/* ── Controls ── */}
      <div className="space-y-7 rounded-[12px] border border-white/[0.08] bg-white/[0.015] p-6 sm:p-7">
        {facets.map((f) => (
          <ChipRow
            key={f.key}
            label={f.label}
            options={f.options}
            nvidia={f.nvidia}
            active={selected[f.key] ?? f.options[0]}
            onChange={(v) => {
              setSelected((s) => ({ ...s, [f.key]: v }));
              setSizeIndex(0);
            }}
          />
        ))}

        {/* Region (flat pricing — display only) */}
        <div>
          <p className="mb-2 font-[var(--font-geist-mono),ui-monospace,monospace] text-[10px] uppercase tracking-[0.16em] text-white/40">
            Region
          </p>
          <div className="relative inline-block">
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="cursor-pointer appearance-none rounded-[5px] border border-white/12 bg-white/[0.02] py-2 pl-3 pr-9 text-[12.5px] font-medium text-white/85 outline-none transition-colors hover:border-white/35 focus:border-white/45"
            >
              {REGIONS.map((r) => (
                <option key={r} value={r} className="bg-[#0b0d12] text-white">
                  {r}
                </option>
              ))}
            </select>
            <ChevronRight className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 rotate-90 text-white/40" />
          </div>
          <span className="ml-3 text-[11px] text-white/35">Same price in every region</span>
        </div>

        {/* Size slider */}
        {sizes.length > 1 && (
          <div>
            <div className="mb-3 flex items-baseline justify-between">
              <p className="font-[var(--font-geist-mono),ui-monospace,monospace] text-[10px] uppercase tracking-[0.16em] text-white/40">
                Size
              </p>
              <p className="font-[var(--font-geist-mono),ui-monospace,monospace] text-[12px] tabular-nums text-white/55">
                {[specs.vcpu && `${specs.vcpu} vCPU`, specs.memory].filter(Boolean).join(" · ") || tier.name}
              </p>
            </div>

            <SizeSlider count={sizes.length} value={safeIndex} onChange={setSizeIndex} sizes={sizes} />

            <div className="mt-2.5 flex justify-between font-[var(--font-geist-mono),ui-monospace,monospace] text-[11px] tabular-nums text-white/35">
              <span>${formatPrice(effMonthly(sizes[0]))}/mo</span>
              <span>${formatPrice(effMonthly(sizes[sizes.length - 1]))}/mo</span>
            </div>
          </div>
        )}

        {/* Included features */}
        {tier.features.length > 0 && (
          <div>
            <p className="mb-2.5 font-[var(--font-geist-mono),ui-monospace,monospace] text-[10px] uppercase tracking-[0.16em] text-white/40">
              Included
            </p>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {tier.features.slice(0, 8).map((f) => (
                <span key={f} className="flex items-center gap-1.5 text-[12.5px] text-white/65">
                  <Check className="h-3 w-3 shrink-0" style={{ color: BRAND }} />
                  {f}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Live summary ── */}
      <div className="lg:sticky lg:top-24 lg:self-start">
        <div className="relative overflow-hidden rounded-[12px] border border-[#0095FF]/25 bg-[#0b0d12]">
          {/* top accent */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px"
            style={{ background: `linear-gradient(90deg, transparent, ${BRAND}, transparent)` }}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute -inset-x-10 -top-16 h-32 opacity-50 blur-3xl"
            style={{ background: `radial-gradient(50% 100% at 50% 0%, ${BRAND}55, transparent 70%)` }}
          />

          <div className="relative p-6">
            <p className="font-[var(--font-geist-mono),ui-monospace,monospace] text-[10px] uppercase tracking-[0.18em] text-white/40">
              {categoryLabel} · {tier.name}
            </p>

            {/* Price */}
            <div className="mt-4 flex items-end gap-3">
              <div>
                <span className="font-[var(--font-geist-mono),ui-monospace,monospace] text-[40px] font-bold leading-none tabular-nums text-white">
                  ${formatPrice(monthly)}
                </span>
                <span className="ml-1 text-[13px] text-white/45">/mo</span>
              </div>
              <div className="pb-1 font-[var(--font-geist-mono),ui-monospace,monospace] text-[12px] tabular-nums text-white/45">
                ${formatHourly(monthly)}/hr
              </div>
            </div>
            <p className="mt-1.5 text-[11px] text-white/40">
              {billingCycle === "monthly" ? (
                "Billed monthly · cancel anytime"
              ) : (
                <>
                  Billed yearly · <span className="text-[#8ecaff]">save 20%</span>
                </>
              )}
            </p>

            {/* Spec breakdown */}
            <div className="mt-5 space-y-px overflow-hidden rounded-[7px] border border-white/[0.07]">
              {specRows
                .filter(([, v]) => Boolean(v))
                .map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between bg-white/[0.02] px-3.5 py-2.5"
                  >
                    <span className="font-[var(--font-geist-mono),ui-monospace,monospace] text-[10.5px] uppercase tracking-[0.12em] text-white/40">
                      {label}
                    </span>
                    <span className="font-[var(--font-geist-mono),ui-monospace,monospace] text-[12.5px] font-medium tabular-nums text-white/90">
                      {value}
                    </span>
                  </div>
                ))}
            </div>

            <a
              href={tier.ctaLink}
              className="group mt-5 inline-flex w-full items-center justify-center gap-2 rounded-[6px] bg-white px-5 py-3 text-[13.5px] font-semibold text-black transition-colors hover:bg-white/90"
            >
              {tier.ctaText || "Deploy now"}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </a>
            <p className="mt-3 text-center text-[11px] text-white/35">No setup fees · pay only while running</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Custom size slider ─────────────────────────────────────────────
function SizeSlider({
  count,
  value,
  onChange,
  sizes,
}: {
  count: number;
  value: number;
  onChange: (v: number) => void;
  sizes: PricingTier[];
}) {
  const pct = count > 1 ? (value / (count - 1)) * 100 : 0;
  return (
    <div className="relative h-6 select-none">
      {/* track */}
      <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-white/[0.08]" />
      {/* filled */}
      <div
        className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full"
        style={{ width: `${pct}%`, background: BRAND, boxShadow: `0 0 12px ${BRAND}66` }}
      />
      {/* ticks */}
      {sizes.map((s, i) => {
        const left = count > 1 ? (i / (count - 1)) * 100 : 0;
        return (
          <span
            key={s.id ?? i}
            className="absolute top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ left: `${left}%`, background: i <= value ? "#fff" : "rgba(255,255,255,0.22)" }}
          />
        );
      })}
      {/* thumb */}
      <div
        className="pointer-events-none absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-white"
        style={{ left: `${pct}%`, borderColor: BRAND, boxShadow: `0 0 0 4px ${BRAND}33` }}
      />
      {/* native input for drag + keyboard */}
      <input
        type="range"
        min={0}
        max={Math.max(0, count - 1)}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Plan size"
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </div>
  );
}

// ─── Card layout (metered / thin categories) ────────────────────────
function PlanCards({
  tiers,
  billingCycle,
  effMonthly,
  formatPrice,
}: {
  tiers: PricingTier[];
  billingCycle: "monthly" | "yearly";
  effMonthly: (t: PricingTier) => number;
  formatPrice: (v: number) => string;
}) {
  const ordered = [...tiers].sort(
    (a, b) => Number(Boolean(b.isFeatured)) - Number(Boolean(a.isFeatured))
  );
  // Metered categories have $0 monthly — show the billing model instead of a number.
  const metered = tiers.every((t) => t.price.monthly === 0 && t.billingPeriod);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {ordered.map((tier) => {
        const monthly = effMonthly(tier);
        return (
          <div
            key={tier.id ?? tier.name}
            className={cn(
              "group relative flex flex-col rounded-[10px] border p-5 transition-colors",
              tier.isFeatured
                ? "border-[#0095FF]/35 bg-[#0095FF]/[0.05]"
                : "border-white/[0.08] bg-white/[0.015] hover:border-white/[0.18]"
            )}
          >
            {tier.isFeatured && (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-px"
                style={{ background: `linear-gradient(90deg, transparent, ${BRAND}, transparent)` }}
              />
            )}
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[15px] font-semibold text-white">{tier.name}</h3>
              {tier.isFeatured && (
                <span
                  className="rounded-[3px] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-black"
                  style={{ background: BRAND }}
                >
                  Popular
                </span>
              )}
            </div>

            {tier.shortDescription && (
              <p className="mt-2 text-[12px] leading-relaxed text-white/50">{tier.shortDescription}</p>
            )}

            <div className="mt-4">
              {metered ? (
                <p className="font-[var(--font-geist-mono),ui-monospace,monospace] text-[12px] uppercase tracking-[0.1em] text-[#8ecaff]">
                  {tier.billingPeriod}
                </p>
              ) : (
                <p className="font-[var(--font-geist-mono),ui-monospace,monospace] tabular-nums text-white">
                  <span className="text-[26px] font-bold">${formatPrice(monthly)}</span>
                  <span className="ml-1 text-[12px] text-white/45">
                    {billingCycle === "monthly" ? "/mo" : "/mo · yearly"}
                  </span>
                </p>
              )}
            </div>

            <ul className="mt-3 space-y-1.5">
              {tier.features.slice(0, 5).map((feature) => (
                <li key={feature} className="flex items-start gap-1.5 text-[12px] text-white/65">
                  <Check className="mt-0.5 h-3 w-3 shrink-0" style={{ color: BRAND }} />
                  {feature}
                </li>
              ))}
            </ul>

            <a
              href={tier.ctaLink}
              className={cn(
                "group/cta mt-5 inline-flex items-center justify-center gap-1.5 rounded-[6px] border px-4 py-2.5 text-[12.5px] font-medium transition-colors",
                tier.isFeatured
                  ? "border-transparent bg-white text-black hover:bg-white/90"
                  : "border-white/15 bg-white/[0.04] text-white/85 hover:border-white/40 hover:bg-white/[0.09] hover:text-white"
              )}
            >
              {tier.ctaText || "Get started"}
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover/cta:translate-x-0.5" />
            </a>
          </div>
        );
      })}
    </div>
  );
}
