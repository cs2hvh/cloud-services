// The one place the app asks "what does this cost?"
//
// WHY THIS EXISTS
//
// The admin panel writes prices to billing.service_pricing through
// billing.set_price(). Until now nothing in the customer-facing app read them.
// The hourly sweep did — charge_service_hour resolves the price book — so a
// price change reached what a customer was BILLED and never reached what they
// were SHOWN. Three separate paths quoted instead:
//
//   config/pricing.ts     read public.products      (dropped 2026-08-31)
//   plan-catalog.ts       read public.instance_plans (dropped 2026-08-31)
//   createPod             reads public.gpu_pricing   (still live, separate book)
//
// The first two failed silently. `products` returning nothing became "no
// products", and plan-catalog caught its own failure and returned hardcoded
// DEFAULT_PLANS — so the VPS picker kept working, looked correct, and ignored
// the admin panel completely. That is worse than an error, because nothing
// looks wrong.
//
// Everything in the dashboard now resolves through here, so "set it in the
// panel, see it on the deploy page" is one code path rather than a convention.
//
// GPU is deliberately still separate: it is a markup over a live upstream rate
// rather than a fixed price, and reconciling its two books is a schema decision
// that has not been made. billing.set_gpu_markup reports the drift meanwhile.

import { createServiceClient } from "@/lib/supabase/server";

/** Hours used to convert a monthly price. Must match billing.hours_in_month(). */
export const HOURS_IN_MONTH = 24 * 30;

export type ServiceType =
    | "compute"
    | "database"
    | "kubernetes"
    | "objectspace"
    | "spectrum"
    | "platform_apps"
    | "custom_image"
    | "inference_vector"
    | "gpu_pod"
    | "gpu_pod_storage"
    | "gpu_volume";

export type PriceRow = {
    serviceType: string;
    planKey: string;
    rateModel: "fixed_hourly" | "markup" | "per_gb_hour";
    amount: number;
    unit: string;
    floorUsdPerHour: number;
    setupFeeUsd: number;
};

/** What callers actually want: money per hour, plus any one-off. */
export type Rates = {
    /** One-off charge at provision time. */
    initialCost: number;
    /** Recurring charge per hour. */
    hourlyRate: number;
};

const CACHE_TTL_MS = 60_000;
let cache: { rows: PriceRow[]; fetchedAt: number } | null = null;

function round6(n: number): number {
    return Math.round(n * 1_000_000) / 1_000_000;
}

/**
 * Every live price, cached for a minute.
 *
 * One query for the whole book rather than one per lookup: the book is under a
 * hundred rows, and a deploy page asks for several prices while rendering.
 *
 * A failure here THROWS. That is the point of the rewrite — the paths this
 * replaces each swallowed their own failure and quoted a stale constant, which
 * is how the admin panel came to be disconnected without anyone noticing. A
 * page that cannot price itself must say so.
 */
export async function loadPriceBook(force = false): Promise<PriceRow[]> {
    const now = Date.now();
    if (!force && cache && now - cache.fetchedAt < CACHE_TTL_MS) return cache.rows;

    const supabase = await createServiceClient();
    const { data, error } = await supabase
        .schema("billing")
        .from("service_pricing")
        .select("service_type, plan_key, rate_model, amount, unit, floor_usd_per_hour, setup_fee_usd")
        .is("effective_to", null);

    if (error) {
        throw new Error(`price book unavailable: ${error.message}`);
    }

    const rows: PriceRow[] = (data ?? []).map((r) => ({
        serviceType: r.service_type as string,
        planKey: r.plan_key as string,
        rateModel: r.rate_model as PriceRow["rateModel"],
        amount: Number(r.amount),
        unit: r.unit as string,
        floorUsdPerHour: Number(r.floor_usd_per_hour ?? 0),
        setupFeeUsd: Number(r.setup_fee_usd ?? 0),
    }));

    cache = { rows, fetchedAt: now };
    return rows;
}

/** Drop the cache — call after a price write so the next read is current. */
export function invalidatePriceBook(): void {
    cache = null;
}

/**
 * The live price row for one (service, plan), or null.
 *
 * Falls back to the service's '*' row when the plan has no price of its own,
 * which is how flat-rate services (object storage, spectrum) are stored.
 */
