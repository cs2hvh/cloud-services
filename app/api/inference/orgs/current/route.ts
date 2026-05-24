/**
 * GET   /api/inference/orgs/current — fetch the caller's active org with stats
 * PATCH /api/inference/orgs/current — update name / zdr_default / region_pin
 *                                     (admin/owner only)
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getOrBootstrapOrgForUser } from "@/lib/inference/orgs";
import { auditContextFrom, recordAudit } from "@/lib/inference/audit";

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  zdr_default: z.boolean().optional(),
  region_pin: z.enum(["us", "eu", "asia"]).nullable().optional(),
});

export async function GET() {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const rl = await limitByUser(auth.user!.id, {
    prefix: "rl:inf-org-get",
    limit: 60,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });
  }

  let org;
  try {
    org = await getOrBootstrapOrgForUser(auth.user!.id, auth.user!.email ?? "");
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Org resolution failed" },
      { status: 500 }
    );
  }

  // Pull richer fields + counts for the settings page
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const [{ data: orgRow }, { count: keyCount }, { count: memberCount }, { count: byokCount }] =
    await Promise.all([
      supabase
        .schema("inference")
        .from("orgs")
        .select("id, slug, name, zdr_default, region_pin, owner_user_id, created_at, updated_at")
        .eq("id", org.org_id)
        .maybeSingle(),
      supabase
        .schema("inference")
        .from("api_keys")
        .select("id", { count: "exact", head: true })
        .eq("org_id", org.org_id)
        .is("revoked_at", null),
      supabase
        .schema("inference")
        .from("org_members")
        .select("id", { count: "exact", head: true })
        .eq("org_id", org.org_id)
        .eq("status", "active"),
      supabase
        .schema("inference")
        .from("byok_keys")
        .select("id", { count: "exact", head: true })
        .eq("org_id", org.org_id),
    ]);

  return NextResponse.json({
    success: true,
    org: {
      id: org.org_id,
      slug: org.org_slug,
      name: orgRow?.name ?? org.org_name,
      role: org.role,
      zdr_default: orgRow?.zdr_default ?? org.zdr_default,
      region_pin: orgRow?.region_pin ?? null,
      owner_user_id: orgRow?.owner_user_id ?? null,
      created_at: orgRow?.created_at ?? null,
      updated_at: orgRow?.updated_at ?? null,
    },
    counts: {
      active_api_keys: keyCount ?? 0,
      active_members: memberCount ?? 0,
      byok_keys: byokCount ?? 0,
    },
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const rl = await limitByUser(auth.user!.id, {
    prefix: "rl:inf-org-patch",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });
  }

  let org;
  try {
    org = await getOrBootstrapOrgForUser(auth.user!.id, auth.user!.email ?? "");
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Org resolution failed" },
      { status: 500 }
    );
  }
  if (org.role !== "owner" && org.role !== "admin") {
    return NextResponse.json(
      { error: "Only org owners and admins can update settings" },
      { status: 403 }
    );
  }

  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation error", details: parsed.error.issues },
      { status: 400 }
    );
  }

  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data, error } = await supabase
    .schema("inference")
    .from("orgs")
    .update(parsed.data)
    .eq("id", org.org_id)
    .select("id, slug, name, zdr_default, region_pin, updated_at")
    .single();

  if (error || !data) {
    console.error("[Inference Org] update failed:", error);
    return NextResponse.json({ error: "Failed to update org" }, { status: 500 });
  }

  const ctx = auditContextFrom(request);
  void recordAudit({
    orgId: org.org_id,
    actorUserId: auth.user!.id,
    action: "org.updated",
    targetType: "org",
    targetId: org.org_id,
    metadata: { changed: Object.keys(parsed.data), after: parsed.data },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return NextResponse.json({ success: true, org: data });
}
