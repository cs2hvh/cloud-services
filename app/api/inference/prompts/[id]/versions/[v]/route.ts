/**
 * DELETE /api/inference/prompts/[id]/versions/[v] — delete a specific version.
 *
 * Only unlabeled versions can be deleted. A version that is deployed (has a
 * label) must be undeployed first via DELETE .../label before it can be
 * removed. This prevents silently breaking live gateway traffic.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getOrBootstrapOrgForUser } from "@/lib/inference/orgs";
import { auditContextFrom, recordAudit } from "@/lib/inference/audit";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; v: string }> }
) {
  const { id, v } = await params;
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const rl = await limitByUser(auth.user!.id, { prefix: "rl:prompt-version-delete", limit: 20, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const version = parseInt(v, 10);
  if (!Number.isFinite(version) || version < 1) {
    return NextResponse.json({ error: "Invalid version number" }, { status: 400 });
  }

  let org;
  try {
    org = await getOrBootstrapOrgForUser(auth.user!.id, auth.user!.email ?? "");
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Org error" }, { status: 500 });
  }
  if (org.role !== "owner" && org.role !== "admin") {
    return NextResponse.json({ error: "Only owners/admins can delete versions" }, { status: 403 });
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

  const { data: target } = await supabase
    .schema("inference")
    .from("prompt_versions")
    .select("id, version, label")
    .eq("prompt_id", id)
    .eq("version", version)
    .single();

  if (!target) return NextResponse.json({ error: "Version not found" }, { status: 404 });

  if (target.label) {
    return NextResponse.json(
      { error: `Version ${version} is deployed as "${target.label}". Remove the label first before deleting.` },
      { status: 409 }
    );
  }

  const { error } = await supabase
    .schema("inference")
    .from("prompt_versions")
    .delete()
    .eq("id", target.id);

  if (error) {
    console.error("[prompts] version delete error:", error);
    return NextResponse.json({ error: "Failed to delete version" }, { status: 500 });
  }

  const ctx = auditContextFrom(request);
  void recordAudit({
    orgId: org.org_id,
    actorUserId: auth.user!.id,
    action: "org.updated",
    targetType: "prompt_version",
    targetId: target.id,
    metadata: {
      event: "prompt_version.deleted",
      name: prompt.name,
      version: target.version,
    },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return NextResponse.json({ success: true });
}