export async function findPrice(
    serviceType: ServiceType | string,
    planKey = "*",
): Promise<PriceRow | null> {
    const rows = await loadPriceBook();
    return (
        rows.find((r) => r.serviceType === serviceType && r.planKey === planKey) ??
        rows.find((r) => r.serviceType === serviceType && r.planKey === "*") ??
        null
    );
}

/**
 * Convert a price row to an hourly figure.
 *
 * Mirrors billing.resolve_hourly_rate() deliberately — the quote and the charge
 * have to agree, and they only agree if they do the same arithmetic. A missing
 * quantity or upstream cost RAISES rather than defaulting to zero: the 2026-08
 * audit was a catalogue of empty values read as free.
 */
export function resolveHourly(
    row: PriceRow,
    opts?: { quantityGb?: number; upstreamCostPerHour?: number },
): number {
    let hourly: number;

    switch (row.rateModel) {
        case "fixed_hourly":
            hourly =
                row.unit === "usd_per_hour"
                    ? row.amount
                    : row.amount / HOURS_IN_MONTH;
            break;

        case "markup": {
            const cost = opts?.upstreamCostPerHour;
            if (typeof cost !== "number" || !Number.isFinite(cost)) {
                throw new Error(
                    `${row.serviceType}/${row.planKey}: markup pricing needs an upstream cost`,
                );
            }
            // Mirrors billing.resolve_hourly_rate (20260903165202): a resold
            // resource that costs us nothing does not exist. A zero here is a
            // rate that was never written, and quoting it would show a
            // customer a price the sweep now refuses to charge.
            if (cost <= 0) {
                throw new Error(
                    `${row.serviceType}/${row.planKey}: markup pricing needs a positive upstream cost, got ${cost}`,
                );
            }
            hourly = cost * row.amount;
            break;
        }

        case "per_gb_hour": {
            const gb = opts?.quantityGb;
            if (typeof gb !== "number" || !Number.isFinite(gb)) {
                throw new Error(
                    `${row.serviceType}/${row.planKey}: per-GB pricing needs a quantity`,
                );
            }
            hourly =
                row.unit === "usd_per_gb_hour"
                    ? row.amount * gb
                    : (row.amount * gb) / HOURS_IN_MONTH;
            break;
        }

        default:
            throw new Error(`${row.serviceType}/${row.planKey}: unknown rate model`);
    }

    return round6(Math.max(hourly, row.floorUsdPerHour));
}

/**
 * The common case: what one unit of this plan costs, per hour, plus setup.
 *
 * `units` multiplies the recurring rate for services billed per unit of
 * themselves — node count for a cluster. It does NOT multiply the setup fee,
 * which is charged once for the resource however many nodes it has.
 */
export async function getRates(
    serviceType: ServiceType | string,
    planKey = "*",
    opts?: { units?: number; quantityGb?: number; upstreamCostPerHour?: number },
): Promise<Rates> {
    const row = await findPrice(serviceType, planKey);
    if (!row) {
        throw new Error(
            `No live price for ${serviceType}/${planKey}. Set one in the admin panel before provisioning.`,
        );
    }

    const units = Math.max(1, Math.trunc(opts?.units ?? 1));
    const hourly = resolveHourly(row, opts);

    return {
        initialCost: round6(row.setupFeeUsd),
        hourlyRate: round6(hourly * units),
    };
}

/** Every live plan price for one service, keyed by plan. */
export async function getRatesForService(
    serviceType: ServiceType | string,
): Promise<Record<string, Rates & { monthly: number }>> {
    const rows = (await loadPriceBook()).filter((r) => r.serviceType === serviceType);
    const out: Record<string, Rates & { monthly: number }> = {};
    for (const row of rows) {
        // Only fixed_hourly can be priced without runtime context; a per-GB or
        // markup plan has no meaningful figure until you know the GB or the
        // upstream rate, and inventing one is how a quote stops matching a bill.
        if (row.rateModel !== "fixed_hourly") continue;
        const hourly = resolveHourly(row);
        out[row.planKey] = {
            initialCost: round6(row.setupFeeUsd),
            hourlyRate: hourly,
            monthly: round6(hourly * HOURS_IN_MONTH),
        };
    }
    return out;
}
