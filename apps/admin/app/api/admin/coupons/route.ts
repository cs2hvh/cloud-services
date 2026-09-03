import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { AuditLogService } from "@/lib/audit/service";

export const dynamic = "force-dynamic";

/**
 * Promocode management — the panel's write path onto billing.promocodes.
 *
 * The redeem side (billing_redeem_promocode_atomic) is the contract this
 * route must agree with:
 *   - codes are matched UPPER(BTRIM(input)) against the stored code, so we
 *     only ever store uppercase;
 *   - is_active is a real gate ("not active" refusal), so PATCH is a kill
 *     switch, not decoration;
 *   - max_redemptions is a generic total cap; coupon_type is read in exactly
 *     one branch ('limited' auto-deactivates at cap).
 *
 * Semantics are set here, at write time, so the stored row means what the
 * operator was told: "one-time" is created WITH max_redemptions = 1 —
 * historically the type was stored bare and one-time codes were redeemable
 * by every user once (WELCOME67: three redemptions).
 */

const bad = (error: string, status = 400) =>
  NextResponse.json({ success: false, error }, { status });

const CODE_RE = /^[A-Z0-9][A-Z0-9_-]{2,39}$/;

interface CreateBody {
  code?: unknown;
  amount?: unknown;
  semantics?: unknown; // 'one_time' | 'capped' | 'uncapped'
  cap?: unknown;
  validTill?: unknown; // YYYY-MM-DD, valid through end of that day UTC
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok || !admin.userId) {
    return bad("Unauthorized - Admin access required", 403);
  }

  let body: CreateBody;
  try {
    body = await request.json();
  } catch {
    return bad("Invalid JSON body");
  }

  const code = String(body.code ?? "").trim().toUpperCase();
  if (!CODE_RE.test(code)) {
    return bad("Code must be 3-40 chars: A-Z, 0-9, dash, underscore");
  }

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return bad("Credit amount must be > 0");
  }
  if (amount > 1000) {
    return bad("Credit amount above $1,000 — not a coupon-sized number");
  }

  const validTill = String(body.validTill ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(validTill)) {
    return bad("validTill (YYYY-MM-DD) is required — coupons must expire");
  }
  // Valid through the END of the chosen day, UTC.
  const validTillIso = `${validTill}T23:59:59Z`;
  if (Date.parse(validTillIso) <= Date.now()) {
    return bad("validTill is in the past — the coupon would be born expired");
  }

  const semantics = String(body.semantics ?? "");
  let couponType: string;
  let maxRedemptions: number | null;
  if (semantics === "one_time") {
    couponType = "one-time";
    maxRedemptions = 1;
  } else if (semantics === "capped") {
    const cap = Number(body.cap);
    if (!Number.isInteger(cap) || cap < 1) {
      return bad("cap must be a whole number ≥ 1");
    }
    couponType = "limited";
    maxRedemptions = cap;
  } else if (semantics === "uncapped") {
    couponType = "multi-use";
    maxRedemptions = null;
  } else {
    return bad("semantics must be one_time, capped or uncapped");
  }

  const supabase = await createServiceClient();
  const billing = supabase.schema("billing");

  // Redemption uppercases its input, so two codes differing only by case
  // would collide at redeem time — refuse at create instead.
  const { data: existing, error: dupErr } = await billing
    .from("promocodes")
    .select("id")
    .ilike("code", code)
    .limit(1);
  if (dupErr) {
    return bad(dupErr.message, 500);
  }
  if ((existing ?? []).length > 0) {
    return bad(`Code ${code} already exists`, 409);
  }

  const { data: row, error } = await billing
    .from("promocodes")
    .insert({
      code,
      amount,
      coupon_type: couponType,
      max_redemptions: maxRedemptions,
      valid_till: validTillIso,
      is_active: true,
      created_by: admin.userId,
    })
    .select("id, code, amount, coupon_type, max_redemptions, valid_till")
    .single();
  if (error) {
    return bad(error.message, 500);
  }

  try {
    await AuditLogService.create({
      user_id: admin.userId,
      user_role: "admin",
      user_email: admin.email,
      action: "create",
      service_type: "billing",
      service_id: row.id as string,
      service_name: `Promocode ${code}`,
      after_state: {
        code,
        amount,
        coupon_type: couponType,
        max_redemptions: maxRedemptions,
        valid_till: validTillIso,
      },
      metadata: { via: "admin-panel", operation: "coupon.create", semantics },
    });
  } catch {
    // audit must never fail the mutation
  }

  return NextResponse.json({ success: true, promocode: row });
}

interface PatchBody {
  id?: unknown;
  is_active?: unknown;
}

export async function PATCH(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok || !admin.userId) {
    return bad("Unauthorized - Admin access required", 403);
  }

  let body: PatchBody;
  try {
    body = await request.json();
  } catch {
    return bad("Invalid JSON body");
  }

  const id = String(body.id ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id)) {
    return bad("id is required");
  }
  if (typeof body.is_active !== "boolean") {
    return bad("is_active must be a boolean");
  }

  const supabase = await createServiceClient();
  const { data: row, error } = await supabase
    .schema("billing")
    .from("promocodes")
    .update({ is_active: body.is_active, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, code, is_active")
    .single();
  if (error) {
    return bad(error.message, 500);
  }

  try {
    await AuditLogService.create({
      user_id: admin.userId,
      user_role: "admin",
      user_email: admin.email,
      action: "update",
      service_type: "billing",
      service_id: id,
      service_name: `Promocode ${row.code}`,
      after_state: { is_active: body.is_active },
      metadata: { via: "admin-panel", operation: "coupon.toggle" },
    });
  } catch {
    // audit must never fail the mutation
  }

  return NextResponse.json({ success: true, promocode: row });
}
