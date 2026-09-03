import { NextRequest, NextResponse } from "next/server";
import { findPrice, resolveHourly, HOURS_IN_MONTH } from "@/lib/pricing/price-book";

/**
 * GET /api/services/pricing?service=objectspace[&plan=…]
 *
 * The flat monthly and hourly rate for one service, read from
 * billing.service_pricing — the same book the admin panel writes and the
 * hourly sweep charges from.
 *
 * WHY THIS EXISTS
 *
 * Two deploy pages fetched their price over HTTP from endpoints that read
 * `public.products`, dropped on 2026-08-31:
 *
 *   object storage    /api/products?type=object-storage   → 0 products → $0
 *   network & DDoS    /api/pricing?category=network-ddos  → 0 tiers    → $0
 *
 * Neither errored. An empty result became a zero price on the page, while the
 * book held $5.00/mo and $300/mo — so a customer was shown free and would have
 * been billed the real rate by the sweep. The 2026-09-02 price rewire moved
 * config/pricing.ts onto the book but did not catch these two, because they do
 * not import it: they fetch.
 *
 * A missing price returns 502 rather than a zero. That is the whole point —
 * every path this replaces preferred a plausible zero to an honest failure, and
 * a deploy page showing $0 for a service that costs $300 is worse than one
 * showing an error.
 */

// Only flat-rate services. A per-GB or markup service has no meaningful figure
// until the GB count or the upstream rate is known, and inventing one here is
// how a quote stops matching a bill.
const FLAT_RATE_SERVICES = new Set([
  "objectspace",
  "spectrum",
  "database",
  "kubernetes",
  "platform_apps",
  "inference_vector",
]);

export async function GET(req: NextRequest) {
  const service = req.nextUrl.searchParams.get("service")?.trim() ?? "";
  const plan = req.nextUrl.searchParams.get("plan")?.trim() || "*";

  if (!service) {
    return NextResponse.json({ error: "service is required" }, { status: 400 });
  }
  if (!FLAT_RATE_SERVICES.has(service)) {
    return NextResponse.json(
      { error: `service must be one of: ${[...FLAT_RATE_SERVICES].sort().join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const row = await findPrice(service, plan);
    if (!row) {
      return NextResponse.json(
        { error: `No live price for ${service}/${plan}` },
        { status: 502 }
      );
    }
    if (row.rateModel !== "fixed_hourly") {
      return NextResponse.json(
        { error: `${service}/${plan} is priced per unit and cannot be quoted flat` },
        { status: 409 }
      );
    }

    const hourly = resolveHourly(row);
    return NextResponse.json({
      service,
      plan: row.planKey,
      hourly,
      monthly: Math.round(hourly * HOURS_IN_MONTH * 100) / 100,
      setup: row.setupFeeUsd,
    });
  } catch (error) {
    console.error("[services/pricing] price lookup failed:", error);
    return NextResponse.json({ error: "Failed to read the price book" }, { status: 502 });
  }
}
