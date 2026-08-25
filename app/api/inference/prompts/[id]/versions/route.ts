/**
 * GET  /api/inference/prompts/[id]/versions — list versions for a prompt
 * POST /api/inference/prompts/[id]/versions — create a new version
 *
 * A version is an immutable snapshot of a template + model defaults.
 * To make a version live, assign a label via the PATCH .../label endpoint.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { controlPlaneAuth } from "@/lib/inference/control-plane-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { auditContextFrom, recordAudit } from "@/lib/inference/audit";

/** A message template — supports {{variable}} interpolation. */
const messageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string().min(1).max(32_000),
});

const createVersionSchema = z.object({
  template: z.array(messageSchema).min(1).max(50),
  model_defaults: z
    .object({
      temperature: z.number().min(0).max(2).optional(),
      max_tokens: z.number().int().positive().max(100_000).optional(),
      top_p: z.number().min(0).max(1).optional(),
    })
    .optional()
    .default({}),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const authResult = await controlPlaneAuth(request, { session: "cookie", org: "bootstrap", requireOrgKey: true });
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;

  const rl = await limitByUser(auth.subject, { prefix: "rl:prompt-versions-list", limit: 60, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const org = { org_id: auth.orgId, role: auth.orgRole };

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Verify prompt belongs to org
  const { data: prompt } = await supabase
    .schema("inference")
    .from("prompts")
    .select("id, name")
    .eq("id", id)
    .eq("org_id", org.org_id)
    .single();

  if (!prompt) return NextResponse.json({ error: "Prompt not found" }, { status: 404 });

  const { data, error } = await supabase
    .schema("inference")
    .from("prompt_versions")
    .select("id, version, template, model_defaults, label, created_at")
    .eq("prompt_id", id)
    .order("version", { ascending: false });

  if (error) {
    console.error("[prompts] list versions error:", error);
    return NextResponse.json({ error: "Failed to list versions" }, { status: 500 });
  }

  return NextResponse.json({ success: true, prompt, data: data ?? [] });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const authResult = await controlPlaneAuth(request, { session: "cookie", org: "bootstrap", requireOrgKey: true });
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;

  const rl = await limitByUser(auth.subject, { prefix: "rl:prompt-version-create", limit: 30, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const body = await request.json();
  const parsed = createVersionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation error", details: parsed.error.issues }, { status: 400 });
  }

  const org = { org_id: auth.orgId, role: auth.orgRole };
  if (auth.via === "session" && org.role !== "owner" && org.role !== "admin" && org.role !== "developer") {
    return NextResponse.json({ error: "Viewers cannot create prompt versions" }, { status: 403 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: prompt } = await supabase
    .schema("inference")
    .from("prompts")
    .select("id, name")
    .eq("id", id)
    .eq("org_id", org.org_id)
    .single();

  if (!prompt) return NextResponse.json({ error: "Prompt not found" }, { status: 404 });

  // Determine next version number (max + 1)
  const { data: latest } = await supabase
    .schema("inference")
    .from("prompt_versions")
    .select("version")
    .eq("prompt_id", id)
    .order("version", { ascending: false })
    .limit(1)
    .single();

  const nextVersion = (latest?.version ?? 0) + 1;

  const { data, error } = await supabase
    .schema("inference")
    .from("prompt_versions")
    .insert({
      prompt_id: id,
      version: nextVersion,
      template: parsed.data.template,
      model_defaults: parsed.data.model_defaults ?? {},
      created_by: auth.userId,
    })
    .select("id, version, template, model_defaults, label, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Version conflict — another version was created concurrently, please retry" }, { status: 409 });
    }
    console.error("[prompts] create version error:", error);
    return NextResponse.json({ error: "Failed to create version" }, { status: 500 });
  }

  const ctx = auditContextFrom(request);
  void recordAudit({
    orgId: org.org_id,
    actorUserId: auth.userId,
    action: "org.updated",
    targetType: "prompt_version",
    targetId: data.id,
    metadata: { event: "prompt_version.created", name: prompt.name, version: data.version },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return NextResponse.json({ success: true, data }, { status: 201 });
}
