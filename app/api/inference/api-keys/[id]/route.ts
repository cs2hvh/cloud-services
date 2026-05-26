/**
 * DELETE /api/inference/api-keys/[id] — soft revoke
 * PATCH  /api/inference/api-keys/[id] — update name/budget/scope
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getActiveOrgForUser } from "@/lib/inference/orgs";
import { auditContextFrom, recordAudit, type InferenceAuditAction } from "@/lib/inference/audit";

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  allowed_models: z.array(z.string()).optional().nullable(),
  allowed_ip_cidrs: z.array(z.string()).optional().nullable(),
  zdr_enabled: z.boolean().optional(),
  semantic_cache_enabled: z.boolean().optional(),
  monthly_budget_cents: z.number().int().nonnegative().optional().nullable(),
  hard_cap_cents: z.number().int().nonnegative().optional().nullable(),
});

function isUuid(s: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(s);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Invalid API key id" }, { status: 400 });
  }

  const rl = await limitByUser(auth.user!.id, {
    prefix: "rl:inf-keys-patch",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });
  }

  const org = await getActiveOrgForUser(auth.user!.id);
  if (!org) return NextResponse.json({ error: "No inference org" }, { status: 404 });

  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation error", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data, error } = await supabase
    .schema("inference")
    .from("api_keys")
    .update(parsed.data)
    .eq("id", id)
    .eq("org_id", org.org_id)
    .is("revoked_at", null)
    .select("id, name, key_prefix, key_last_four, allowed_models, monthly_budget_cents, hard_cap_cents, zdr_enabled")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "API key not found in this org" },
      { status: 404 }
    );
  }

  // Audit — emit one event per axis changed so the audit log distinguishes
  // budget vs scope adjustments (both enum values exist in the schema).
  const changedKeys = Object.keys(parsed.data);
  const budgetChanged = changedKeys.some((k) => k === "monthly_budget_cents" || k === "hard_cap_cents");
  const scopeChanged = changedKeys.some(
    (k) =>
      k === "allowed_models" ||
      k === "allowed_ip_cidrs" ||
      k === "zdr_enabled" ||
      k === "semantic_cache_enabled" ||
      k === "name"
  );
  const ctx = auditContextFrom(request);
  const actions: InferenceAuditAction[] = [];
  if (budgetChanged) actions.push("key.budget_changed");
  if (scopeChanged) actions.push("key.scope_changed");
  for (const action of actions) {
    void recordAudit({
      orgId: org.org_id,
      actorUserId: auth.user!.id,
      action,
      targetType: "api_key",
      targetId: id,
      metadata: { changed: changedKeys, after: parsed.data },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  }

  return NextResponse.json({ success: true, data });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Invalid API key id" }, { status: 400 });
  }

  const rl = await limitByUser(auth.user!.id, {
    prefix: "rl:inf-keys-delete",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });
  }

  const org = await getActiveOrgForUser(auth.user!.id);
  if (!org) return NextResponse.json({ error: "No inference org" }, { status: 404 });
  if (org.role !== "owner" && org.role !== "admin") {
    return NextResponse.json(
      { error: "Only org owners and admins can revoke API keys" },
      { status: 403 }
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Soft revoke (set revoked_at). The edge gateway's lookup_api_key RPC
  // filters out revoked rows, so existing in-flight requests fail on
  // their next auth check. KV cache TTL (5 min) means the revocation
  // propagates within minutes.
  const { error, count } = await supabase
    .schema("inference")
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() }, { count: "exact" })
    .eq("id", id)
    .eq("org_id", org.org_id)
    .is("revoked_at", null);

  if (error) {
    console.error("[Inference Keys] revoke failed:", error);
    return NextResponse.json(
      { error: "Failed to revoke API key" },
      { status: 500 }
    );
  }
  if (!count) {
    return NextResponse.json(
      { error: "API key not found or already revoked" },
      { status: 404 }
    );
  }

  const ctx = auditContextFrom(request);
  void recordAudit({
    orgId: org.org_id,
    actorUserId: auth.user!.id,
    action: "key.revoked",
    targetType: "api_key",
    targetId: id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return NextResponse.json({ success: true, revoked_id: id });
}
