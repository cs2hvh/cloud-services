/**
 * POST /api/agents/[id]/keys/[keyId]/rotate — rotate an agent-scoped access key.
 *
 * Doc 15 §10 gap: the only way to replace a key was delete-and-recreate,
 * which breaks a live embed/integration the instant the old key is deleted —
 * "needs its own semantics for not breaking a live embed mid-rotation."
 *
 * Design: mint a brand-new key with the same tier/origins/caps, then instead
 * of revoking the OLD key immediately, set its `expires_at` to a short grace
 * window (default 24h). The gateway's existing `lookup_api_key` RPC already
 * treats an expired key as invalid — this reuses that exact mechanism, so no
 * new enforcement code or cron is needed. The old key keeps working for the
 * grace window (whatever's currently deployed with it doesn't break the
 * instant this call returns), then stops on its own.
 *
 * If the old key already had a tighter expires_at than the grace window would
 * produce, that tighter deadline wins — rotating a key must never LOOSEN an
 * expiry the customer already set.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { authenticateUserFromHeader } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getOrBootstrapOrgForUser } from "@/lib/inference/orgs";
import { AgentcoreAgents } from "@/lib/supabase/queries/agentcore";
import { generateApiKey } from "@/lib/inference/api-key-crypto";
import { auditContextFrom, recordAudit } from "@/lib/inference/audit";

const DEFAULT_GRACE_HOURS = 24;

const rotateSchema = z.object({
  // 0 = revoke the old key immediately (no grace window) — an explicit,
  // deliberate choice, not the default, for a customer who KNOWS the key
  // already leaked and wants it dead now rather than in 24h.
  grace_hours: z.number().min(0).max(168).optional(),
});

function canWrite(role: string): boolean {
  return role !== "viewer";
}

function isUuid(s: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(s);
}

function supabaseService() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

interface OldKeyRow {
  id: string;
  name: string;
  key_tier: "private" | "public";
  allowed_origins: string[] | null;
  rate_limit_rpm: number | null;
  monthly_budget_cents: number | null;
  hard_cap_cents: number | null;
  expires_at: string | null;
  revoked_at: string | null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; keyId: string }> }
) {
  const auth = await authenticateUserFromHeader(request);
  if (!auth.authenticated) return auth.response;

  const { id: agentId, keyId } = await params;
  if (!isUuid(keyId)) {
    return NextResponse.json({ error: "Invalid key id" }, { status: 400 });
  }

  const rl = await limitByUser(auth.user!.id, { prefix: "rl:agent-keys-rotate", limit: 10, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  let org;
  try {
    org = await getOrBootstrapOrgForUser(auth.user!.id, auth.user!.email ?? "");
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Org error" }, { status: 500 });
  }
  if (!canWrite(org.role)) {
    return NextResponse.json({ error: "Insufficient role — developer or higher required" }, { status: 403 });
  }

  const agent = await AgentcoreAgents.get(org.org_id, agentId);
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  let body: unknown = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = rotateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") },
      { status: 400 }
    );
  }
  const graceHours = parsed.data.grace_hours ?? DEFAULT_GRACE_HOURS;

  const supabase = supabaseService();

  const { data: oldKey, error: fetchErr } = await supabase
    .schema("inference")
    .from("api_keys")
    .select("id, name, key_tier, allowed_origins, rate_limit_rpm, monthly_budget_cents, hard_cap_cents, expires_at, revoked_at")
    .eq("id", keyId)
    .eq("org_id", org.org_id)
    .eq("agent_id", agentId)
    .maybeSingle<OldKeyRow>();

  if (fetchErr || !oldKey) {
    return NextResponse.json({ error: "Access key not found for this agent" }, { status: 404 });
  }
  if (oldKey.revoked_at || (oldKey.expires_at && new Date(oldKey.expires_at) <= new Date())) {
    return NextResponse.json({ error: "Key is already revoked or expired — create a new one instead" }, { status: 409 });
  }

  // Never loosen an expiry the customer already set — the tighter of the two wins.
  const graceDeadline = new Date(Date.now() + graceHours * 60 * 60 * 1000);
  const existingExpiry = oldKey.expires_at ? new Date(oldKey.expires_at) : null;
  const oldKeyNewExpiry = existingExpiry && existingExpiry < graceDeadline ? existingExpiry : graceDeadline;

  const { fullKey, keyPrefix, keyLastFour, keyHash } = generateApiKey(oldKey.key_tier);

  const { data: newKeyRow, error: insertErr } = await supabase
    .schema("inference")
    .from("api_keys")
    .insert({
      org_id: org.org_id,
      created_by_user_id: auth.user!.id,
      agent_id: agentId,
      name: oldKey.name,
      key_prefix: keyPrefix,
      key_last_four: keyLastFour,
      key_hash: keyHash,
      key_tier: oldKey.key_tier,
      allowed_origins: oldKey.allowed_origins,
      rate_limit_rpm: oldKey.rate_limit_rpm,
      monthly_budget_cents: oldKey.monthly_budget_cents,
      hard_cap_cents: oldKey.hard_cap_cents,
    })
    .select("id, name, key_prefix, key_last_four, created_at")
    .single();

  if (insertErr || !newKeyRow) {
    console.error("[agent-keys] rotate insert error:", insertErr);
    return NextResponse.json({ error: "Failed to create the replacement key" }, { status: 500 });
  }

  // Only now touch the old row — if this fails, the customer still has a
  // working new key and can retry the rotation of the old one, or just
  // revoke it manually; a partial failure here never leaves them locked out.
  const { error: expireErr } = await supabase
    .schema("inference")
    .from("api_keys")
    .update({ expires_at: oldKeyNewExpiry.toISOString() })
    .eq("id", keyId)
    .eq("org_id", org.org_id)
    .is("revoked_at", null);

  if (expireErr) {
    console.error("[agent-keys] rotate: new key created but failed to set old key's expiry:", expireErr);
  }

  const ctx = auditContextFrom(request);
  void recordAudit({
    orgId: org.org_id,
    actorUserId: auth.user!.id,
    action: "key.rotated",
    targetType: "api_key",
    targetId: keyId,
    metadata: {
      agent_id: agentId,
      agent_name: agent.name,
      new_key_id: newKeyRow.id,
      old_key_expires_at: oldKeyNewExpiry.toISOString(),
      grace_hours: graceHours,
    },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return NextResponse.json(
    {
      success: true,
      data: {
        new_key: { ...newKeyRow, api_key: fullKey },
        old_key_id: keyId,
        old_key_expires_at: oldKeyNewExpiry.toISOString(),
      },
      message: "Copy the new key now — it will never be shown again. The old key keeps working until it expires.",
    },
    { status: 201 }
  );
}
