/**
 * GET    /api/agents/:id — fetch one agent (org-scoped)
 * PATCH  /api/agents/:id — update an agent   (RBAC: developer+)
 * DELETE /api/agents/:id — delete an agent   (RBAC: developer+)
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateUserFromHeader } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getOrBootstrapOrgForUser } from "@/lib/inference/orgs";
import { AgentcoreAgents } from "@/lib/supabase/queries/agentcore";
import { updateAgentSchema } from "@/lib/agentcore/agent-schema";
import { AuditLogService, getAuditContext } from "@/lib/audit";

function canWrite(role: string): boolean {
  return role !== "viewer";
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authenticateUserFromHeader(request);
  if (!auth.authenticated) return auth.response;

  let org;
  try {
    org = await getOrBootstrapOrgForUser(auth.user!.id, auth.user!.email ?? "");
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Org error" }, { status: 500 });
  }

  try {
    const agent = await AgentcoreAgents.get(org.org_id, id);
    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: agent });
  } catch (err) {
    console.error("[agents] get error:", err);
    return NextResponse.json({ error: "Failed to fetch agent" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authenticateUserFromHeader(request);
  if (!auth.authenticated) return auth.response;

  const rl = await limitByUser(auth.user!.id, { prefix: "rl:agents-update", limit: 20, windowMs: 60_000 });
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateAgentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") },
      { status: 400 }
    );
  }

  if (parsed.data.model && !(await AgentcoreAgents.modelExists(parsed.data.model))) {
    return NextResponse.json({ error: `Unknown or inactive model: ${parsed.data.model}` }, { status: 400 });
  }

  const result = await AgentcoreAgents.update(org.org_id, id, parsed.data);
  if (!result.success) {
    if (result.error === "not_found") return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    if (result.code === "23505") return NextResponse.json({ error: "An agent with that name already exists" }, { status: 409 });
    return NextResponse.json({ error: result.error || "Failed to update agent" }, { status: 400 });
  }

  const auditContext = getAuditContext(request);
  await AuditLogService.create({
    user_id: auth.user!.id,
    user_role: "user",
    user_email: auth.user!.email,
    action: "update",
    service_type: "agentcore_agent",
    service_id: id,
    service_name: result.data?.name,
    after_state: result.data as unknown as Record<string, unknown>,
    ip_address: auditContext.ipAddress,
    user_agent: auditContext.userAgent,
    request_id: auditContext.requestId,
    metadata: { orgId: org.org_id, fields: Object.keys(parsed.data) },
  });

  return NextResponse.json({ success: true, data: result.data });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authenticateUserFromHeader(request);
  if (!auth.authenticated) return auth.response;

  const rl = await limitByUser(auth.user!.id, { prefix: "rl:agents-delete", limit: 20, windowMs: 60_000 });
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

  // Capture name for the audit trail before deleting.
  const existing = await AgentcoreAgents.get(org.org_id, id);
  const result = await AgentcoreAgents.remove(org.org_id, id);
  if (!result.success) {
    if (result.error === "not_found") return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    return NextResponse.json({ error: result.error || "Failed to delete agent" }, { status: 400 });
  }

  const auditContext = getAuditContext(request);
  await AuditLogService.create({
    user_id: auth.user!.id,
    user_role: "user",
    user_email: auth.user!.email,
    action: "delete",
    service_type: "agentcore_agent",
    service_id: id,
    service_name: existing?.name,
    before_state: existing as unknown as Record<string, unknown>,
    ip_address: auditContext.ipAddress,
    user_agent: auditContext.userAgent,
    request_id: auditContext.requestId,
    metadata: { orgId: org.org_id },
  });

  return NextResponse.json({ success: true });
}
