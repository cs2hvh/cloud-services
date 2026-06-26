/**
 * PATCH /api/inference/guardrails/policies/[id] — update mode or rules
 * DELETE /api/inference/guardrails/policies/[id] — remove a policy
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getOrBootstrapOrgForUser } from "@/lib/inference/orgs";
import { auditContextFrom, recordAudit } from "@/lib/inference/audit";
import { kvPutGuardrailPolicy, kvDeleteGuardrailPolicy } from "@/lib/inference/cf-kv";
import { ruleSchema } from "@/lib/inference/guardrail-rules";

const patchSchema = z.object({
  mode: z.enum(["off", "warn", "block", "redact"]).optional(),
  rules: z.array(ruleSchema).min(1).max(20).optional(),
}).refine((d) => d.mode !== undefined || d.rules !== undefined, { message: "Provide mode or rules" });

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const rl = await limitByUser(auth.user!.id, { prefix: "rl:guardrail-patch", limit: 20, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation error", details: parsed.error.issues }, { status: 400 });
  }

  let org;
  try {
    org = await getOrBootstrapOrgForUser(auth.user!.id, auth.user!.email ?? "");
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Org error" }, { status: 500 });
  }
  if (org.role !== "owner" && org.role !== "admin" && org.role !== "developer") {
    return NextResponse.json({ error: "Viewers cannot update guardrail policies" }, { status: 403 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const updates: Record<string, unknown> = {};
  if (parsed.data.mode !== undefined) updates.mode = parsed.data.mode;
  if (parsed.data.rules !== undefined) updates.rules = parsed.data.rules;

  const { data, error } = await supabase
    .schema("inference")
    .from("guardrail_policies")
    .update(updates)
    .eq("id", id)
    .eq("org_id", org.org_id)
    .select("id, name, mode, rules, updated_at")
    .single();

  if (error) {
    if (error.code === "PGRST116") return NextResponse.json({ error: "Policy not found" }, { status: 404 });
    console.error("[guardrails] update error:", error);
    return NextResponse.json({ error: "Failed to update policy" }, { status: 500 });
  }

  void kvPutGuardrailPolicy(org.org_id, data.name, { name: data.name, mode: data.mode, rules: data.rules });

  const ctx = auditContextFrom(request);
  void recordAudit({
    orgId: org.org_id,
    actorUserId: auth.user!.id,
    action: "org.updated",
    targetType: "guardrail_policy",
    targetId: data.id,
    metadata: { event: "guardrail_policy.updated", name: data.name, ...updates },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return NextResponse.json({ success: true, data });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const rl = await limitByUser(auth.user!.id, { prefix: "rl:guardrail-delete", limit: 10, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  let org;
  try {
    org = await getOrBootstrapOrgForUser(auth.user!.id, auth.user!.email ?? "");
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Org error" }, { status: 500 });
  }
  if (org.role !== "owner" && org.role !== "admin") {
    return NextResponse.json({ error: "Only owners/admins can delete guardrail policies" }, { status: 403 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: existing } = await supabase
    .schema("inference")
    .from("guardrail_policies")
    .select("name")
    .eq("id", id)
    .eq("org_id", org.org_id)
    .single();

  if (!existing) return NextResponse.json({ error: "Policy not found" }, { status: 404 });

  const { error } = await supabase
    .schema("inference")
    .from("guardrail_policies")
    .delete()
    .eq("id", id)
    .eq("org_id", org.org_id);

  if (error) {
    console.error("[guardrails] delete error:", error);
    return NextResponse.json({ error: "Failed to delete policy" }, { status: 500 });
  }

  void kvDeleteGuardrailPolicy(org.org_id, existing.name);

  const ctx = auditContextFrom(request);
  void recordAudit({
    orgId: org.org_id,
    actorUserId: auth.user!.id,
    action: "org.updated",
    targetType: "guardrail_policy",
    targetId: id,
    metadata: { event: "guardrail_policy.deleted", name: existing.name },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return NextResponse.json({ success: true });
}
