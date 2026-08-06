/**
 * GET  /api/inference/guardrails/policies — list org guardrail policies
 * POST /api/inference/guardrails/policies — create a new policy
 *
 * Policies are named, per-org sets of rules (jailbreak patterns, PII
 * redaction, custom regex). The Worker resolves X-Ahura-Guardrail header
 * values against these policies from KV (written-through here on create/update).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { controlPlaneAuth } from "@/lib/inference/control-plane-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { auditContextFrom, recordAudit } from "@/lib/inference/audit";
import { kvPutGuardrailPolicy } from "@/lib/inference/cf-kv";
import { ruleSchema } from "@/lib/inference/guardrail-rules";

const createSchema = z.object({
  name: z.string().min(1).max(80).regex(/^[a-z0-9][a-z0-9-_]*$/i, "Letters, digits, hyphens, underscores"),
  mode: z.enum(["off", "warn", "block", "redact"]).default("warn"),
  rules: z.array(ruleSchema).min(1).max(20),
});

export async function GET(request: NextRequest) {
  const authResult = await controlPlaneAuth(request, { session: "cookie", org: "bootstrap", requireOrgKey: true });
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;

  const rl = await limitByUser(auth.subject, { prefix: "rl:guardrail-list", limit: 30, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const org = { org_id: auth.orgId, role: auth.orgRole };

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data, error } = await supabase
    .schema("inference")
    .from("guardrail_policies")
    .select("id, name, mode, rules, created_at, updated_at")
    .eq("org_id", org.org_id)
    .order("name");

  if (error) {
    console.error("[guardrails] list error:", error);
    return NextResponse.json({ error: "Failed to list policies" }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: data ?? [] });
}

export async function POST(request: NextRequest) {
  const authResult = await controlPlaneAuth(request, { session: "cookie", org: "bootstrap", requireOrgKey: true });
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;

  const rl = await limitByUser(auth.subject, { prefix: "rl:guardrail-create", limit: 10, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation error", details: parsed.error.issues }, { status: 400 });
  }

  const org = { org_id: auth.orgId, role: auth.orgRole };
  if (auth.via === "session" && org.role !== "owner" && org.role !== "admin" && org.role !== "developer") {
    return NextResponse.json({ error: "Viewers cannot create guardrail policies" }, { status: 403 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data, error } = await supabase
    .schema("inference")
    .from("guardrail_policies")
    .insert({
      org_id: org.org_id,
      name: parsed.data.name,
      mode: parsed.data.mode,
      rules: parsed.data.rules,
      created_by: auth.userId,
    })
    .select("id, name, mode, rules, created_at, updated_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: `Policy "${parsed.data.name}" already exists` }, { status: 409 });
    }
    console.error("[guardrails] create error:", error);
    return NextResponse.json({ error: "Failed to create policy" }, { status: 500 });
  }

  // Write-through to KV so the gateway sees the new policy within the TTL
  void kvPutGuardrailPolicy(org.org_id, data.name, { name: data.name, mode: data.mode, rules: data.rules });

  const ctx = auditContextFrom(request);
  void recordAudit({
    orgId: org.org_id,
    actorUserId: auth.userId,
    action: "org.updated",
    targetType: "guardrail_policy",
    targetId: data.id,
    metadata: { event: "guardrail_policy.created", name: data.name, mode: data.mode },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return NextResponse.json({ success: true, data }, { status: 201 });
}
