/**
 * PATCH  /api/inference/prompts/[id] — update description
 * DELETE /api/inference/prompts/[id] — delete prompt + all versions (CASCADE)
 *
 * Name is intentionally immutable — it's the key used in X-Ahura-Prompt headers
 * and changing it would silently break live integrations.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { controlPlaneAuth } from "@/lib/inference/control-plane-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { auditContextFrom, recordAudit } from "@/lib/inference/audit";
import { kvDeletePrompt } from "@/lib/inference/cf-kv";

const patchSchema = z.object({
  description: z.string().max(500).nullable(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const authResult = await controlPlaneAuth(request, { session: "cookie", org: "bootstrap", requireOrgKey: true });
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;

  const rl = await limitByUser(auth.subject, { prefix: "rl:prompt-patch", limit: 30, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation error", details: parsed.error.issues }, { status: 400 });
  }

  const org = { org_id: auth.orgId, role: auth.orgRole };
  if (auth.via === "session" && org.role !== "owner" && org.role !== "admin" && org.role !== "developer") {
    return NextResponse.json({ error: "Viewers cannot update prompts" }, { status: 403 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data, error } = await supabase
    .schema("inference")
    .from("prompts")
    .update({ description: parsed.data.description })
    .eq("id", id)
    .eq("org_id", org.org_id)
    .select("id, name, description, updated_at")
    .single();

  if (error) {
    if (error.code === "PGRST116") return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
    console.error("[prompts] patch error:", error);
    return NextResponse.json({ error: "Failed to update prompt" }, { status: 500 });
  }

  const ctx = auditContextFrom(request);
  void recordAudit({
    orgId: org.org_id,
    actorUserId: auth.userId,
    action: "org.updated",
    targetType: "prompt",
    targetId: data.id,
    metadata: { event: "prompt.updated", name: data.name },
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
  const authResult = await controlPlaneAuth(request, { session: "cookie", org: "bootstrap", requireOrgKey: true });
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;

  const rl = await limitByUser(auth.subject, { prefix: "rl:prompt-delete", limit: 10, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const org = { org_id: auth.orgId, role: auth.orgRole };
  if (auth.via === "session" && org.role !== "owner" && org.role !== "admin") {
    return NextResponse.json({ error: "Only owners/admins can delete prompts" }, { status: 403 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Load prompt + all labeled versions so we can purge KV entries
  const { data: existing } = await supabase
    .schema("inference")
    .from("prompts")
    .select("name, prompt_versions(label)")
    .eq("id", id)
    .eq("org_id", org.org_id)
    .single();

  if (!existing) return NextResponse.json({ error: "Prompt not found" }, { status: 404 });

  const { error } = await supabase
    .schema("inference")
    .from("prompts")
    .delete()
    .eq("id", id)
    .eq("org_id", org.org_id);

  if (error) {
    console.error("[prompts] delete error:", error);
    return NextResponse.json({ error: "Failed to delete prompt" }, { status: 500 });
  }

  // Purge all labeled KV entries so the gateway stops resolving this prompt
  const versions = existing.prompt_versions as Array<{ label: string | null }>;
  for (const v of versions) {
    if (v.label) void kvDeletePrompt(org.org_id, existing.name, v.label);
  }

  const ctx = auditContextFrom(request);
  void recordAudit({
    orgId: org.org_id,
    actorUserId: auth.userId,
    action: "org.updated",
    targetType: "prompt",
    targetId: id,
    metadata: { event: "prompt.deleted", name: existing.name },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return NextResponse.json({ success: true });
}
