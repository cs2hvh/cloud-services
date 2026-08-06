/**
 * PUT /api/inference/prompts/[id]/versions/[v]/label — assign a label to a version.
 *
 * Assigning "production" to version 3 means the gateway resolves
 * X-Ahura-Prompt: my-prompt@production → version 3's template.
 *
 * A label can only be held by one version at a time — the existing holder's
 * label is cleared before the new assignment.
 *
 * After DB update, the new version is written-through to CF KV so the
 * gateway picks it up within one TTL (5 min).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { controlPlaneAuth } from "@/lib/inference/control-plane-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { auditContextFrom, recordAudit } from "@/lib/inference/audit";
import { kvPutPrompt, kvDeletePrompt } from "@/lib/inference/cf-kv";

const schema = z.object({
  label: z.string().min(1).max(60).regex(/^[a-z0-9][a-z0-9-_]*$/i, "Letters, digits, hyphens, underscores"),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; v: string }> }
) {
  const { id, v } = await params;
  const authResult = await controlPlaneAuth(request, { session: "cookie", org: "bootstrap", requireOrgKey: true });
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;

  const rl = await limitByUser(auth.subject, { prefix: "rl:prompt-label", limit: 20, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation error", details: parsed.error.issues }, { status: 400 });
  }

  const version = parseInt(v, 10);
  if (!Number.isFinite(version) || version < 1) {
    return NextResponse.json({ error: "Invalid version number" }, { status: 400 });
  }

  const org = { org_id: auth.orgId, role: auth.orgRole };
  if (auth.via === "session" && org.role !== "owner" && org.role !== "admin" && org.role !== "developer") {
    return NextResponse.json({ error: "Viewers cannot assign labels" }, { status: 403 });
  }

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

  // Load target version
  const { data: targetVersion } = await supabase
    .schema("inference")
    .from("prompt_versions")
    .select("id, version, template, model_defaults, label")
    .eq("prompt_id", id)
    .eq("version", version)
    .single();

  if (!targetVersion) return NextResponse.json({ error: "Version not found" }, { status: 404 });

  // Clear existing label holder (ignore not-found)
  await supabase
    .schema("inference")
    .from("prompt_versions")
    .update({ label: null })
    .eq("prompt_id", id)
    .eq("label", parsed.data.label)
    .neq("version", version);

  // Assign label to target version
  const { error } = await supabase
    .schema("inference")
    .from("prompt_versions")
    .update({ label: parsed.data.label })
    .eq("id", targetVersion.id);

  if (error) {
    console.error("[prompts] label assign error:", error);
    return NextResponse.json({ error: "Failed to assign label" }, { status: 500 });
  }

  // If this version previously held a different label, remove that stale KV entry.
  if (targetVersion.label && targetVersion.label !== parsed.data.label) {
    void kvDeletePrompt(org.org_id, prompt.name, targetVersion.label as string);
  }

  // Write-through to CF KV so the gateway resolves this label immediately
  void kvPutPrompt(org.org_id, prompt.name, parsed.data.label, {
    promptId: id,
    version: targetVersion.version,
    template: targetVersion.template as Array<{ role: string; content: string }>,
    modelDefaults: (targetVersion.model_defaults as Record<string, unknown>) ?? {},
  });

  const ctx = auditContextFrom(request);
  void recordAudit({
    orgId: org.org_id,
    actorUserId: auth.userId,
    action: "org.updated",
    targetType: "prompt_version",
    targetId: targetVersion.id,
    metadata: {
      event: "prompt_version.labeled",
      name: prompt.name,
      version: targetVersion.version,
      label: parsed.data.label,
    },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return NextResponse.json({
    success: true,
    data: {
      prompt_id: id,
      prompt_name: prompt.name,
      version: targetVersion.version,
      label: parsed.data.label,
    },
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; v: string }> }
) {
  const { id, v } = await params;
  const authResult = await controlPlaneAuth(request, { session: "cookie", org: "bootstrap", requireOrgKey: true });
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;

  const rl = await limitByUser(auth.subject, { prefix: "rl:prompt-label", limit: 20, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const version = parseInt(v, 10);
  if (!Number.isFinite(version) || version < 1) {
    return NextResponse.json({ error: "Invalid version number" }, { status: 400 });
  }

  const org = { org_id: auth.orgId, role: auth.orgRole };
  if (auth.via === "session" && org.role !== "owner" && org.role !== "admin" && org.role !== "developer") {
    return NextResponse.json({ error: "Viewers cannot remove labels" }, { status: 403 });
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

  const { data: target } = await supabase
    .schema("inference")
    .from("prompt_versions")
    .select("id, version, label")
    .eq("prompt_id", id)
    .eq("version", version)
    .single();

  if (!target) return NextResponse.json({ error: "Version not found" }, { status: 404 });
  if (!target.label) return NextResponse.json({ error: "This version has no label to remove" }, { status: 409 });

  const removedLabel = target.label as string;

  const { error } = await supabase
    .schema("inference")
    .from("prompt_versions")
    .update({ label: null })
    .eq("id", target.id);

  if (error) {
    console.error("[prompts] label remove error:", error);
    return NextResponse.json({ error: "Failed to remove label" }, { status: 500 });
  }

  // Purge from KV so the gateway stops resolving this label immediately
  void kvDeletePrompt(org.org_id, prompt.name, removedLabel);

  const ctx = auditContextFrom(request);
  void recordAudit({
    orgId: org.org_id,
    actorUserId: auth.userId,
    action: "org.updated",
    targetType: "prompt_version",
    targetId: target.id,
    metadata: {
      event: "prompt_version.undeployed",
      name: prompt.name,
      version: target.version,
      label: removedLabel,
    },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return NextResponse.json({ success: true, data: { removed_label: removedLabel } });
}
