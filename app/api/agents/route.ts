/**
 * GET  /api/agents — list the org's agentcore agents
 * POST /api/agents — create a new agent  (RBAC: developer+ to write)
 *
 * Org-scoped (not user-scoped like the v1 ai-agents product): the caller's
 * active inference org owns the agent. Writes require a non-viewer role.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { actingUserId, controlPlaneAuth } from "@/lib/inference/control-plane-auth";
import { modelScopeRefusal } from "@/lib/inference/api-key-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { AgentcoreAgents } from "@/lib/supabase/queries/agentcore";
import { createAgentSchema } from "@/lib/agentcore/agent-schema";
import { AuditLogService, getAuditContext } from "@/lib/audit";
import { NotificationService, createServiceNotification } from "@/lib/notifications/service";

/** Writes require developer+ — viewers are read-only. */
function canWrite(role: string): boolean {
  return role !== "viewer";
}

/**
 * Active access-key counts per agent, one batch query for the whole org.
 * Found missing during the "whole agent UI" gap review (2026-07-08): you
 * couldn't tell which agents were actually externally distributed (had a
 * live public key) without opening each one individually.
 */
async function keyCountsByAgent(orgId: string): Promise<Map<string, { total: number; public: number }>> {
  const counts = new Map<string, { total: number; public: number }>();
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const { data } = await supabase
    .schema("inference")
    .from("api_keys")
    .select("agent_id, key_tier")
    .eq("org_id", orgId)
    .is("revoked_at", null)
    .not("agent_id", "is", null)
    .returns<{ agent_id: string; key_tier: string }[]>();
  for (const k of data ?? []) {
    const cur = counts.get(k.agent_id) ?? { total: 0, public: 0 };
    cur.total += 1;
    if (k.key_tier === "public") cur.public += 1;
    counts.set(k.agent_id, cur);
  }
  return counts;
}

export async function GET(request: NextRequest) {
  const authResult = await controlPlaneAuth(request, { session: "header", org: "bootstrap" });
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;

  const rl = await limitByUser(auth.subject, { prefix: "rl:agents-list", limit: 30, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const org = { org_id: auth.orgId, role: auth.orgRole };

  try {
    const [agents, keyCounts] = await Promise.all([
      AgentcoreAgents.list(org.org_id),
      keyCountsByAgent(org.org_id),
    ]);
    // An agent-scoped key gets a one-element list, not the org's roster. The
    // filter is applied here rather than passed to the query so there is no
    // path where forgetting a parameter widens it back out.
    const visible = auth.apiKey?.agentId ? agents.filter((a) => a.id === auth.apiKey!.agentId) : agents;
    const data = visible.map((a) => ({
      ...a,
      access_key_count: keyCounts.get(a.id)?.total ?? 0,
      has_public_key: (keyCounts.get(a.id)?.public ?? 0) > 0,
    }));
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[agents] list error:", err);
    return NextResponse.json({ error: "Failed to list agents" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authResult = await controlPlaneAuth(request, { session: "header", org: "bootstrap", requireOrgKey: true });
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;

  const rl = await limitByUser(auth.subject, { prefix: "rl:agents-create", limit: 10, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const org = { org_id: auth.orgId, role: auth.orgRole };

  if (auth.via === "session" && !canWrite(org.role ?? "")) {
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

  // A key can be restricted to specific models; the gateway refuses anything
  // outside that list (checkModelScope). Same rule here or the restriction only
  // holds on one of the two surfaces.
  if (auth.apiKey) {
    const refusal = modelScopeRefusal(auth.apiKey, d.model);
    if (refusal) return NextResponse.json({ error: refusal, code: "model_not_allowed" }, { status: 403 });
  }

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
    created_by: (await actingUserId(auth))!,
  });

  if (!result.success) {
    if (result.code === "23505") {
      return NextResponse.json({ error: `An agent named "${d.name}" already exists` }, { status: 409 });
    }
    return NextResponse.json({ error: result.error || "Failed to create agent" }, { status: 400 });
  }

  const auditContext = getAuditContext(request);
  await AuditLogService.create({
    user_id: (await actingUserId(auth))!,
    user_role: "user",
    user_email: auth.email ?? undefined,
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
      userId: (await actingUserId(auth))!,
      serviceType: "agentcore_agent",
      action: "created",
      serviceName: d.name,
      serviceId: result.data?.id,
      metadata: { model: d.model },
    })
  );

  return NextResponse.json({ success: true, data: result.data }, { status: 201 });
}
