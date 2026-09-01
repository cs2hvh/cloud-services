import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { AuditLogService } from "@/lib/audit/service";
import { DISCOUNT_KINDS } from "@admin/lib/offers";

export const dynamic = "force-dynamic";

/**
 * Creates a v2 rate discount (billing.discounts). Direct insert is the
 * agreed interim path — the billing lane offers a set_discount() wrapper
 * when wanted. Scope columns use NULL for "any" (deliberately not '*',
 * which is a real plan_key). Every create is audited.
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok || !admin.userId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized - Admin access required" },
      { status: 403 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const bad = (error: string) =>
    NextResponse.json({ success: false, error }, { status: 400 });

  const name = String(body.name ?? "").trim();
  const kind = String(body.kind ?? "") as (typeof DISCOUNT_KINDS)[number];
  const value = Number(body.value);
  const code = body.code ? String(body.code).trim().toUpperCase() : null;
  const serviceType = body.serviceType ? String(body.serviceType).trim() : null;
  const planKey = body.planKey ? String(body.planKey).trim() : null;
  const startsAt = body.startsAt ? String(body.startsAt) : null;
  const endsAt = body.endsAt ? String(body.endsAt) : null;
  const maxGrants = body.maxGrants === undefined || body.maxGrants === null || body.maxGrants === ""
    ? null
    : Number(body.maxGrants);
  const priority = Number(body.priority ?? 0);

  if (!name || name.length > 120) return bad("name is required (max 120 chars)");
  if (!DISCOUNT_KINDS.includes(kind)) return bad("Unknown kind");
  if (!Number.isFinite(value) || value <= 0) return bad("value must be positive");
  if (kind === "percent" && value > 100) return bad("percent cannot exceed 100");
  if (code && !/^[A-Z0-9_-]{3,40}$/.test(code)) {
    return bad("code must be 3-40 chars, A-Z 0-9 _ -");
  }
  if (maxGrants !== null && (!Number.isInteger(maxGrants) || maxGrants < 1)) {
    return bad("maxGrants must be a positive integer");
  }
  if (!Number.isInteger(priority)) return bad("priority must be an integer");
  if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
    return bad("ends_at must be after starts_at");
  }

  try {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .schema("billing")
      .from("discounts")
      .insert({
        code,
        name,
        description: body.description ? String(body.description).slice(0, 500) : null,
        kind,
        value,
        service_type: serviceType,
        plan_key: planKey,
        starts_at: startsAt,
        ends_at: endsAt,
        max_grants: maxGrants,
        priority,
        is_active: true,
        created_by: admin.userId,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[Admin Discounts] insert failed:", error.message);
      return NextResponse.json(
        { success: false, error: "Discount create failed" },
        { status: 500 },
      );
    }

    await AuditLogService.create({
      user_id: admin.userId,
      user_role: "admin",
      user_email: admin.email,
      action: "create",
      service_type: "discount",
      service_id: data.id,
      service_name: name,
      after_state: {
        code,
        kind,
        value,
        service_type: serviceType ?? "(any)",
        plan_key: planKey ?? "(any)",
        starts_at: startsAt,
        ends_at: endsAt,
        max_grants: maxGrants,
        priority,
      },
      metadata: { via: "admin-panel" },
    });

    return NextResponse.json({ success: true, id: data.id });
  } catch (err) {
    console.error("[Admin Discounts] unexpected error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
