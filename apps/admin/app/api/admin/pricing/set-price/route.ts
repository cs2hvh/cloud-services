import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { AuditLogService } from "@/lib/audit/service";
import {
  RATE_MODELS,
  UNITS_BY_MODEL,
  hourlyEquivalent,
  type PriceRow,
  type RateModel,
} from "@admin/lib/pricing";

export const dynamic = "force-dynamic";

/**
 * The panel's single price-write path. Delegates the actual write to
 * billing.set_price() — which validates the plan against public.service_plans,
 * enforces close-then-insert atomically, and refuses model/unit mismatches
 * and out-of-bounds amounts — and adds the two things the DB cannot:
 * a friendlier >10× category-median guard, and an audit record with actor
 * and old → new.
 */

const OUTLIER_FACTOR = 10;

interface Body {
  serviceType?: string;
  planKey?: string;
  rateModel?: string;
  unit?: string;
  amount?: number;
  floor?: number;
  note?: string;
  confirmOutlier?: boolean;
}

const bad = (error: string, status = 400) =>
  NextResponse.json({ success: false, error }, { status });

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok || !admin.userId) {
    return bad("Unauthorized - Admin access required", 403);
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return bad("Invalid JSON body");
  }

  const serviceType = String(body.serviceType ?? "").trim();
  const planKey = String(body.planKey ?? "").trim();

  // The compute '*' row is a resolver target ("bill the frozen per-server
  // rate", markup 1.0), not a price — at 2.0 every compute VM bills double.
  // Its plan row is inactive so no UI offers it; this closes the direct-POST
  // door. Other services' '*' rows genuinely ARE prices and stay writable.
  if (serviceType === "compute" && planKey === "*") {
    return bad(
      "compute/'*' is billing plumbing (passthrough to the per-server frozen rate), not a price. Set per-instance prices in the Linode console instead."
    );
  }
  const rateModel = String(body.rateModel ?? "") as RateModel;
  const unit = String(body.unit ?? "");
  const amount = Number(body.amount);
  const floor = body.floor === undefined ? 0 : Number(body.floor);
  const note = body.note ? String(body.note).slice(0, 500) : null;

  if (!serviceType || serviceType.length > 64) return bad("serviceType is required");
  if (!planKey || planKey.length > 128) return bad("planKey is required");
  if (!RATE_MODELS.includes(rateModel)) return bad("Unknown rateModel");
  if (!UNITS_BY_MODEL[rateModel].includes(unit)) {
    return bad(`Unit ${unit} does not belong to ${rateModel}`);
  }
  if (!Number.isFinite(amount) || amount <= 0) return bad("amount must be a positive number");
  if (!Number.isFinite(floor) || floor < 0) return bad("floor must be >= 0");

  try {
    const supabase = await createServiceClient();
    const billing = supabase.schema("billing");

    // Current live row — the "old" half of the audit record, and the
    // median-guard peer set.
    const [{ data: oldRows, error: oldErr }, { data: peerRows }] =
      await Promise.all([
        billing
          .from("service_pricing")
          .select("*")
          .eq("service_type", serviceType)
          .eq("plan_key", planKey)
          .is("effective_to", null)
          .limit(1),
        billing
          .from("service_pricing")
          .select("plan_key, rate_model, unit, amount")
          .eq("service_type", serviceType)
          .eq("rate_model", "fixed_hourly")
          .is("effective_to", null),
      ]);

    if (oldErr) {
      console.error("[Admin Pricing] reading current price failed:", oldErr.message);
      return bad("Failed to read current price", 500);
    }
    const oldRow = (oldRows?.[0] as PriceRow | undefined) ?? null;

    // Friendlier guard than the DB bounds: a fixed-hourly rate far outside
    // its own category needs an explicit human yes. Markup and per-GB rates
    // are not comparable to absolute hourly rates, so they rely on the DB
    // bounds alone.
    if (rateModel === "fixed_hourly") {
      const newHourly = hourlyEquivalent(rateModel, unit, amount);
      const peers = (peerRows ?? [])
        .filter((p) => p.plan_key !== planKey)
        .map((p) => hourlyEquivalent("fixed_hourly", p.unit, Number(p.amount)))
        .filter((v): v is number => v !== null && v > 0)
        .sort((a, b) => a - b);
      if (newHourly !== null && peers.length >= 2) {
        const median = peers[Math.floor(peers.length / 2)];
        if (newHourly > OUTLIER_FACTOR * median && !body.confirmOutlier) {
          return NextResponse.json(
            {
              success: false,
              requiresConfirmation: true,
              error: `That is $${newHourly.toFixed(4)}/hr — more than ${OUTLIER_FACTOR}× the ${serviceType} median of $${median.toFixed(4)}/hr. Confirm explicitly to proceed.`,
              median,
              newHourly,
            },
            { status: 409 },
          );
        }
      }
    }

    const { data: result, error: rpcError } = await billing.rpc("set_price", {
      p_service_type: serviceType,
      p_plan_key: planKey,
      p_rate_model: rateModel,
      p_amount: amount,
      p_unit: unit,
      p_floor: floor,
      p_note: note,
      p_actor: admin.userId,
    });

    if (rpcError) {
      console.error("[Admin Pricing] set_price rpc failed:", rpcError.message);
      return bad("Price write failed", 500);
    }
    const outcome = result as {
      success: boolean;
      error?: string;
      action?: string;
      pricingId?: string;
      hourlyEquivalent?: number;
    };
    if (!outcome?.success) {
      return bad(outcome?.error ?? "Price write refused", 422);
    }

    // Plan display name for a readable audit line.
    const { data: planRows } = await supabase
      .from("service_plans")
      .select("display_name")
      .eq("service_type", serviceType)
      .eq("plan_key", planKey)
      .limit(1);

    await AuditLogService.create({
      user_id: admin.userId,
      user_role: "admin",
      user_email: admin.email,
      action: oldRow ? "update" : "create",
      service_type: "pricing",
      service_id: `${serviceType}:${planKey}`,
      service_name: planRows?.[0]?.display_name ?? planKey,
      before_state: oldRow ? ({ ...oldRow } as Record<string, unknown>) : undefined,
      after_state: {
        rate_model: rateModel,
        unit,
        amount,
        floor_usd_per_hour: floor,
        note,
        pricing_id: outcome.pricingId,
        set_price_action: outcome.action,
      },
      metadata: { via: "admin-panel", hourly_equivalent: outcome.hourlyEquivalent },
    });

    return NextResponse.json({ ...outcome, success: true });
  } catch (err) {
    console.error("[Admin Pricing] unexpected error:", err);
    return bad("Internal server error", 500);
  }
}
