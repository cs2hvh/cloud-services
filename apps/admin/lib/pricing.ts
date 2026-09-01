/**
 * Shared types and pure helpers for the price-book surface.
 *
 * The contract (docs/BILLING-HANDOFF.md): a price is stored in the unit it
 * was quoted in, and billing.resolve_hourly_rate() is the only converter the
 * BILLING path uses. The conversions here exist purely for PREVIEW — showing
 * an operator the monthly equivalent of an hourly rate before commit is what
 * catches a $120/hr typo ($86,400/mo) at entry.
 */

export const HOURS_IN_MONTH = 720;

/**
 * Maintained by hand from billing-lane pings (agreed mechanism; see
 * docs/BILLING-HANDOFF.md updates). Three states, deliberately — "scheduled
 * but unwatched" is precisely the condition that let six days of unbilled
 * usage pass, so it must not render the same as either neighbour.
 *
 * 2026-08-31: ahura-billing-sweep.timer deployed (hourly at :10, --apply).
 * 2026-09-01: deadman watchdog armed — repo secrets added, workflow runs on
 * GitHub every 2h against a 3h staleness threshold. Watched means monitored,
 * NOT self-healing: it detects a stoppage, it restarts nothing, and a red
 * run is only seen by someone watching the Actions tab.
 */
export type SweepStatus = "unscheduled" | "scheduled_unwatched" | "watched";
export const SWEEP_STATUS: SweepStatus = "watched";

/**
 * Prices became effective 2026-08-31 09:00 UTC and the sweep bills only
 * completed hours at the price live THEN — no earlier hour can ever be
 * billed unless someone deliberately backdates effective_from.
 */
export const BILLING_ACTIVE_SINCE = "2026-08-31T09:00:00Z";

/** One row from billing.price_seed_candidates() — archive-derived, unconverted. */
export interface SeedCandidate {
  service_type: string;
  plan_key: string;
  plan_name: string;
  rate_model: RateModel;
  amount: number;
  unit: string;
  source: string;
  review_flag: string | null;
}

export type RateModel = "fixed_hourly" | "markup" | "per_gb_hour";

export const RATE_MODELS: RateModel[] = ["fixed_hourly", "markup", "per_gb_hour"];

export const UNITS_BY_MODEL: Record<RateModel, string[]> = {
  fixed_hourly: ["usd_per_hour", "usd_per_month"],
  markup: ["multiplier"],
  per_gb_hour: ["usd_per_gb_month", "usd_per_gb_hour"],
};

export interface ServicePlan {
  service_type: string;
  plan_key: string;
  display_name: string;
  description: string | null;
  tier: string | null;
  vcpu: number | null;
  memory_mb: number | null;
  disk_gb: number | null;
  provider: string | null;
  provider_size: string | null;
  is_active: boolean;
  sort_order: number | null;
  metadata: Record<string, unknown> | null;
}

export interface PriceRow {
  id: string;
  service_type: string;
  plan_key: string;
  rate_model: RateModel;
  unit: string;
  amount: number;
  floor_usd_per_hour: number | null;
  effective_from: string;
  effective_to: string | null;
  note: string | null;
  created_by: string | null;
}

/** Hourly-equivalent for PREVIEW/comparison. null when not expressible ($). */
export function hourlyEquivalent(
  model: RateModel,
  unit: string,
  amount: number,
): number | null {
  if (model === "fixed_hourly") {
    return unit === "usd_per_month" ? amount / HOURS_IN_MONTH : amount;
  }
  if (model === "per_gb_hour") {
    // Per GB, not absolute — comparable only within per-GB rates.
    return unit === "usd_per_gb_month" ? amount / HOURS_IN_MONTH : amount;
  }
  return null; // markup: depends on upstream cost
}

export function monthlyEquivalent(
  model: RateModel,
  unit: string,
  amount: number,
): number | null {
  const hourly = hourlyEquivalent(model, unit, amount);
  return hourly === null ? null : hourly * HOURS_IN_MONTH;
}

export function formatRate(row: Pick<PriceRow, "rate_model" | "unit" | "amount">): string {
  switch (row.unit) {
    case "usd_per_hour":
      return `$${row.amount}/hr`;
    case "usd_per_month":
      return `$${row.amount}/mo`;
    case "multiplier":
      return `cost × ${row.amount}`;
    case "usd_per_gb_month":
      return `$${row.amount}/GB·mo`;
    case "usd_per_gb_hour":
      return `$${row.amount}/GB·hr`;
    default:
      return `${row.amount} ${row.unit}`;
  }
}

/** Compact spec line; typed columns first, metadata fallback for db/k8s/apps. */
export function specSummary(plan: ServicePlan): string {
  if (plan.vcpu || plan.memory_mb || plan.disk_gb) {
    const parts = [];
    if (plan.vcpu) parts.push(`${plan.vcpu} vCPU`);
    if (plan.memory_mb) parts.push(`${Math.round(plan.memory_mb / 1024)} GB RAM`);
    if (plan.disk_gb) parts.push(`${plan.disk_gb} GB disk`);
    return parts.join(" · ");
  }
  const meta = plan.metadata ?? {};
  const res = (meta.resources ?? meta.specs) as
    | { cpu?: unknown; ram?: unknown; storage?: unknown }
    | undefined;
  if (res && (res.cpu || res.ram || res.storage)) {
    return [res.cpu && `${res.cpu} CPU`, res.ram && `${res.ram} RAM`, res.storage && `${res.storage} disk`]
      .filter(Boolean)
      .join(" · ");
  }
  return plan.tier ?? plan.provider_size ?? "—";
}
