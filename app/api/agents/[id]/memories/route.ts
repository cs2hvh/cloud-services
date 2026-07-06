/**
 * DELETE /api/agents/:id/memories — purge an agent's long-term memory (S5).
 *
 * Right-to-erasure (DPDP/GDPR): removes every stored memory for the agent,
 * org-scoped. Session-authed, developer+ only, audited. Idempotent — purging an
 * agent with no memories returns { purged: 0 }.
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateUserFromHeader } from "@/lib/auth/server-auth";
import { getOrBootstrapOrgForUser } from "@/lib/inference/orgs";
import { AgentcoreAgents, AgentcoreMemories } from "@/lib/supabase/queries/agentcore";
import { AuditLogService, getAuditContext } from "@/lib/audit";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authenticateUserFromHeader(request);
  if (!auth.authenticated) return auth.response;

  let org;
  try {
    org = await getOrBootstrapOrgForUser(auth.user!.id, auth.user!.email ?? "");
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Org error" }, { status: 500 });
  }
  if (org.role === "viewer") {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  // Agent must belong to this org (else 404 — no cross-org purge).
  const agent = await AgentcoreAgents.get(org.org_id, id);
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  const res = await AgentcoreMemories.purgeForAgent(org.org_id, id);
  if (!res.success) {
    return NextResponse.json({ error: res.error ?? "Purge failed" }, { status: 500 });
  }

  try {
    const auditContext = getAuditContext(request);
    await AuditLogService.create({
      user_id: auth.user!.id,
      user_role: "user",
      user_email: auth.user!.email,
      action: "delete",
      service_type: "agentcore_agent",
      service_id: id,
      service_name: agent.name,
      ip_address: auditContext.ipAddress,
      user_agent: auditContext.userAgent,
      request_id: auditContext.requestId,
      metadata: { orgId: org.org_id, purged: res.purged ?? 0, op: "memory_purge" },
    });
  } catch { /* audit is best-effort */ }

  return NextResponse.json({ success: true, purged: res.purged ?? 0 });
}
