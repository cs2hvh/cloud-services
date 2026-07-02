/**
 * GET  /api/agents — list the org's agentcore agents
 * POST /api/agents — create a new agent  (RBAC: developer+ to write)
 *
 * Org-scoped (not user-scoped like the v1 ai-agents product): the caller's
 * active inference org owns the agent. Writes require a non-viewer role.
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateUserFromHeader } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getOrBootstrapOrgForUser } from "@/lib/inference/orgs";
import { AgentcoreAgents } from "@/lib/supabase/queries/agentcore";
import { createAgentSchema } from "@/lib/agentcore/agent-schema";
import { AuditLogService, getAuditContext } from "@/lib/audit";
import { NotificationService, createServiceNotification } from "@/lib/notifications/service";

/** Writes require developer+ — viewers are read-only. */
function canWrite(role: string): boolean {
  return role !== "viewer";
}

export async function GET(request: NextRequest) {
  const auth = await authenticateUserFromHeader(request);
  if (!auth.authenticated) return auth.response;

  const rl = await limitByUser(auth.user!.id, { prefix: "rl:agents-list", limit: 30, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  let org;
  try {
    org = await getOrBootstrapOrgForUser(auth.user!.id, auth.user!.email ?? "");
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Org error" }, { status: 500 });
  }

  try {
    const agents = await AgentcoreAgents.list(org.org_id);
    return NextResponse.json({ success: true, data: agents });
  } catch (err) {
    console.error("[agents] list error:", err);
    return NextResponse.json({ error: "Failed to list agents" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await authenticateUserFromHeader(request);
  if (!auth.authenticated) return auth.response;

  const rl = await limitByUser(auth.user!.id, { prefix: "rl:agents-create", limit: 10, windowMs: 60_000 });
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

  const parsed = createAgentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") },
      { status: 400 }
    );
  }
  const d = parsed.data;

  if (!(await AgentcoreAgents.modelExists(d.model))) {
    return NextResponse.json({ error: `Unknown or inactive model: ${d.model}` }, { status: 400 });
  }

  const result = await AgentcoreAgents.create({
    org_id: org.org_id,
    name: d.name,
    model: d.model,
    system_prompt: d.system_prompt ?? null,
    tools: d.tools ?? [],
    memory_policy: d.memory_policy ?? {},
    guardrail: d.guardrail ?? "warn",
    max_steps: d.max_steps ?? 12,
    max_cost_cents: d.max_cost_cents ?? 100,
    created_by: auth.user!.id,
  });

  if (!result.success) {
    if (result.code === "23505") {
      return NextResponse.json({ error: `An agent named "${d.name}" already exists` }, { status: 409 });
    }
    return NextResponse.json({ error: result.error || "Failed to create agent" }, { status: 400 });
  }

  const auditContext = getAuditContext(request);
  await AuditLogService.create({
    user_id: auth.user!.id,
    user_role: "user",
    user_email: auth.user!.email,
    action: "create",
    service_type: "agentcore_agent",
    service_id: result.data?.id,
    service_name: d.name,
    after_state: result.data as unknown as Record<string, unknown>,
    ip_address: auditContext.ipAddress,
    user_agent: auditContext.userAgent,
    request_id: auditContext.requestId,
    metadata: { orgId: org.org_id, model: d.model, toolCount: d.tools?.length ?? 0 },
  });

  await NotificationService.create(
    createServiceNotification({
      userId: auth.user!.id,
      serviceType: "agentcore_agent",
      action: "created",
      serviceName: d.name,
      serviceId: result.data?.id,
      metadata: { model: d.model },
    })
  );

  return NextResponse.json({ success: true, data: result.data }, { status: 201 });
}
