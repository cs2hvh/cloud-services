/**
 * DELETE /api/agents/[id]/keys/[keyId] — revoke an agent-scoped access key
 * (doc: manager ask 2026-07-08). Soft delete (revoked_at), scoped by BOTH
 * org_id and agent_id so a key can't be revoked through the wrong agent's
 * page even within the same org.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { controlPlaneAuth } from "@/lib/inference/control-plane-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { auditContextFrom, recordAudit } from "@/lib/inference/audit";

function canWrite(role: string): boolean {
  return role !== "viewer";
}

function isUuid(s: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(s);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; keyId: string }> }
) {
  const authResult = await controlPlaneAuth(request, { session: "header", org: "bootstrap", requireOrgKey: true });
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;

  const { id: agentId, keyId } = await params;
  if (!isUuid(keyId)) {
    return NextResponse.json({ error: "Invalid key id" }, { status: 400 });
  }

  const rl = await limitByUser(auth.subject, { prefix: "rl:agent-keys-delete", limit: 20, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const org = { org_id: auth.orgId, role: auth.orgRole };
  if (auth.via === "session" && !canWrite(org.role ?? "")) {
    return NextResponse.json({ error: "Insufficient role — developer or higher required" }, { status: 403 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data, error } = await supabase
    .schema("inference")
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", keyId)
    .eq("org_id", org.org_id)
    .eq("agent_id", agentId)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[agent-keys] revoke error:", error);
    return NextResponse.json({ error: "Failed to revoke access key" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Access key not found for this agent" }, { status: 404 });
  }

  const ctx = auditContextFrom(request);
  void recordAudit({
    orgId: org.org_id,
    actorUserId: auth.userId,
    action: "key.revoked",
    targetType: "api_key",
    targetId: keyId,
    metadata: { agent_id: agentId, scoped: true },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return NextResponse.json({ success: true, revoked_id: keyId });
}
