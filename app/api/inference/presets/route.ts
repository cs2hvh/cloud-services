/**
 * GET  /api/inference/presets — list org presets
 * POST /api/inference/presets — create a new preset
 *
 * A preset is a saved routing configuration that the caller references via
 * the X-Ahura-Preset: <name> header on chat/completions. The worker compiles
 * config into OpenRouter's provider.* routing headers + model fallback list.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getOrBootstrapOrgForUser } from "@/lib/inference/orgs";
import { auditContextFrom, recordAudit } from "@/lib/inference/audit";

const presetConfigSchema = z.object({
  models: z.array(z.string().min(1)).min(1).max(20),
  provider_sort: z
    .enum(["price", "throughput", "latency"])
    .optional()
    .nullable(),
  max_latency_ms: z.number().int().positive().max(60_000).optional().nullable(),
  allow_fallbacks: z.boolean().optional(),
  preferred_max_price_per_mtok: z.number().nonnegative().optional().nullable(),
});

const createSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9][a-z0-9-]*$/i, "Use letters, digits, and hyphens only"),
  description: z.string().max(500).optional().nullable(),
  config: presetConfigSchema,
});

export type PresetConfig = z.infer<typeof presetConfigSchema>;

export async function GET() {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const rl = await limitByUser(auth.user!.id, {
    prefix: "rl:inf-presets-list",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  let org;
  try {
    org = await getOrBootstrapOrgForUser(auth.user!.id, auth.user!.email ?? "");
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Org resolution failed" },
      { status: 500 }
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data, error } = await supabase
    .schema("inference")
    .from("model_presets")
    .select("id, name, description, config, created_by_user_id, created_at, updated_at")
    .eq("org_id", org.org_id)
    .order("name", { ascending: true });

  if (error) {
    console.error("[Inference Presets] list error:", error);
    return NextResponse.json({ error: "Failed to list presets" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    org: { id: org.org_id, slug: org.org_slug, name: org.org_name, role: org.role },
    data: data ?? [],
  });
}

export async function POST(request: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const rl = await limitByUser(auth.user!.id, {
    prefix: "rl:inf-presets-create",
    limit: 10,
    windowMs: 60_000,
  });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation error", details: parsed.error.issues },
      { status: 400 }
    );
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
  if (org.role !== "owner" && org.role !== "admin" && org.role !== "developer") {
    return NextResponse.json(
      { error: "Viewers cannot create presets" },
      { status: 403 }
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data, error } = await supabase
    .schema("inference")
    .from("model_presets")
    .insert({
      org_id: org.org_id,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      config: parsed.data.config,
      created_by_user_id: auth.user!.id,
    })
    .select("id, name, description, config, created_by_user_id, created_at, updated_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: `A preset named "${parsed.data.name}" already exists in this org` },
        { status: 409 }
      );
    }
    console.error("[Inference Presets] create error:", error);
    return NextResponse.json({ error: "Failed to create preset" }, { status: 500 });
  }

  const ctx = auditContextFrom(request);
  void recordAudit({
    orgId: org.org_id,
    actorUserId: auth.user!.id,
    // Reuse a sufficiently-generic audit action; preset-specific actions can
    // be added to the enum in a follow-up migration if granular filtering becomes
    // important. For now, attribute under org.updated since presets are org config.
    action: "org.updated",
    targetType: "model_preset",
    targetId: data.id,
    metadata: { event: "preset.created", name: data.name, config_models: parsed.data.config.models },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return NextResponse.json({ success: true, data }, { status: 201 });
}
