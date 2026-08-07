// GET /api/admin/inference/pricing — catalog with price, upstream cost, margin
// PUT /api/admin/inference/pricing — set one model's customer-facing token price
//
// Thin by design: auth + IO only. Every rule that decides what a customer pays
// (margin, the below-cost floor, merge-don't-replace) lives in
// lib/admin/inference-pricing.ts so it can be unit-tested without a DB.
//
// Doc: nextstespsAI/21-admin-platform.md (§4, section A1).
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import {
  marginPct,
  hasCostBasis,
  planPriceUpdate,
  summarize,
  TOKEN_FIELDS,
  type ModelPricingRow,
  type TokenField,
} from "@/lib/admin/inference-pricing";
import { inferenceAdminClient, MODEL_COLUMNS } from "@/lib/admin/inference-client";
import { actorContext, diffFields, modelActivationEntry, modelPriceEntry, recordAdminAudit } from "@/lib/admin/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = inferenceAdminClient();
  const { data, error } = await supabase
    .schema("inference")
    .from("models")
    .select(MODEL_COLUMNS)
    .order("is_active", { ascending: false })
    .order("model_id")
    .returns<ModelPricingRow[]>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const models = data ?? [];
  return NextResponse.json({
    rows: models.map((m) => ({
      ...m,
      pricing: m.pricing ?? {},
      margin_pct: marginPct(m.pricing, m.upstream_pricing),
      cost_known: hasCostBasis(m),
    })),
    summary: summarize(models),
  });
}

export async function PUT(req: NextRequest) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const modelId = body?.model_id;
  if (!modelId || typeof modelId !== "string") {
    return NextResponse.json({ error: "model_id is required" }, { status: 400 });
  }

  const supabase = inferenceAdminClient();
  const { data: existing, error: loadErr } = await supabase
    .schema("inference")
    .from("models")
    .select(MODEL_COLUMNS)
    .eq("model_id", modelId)
    .maybeSingle<ModelPricingRow>();

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Model not found" }, { status: 404 });

  const patch: Partial<Record<TokenField, number | null>> = {};
  for (const field of TOKEN_FIELDS) {
    if (field in (body ?? {})) patch[field] = body[field];
  }

  const plan = planPriceUpdate({
    existing: existing.pricing,
    upstream: existing.upstream_pricing,
    patch,
    unitPatch: typeof body?.unit_prices === "object" && body.unit_prices ? body.unit_prices : undefined,
    force: body?.force === true,
  });

  if (plan.invalid.length > 0) {
    return NextResponse.json({ error: `Not a valid price: ${plan.invalid.join(", ")}` }, { status: 400 });
  }
  if (plan.violations.length > 0) {
    // 409, not 400: the request is well-formed, it just loses money. The UI
    // offers to resend with force so a loss-leader stays a deliberate act.
    return NextResponse.json(
      {
        error: "Refusing to save a price below upstream cost",
        code: "below_cost",
        violations: plan.violations,
        hint: "Resend with force:true to price this model as a deliberate loss-leader.",
      },
      { status: 409 }
    );
  }

  // Enable/disable is the other operation this screen owns: taking a model out
  // of the catalog is how you stop selling one whose upstream id has gone bad,
  // which previously required a script (13c0957f) or hand-written SQL.
  const update: Record<string, unknown> = { pricing: plan.next };
  if (typeof body?.is_active === "boolean") update.is_active = body.is_active;

  const before = { ...(existing.pricing ?? {}), is_active: existing.is_active };

  const { data, error } = await supabase
    .schema("inference")
    .from("models")
    .update(update)
    .eq("model_id", modelId)
    .select(MODEL_COLUMNS)
    .maybeSingle<ModelPricingRow>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Model not found" }, { status: 404 });

  // Fire-and-forget: the change already succeeded, and an audit failure must
  // not turn a good save into an error.
  const actor = { userId: adminCheck.userId, email: adminCheck.email };
  const ctx = actorContext(req);
  const priceChanges = diffFields(before, { ...(data.pricing ?? {}) }, TOKEN_FIELDS);
  if (priceChanges.length > 0) {
    void recordAdminAudit(modelPriceEntry(modelId, priceChanges, body?.force === true), actor, ctx);
  }
  if (typeof body?.is_active === "boolean" && body.is_active !== existing.is_active) {
    void recordAdminAudit(modelActivationEntry(modelId, body.is_active), actor, ctx);
  }

  return NextResponse.json({
    ...data,
    margin_pct: marginPct(data.pricing, data.upstream_pricing),
    cost_known: hasCostBasis(data),
  });
}
