// PUT /api/admin/inference/orgs/keys — operate on one API key.
//
// The operations support actually needs: revoke a leaked key, put a cap or a
// rate limit on an uncapped one, and set/clear `is_internal_service` — which
// until now was only ever changed by a hand-written UPDATE (doc 16 §3a), and
// which decides whether a workload bills the customer org or the platform.
//
// Doc: nextstespsAI/21-admin-platform.md (§4, section A2).
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { inferenceAdminClient } from "@/lib/admin/inference-client";
import { keyIdleDays, keyRisks, keyState, type ApiKeyRow } from "@/lib/admin/inference-orgs";
import { actorContext, diffFields, keyEntry, recordAdminAudit } from "@/lib/admin/audit";

export const dynamic = "force-dynamic";

const KEY_COLUMNS =
  "id, org_id, name, key_prefix, key_last_four, key_tier, is_internal_service, rate_limit_rpm, hard_cap_cents, monthly_budget_cents, allowed_models, revoked_at, expires_at, last_used_at, created_at";

export async function PUT(req: NextRequest) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const keyId = body?.key_id;
  if (!keyId || typeof keyId !== "string") {
    return NextResponse.json({ error: "key_id is required" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};

  // Revoking is one-way on purpose: the key's plaintext is gone, so an
  // "un-revoke" would hand back a credential nobody can rotate. Issue a new one.
  if (body?.revoke === true) update.revoked_at = new Date().toISOString();

  for (const field of ["hard_cap_cents", "monthly_budget_cents", "rate_limit_rpm"] as const) {
    if (!(field in (body ?? {}))) continue;
    const raw = body[field];
    if (raw === null) {
      update[field] = null;
      continue;
    }
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) {
      return NextResponse.json({ error: `${field} must be a number ≥ 0, or null to remove it` }, { status: 400 });
    }
    update[field] = Math.round(value);
  }

  if (typeof body?.is_internal_service === "boolean") update.is_internal_service = body.is_internal_service;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const supabase = inferenceAdminClient();
  const { data: before } = await supabase
    .schema("inference")
    .from("api_keys")
    .select("org_id, hard_cap_cents, monthly_budget_cents, rate_limit_rpm, is_internal_service, revoked_at")
    .eq("id", keyId)
    .maybeSingle<Record<string, unknown>>();

  const { data, error } = await supabase
    .schema("inference")
    .from("api_keys")
    .update(update)
    .eq("id", keyId)
    .select(KEY_COLUMNS)
    .maybeSingle<ApiKeyRow>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Key not found" }, { status: 404 });

  const changes = diffFields(before ?? {}, data as unknown as Record<string, unknown>, [
    "hard_cap_cents",
    "monthly_budget_cents",
    "rate_limit_rpm",
    "is_internal_service",
    "revoked_at",
  ]);
  if (changes.length > 0) {
    void recordAdminAudit(
      keyEntry(keyId, data.org_id ?? null, changes, body?.revoke === true),
      { userId: adminCheck.userId, email: adminCheck.email },
      actorContext(req)
    );
  }

  const now = Date.now();
  return NextResponse.json({
    ...data,
    state: keyState(data, now),
    idle_days: keyIdleDays(data, now),
    risks: keyRisks(data, now),
  });
}
