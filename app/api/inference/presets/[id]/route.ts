/**
 * PATCH  /api/inference/presets/[id] — update name / description / config
 * DELETE /api/inference/presets/[id] — remove preset (admin/owner only)
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getActiveOrgForUser } from "@/lib/inference/orgs";
import { auditContextFrom, recordAudit } from "@/lib/inference/audit";

const patchSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9][a-z0-9-]*$/i)
    .optional(),
  description: z.string().max(500).nullable().optional(),
  config: z
    .object({
      models: z.array(z.string().min(1)).min(1).max(20),
      provider_sort: z.enum(["price", "throughput", "latency"]).nullable().optional(),
      max_latency_ms: z.number().int().positive().max(60_000).nullable().optional(),
      allow_fallbacks: z.boolean().optional(),
      preferred_max_price_per_mtok: z.number().nonnegative().nullable().optional(),
    })
    .optional(),
});

function isUuid(s: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(s);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Invalid preset id" }, { status: 400 });
  }

  const rl = await limitByUser(auth.user!.id, {
    prefix: "rl:inf-presets-patch",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const org = await getActiveOrgForUser(auth.user!.id);
  if (!org) return NextResponse.json({ error: "No inference org" }, { status: 404 });
  if (org.role === "viewer") {
    return NextResponse.json({ error: "Viewers cannot update presets" }, { status: 403 });
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
    .from("model_presets")
    .update(parsed.data)
    .eq("id", id)
    .eq("org_id", org.org_id)
    .select("id, name, description, config, updated_at")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      return NextResponse.json(
        { error: `A preset with that name already exists` },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Preset not found in this org" }, { status: 404 });
  }

  const ctx = auditContextFrom(request);
  void recordAudit({
    orgId: org.org_id,
    actorUserId: auth.user!.id,
    action: "org.updated",
    targetType: "model_preset",
    targetId: id,
    metadata: {
      event: "preset.updated",
      changed: Object.keys(parsed.data),
      name: data.name,
    },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return NextResponse.json({ success: true, data });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Invalid preset id" }, { status: 400 });
  }

  const rl = await limitByUser(auth.user!.id, {
    prefix: "rl:inf-presets-delete",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const org = await getActiveOrgForUser(auth.user!.id);
  if (!org) return NextResponse.json({ error: "No inference org" }, { status: 404 });
  if (org.role !== "owner" && org.role !== "admin") {
    return NextResponse.json(
      { error: "Only org owners and admins can delete presets" },
      { status: 403 }
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Fetch name for audit before deleting
  const { data: existing } = await supabase
    .schema("inference")
    .from("model_presets")
    .select("name")
    .eq("id", id)
    .eq("org_id", org.org_id)
    .maybeSingle<{ name: string }>();

  const { error, count } = await supabase
    .schema("inference")
    .from("model_presets")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("org_id", org.org_id);

  if (error) {
    console.error("[Inference Presets] delete error:", error);
    return NextResponse.json({ error: "Failed to delete preset" }, { status: 500 });
  }
  if (!count) {
    return NextResponse.json({ error: "Preset not found" }, { status: 404 });
  }

  const ctx = auditContextFrom(request);
  void recordAudit({
    orgId: org.org_id,
    actorUserId: auth.user!.id,
    action: "org.updated",
    targetType: "model_preset",
    targetId: id,
    metadata: { event: "preset.deleted", name: existing?.name },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return NextResponse.json({ success: true, deleted_id: id });
}
