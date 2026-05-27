/**
 * Inference Public API Keys — list + create
 *
 * GET  /api/inference/api-keys
 *   Returns the calling user's org's API keys (masked).
 *
 * POST /api/inference/api-keys
 *   Body: { name, allowed_models?, allowed_ip_cidrs?, zdr_enabled?, monthly_budget_cents?, hard_cap_cents?, expires_at? }
 *   Generates a fresh `ahu_live_xxxx...` key, stores sha256(key) only,
 *   returns the plaintext key ONCE in the response (show-once pattern).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomBytes, createHash } from "crypto";
import { z } from "zod";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getOrBootstrapOrgForUser } from "@/lib/inference/orgs";
import { auditContextFrom, recordAudit } from "@/lib/inference/audit";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  allowed_models: z.array(z.string()).optional().nullable(),
  allowed_ip_cidrs: z.array(z.string()).optional().nullable(),
  zdr_enabled: z.boolean().optional(),
  semantic_cache_enabled: z.boolean().optional(),
  monthly_budget_cents: z.number().int().nonnegative().optional().nullable(),
  hard_cap_cents: z.number().int().nonnegative().optional().nullable(),
  rate_limit_rpm: z.number().int().min(1).max(10000).optional().nullable(),
  expires_at: z.string().datetime().optional().nullable(),
});

// ───────────────────────────────────────────────────────────────
// GET
// ───────────────────────────────────────────────────────────────
export async function GET() {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const rl = await limitByUser(auth.user!.id, {
    prefix: "rl:inf-keys-list",
    limit: 30,
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

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data, error } = await supabase
    .schema("inference")
    .from("api_keys")
    .select(
      "id, name, key_prefix, key_last_four, allowed_models, allowed_ip_cidrs, zdr_enabled, semantic_cache_enabled, monthly_budget_cents, hard_cap_cents, rate_limit_rpm, expires_at, last_used_at, revoked_at, created_at"
    )
    .eq("org_id", org.org_id)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[Inference Keys] list error:", error);
    return NextResponse.json({ error: "Failed to list API keys" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    org: { id: org.org_id, slug: org.org_slug, name: org.org_name },
    data: (data ?? []).map((k) => ({
      id: k.id,
      name: k.name,
      preview: `${k.key_prefix}••••${k.key_last_four}`,
      allowed_models: k.allowed_models,
      allowed_ip_cidrs: k.allowed_ip_cidrs,
      zdr_enabled: k.zdr_enabled,
      semantic_cache_enabled: k.semantic_cache_enabled,
      rate_limit_rpm: k.rate_limit_rpm,
      monthly_budget_cents: k.monthly_budget_cents,
      hard_cap_cents: k.hard_cap_cents,
      expires_at: k.expires_at,
      last_used_at: k.last_used_at,
      created_at: k.created_at,
    })),
  });
}

// ───────────────────────────────────────────────────────────────
// POST
// ───────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const rl = await limitByUser(auth.user!.id, {
    prefix: "rl:inf-keys-create",
    limit: 10,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });
  }

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

  // Generate the key — format: ahu_live_<32 url-safe random chars>
  const random = randomBytes(24).toString("base64url").slice(0, 32);
  const fullKey = `ahu_live_${random}`;
  const keyPrefix = fullKey.slice(0, 13);     // "ahu_live_xxxx"
  const keyLastFour = fullKey.slice(-4);
  const keyHash = createHash("sha256").update(fullKey).digest("hex");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data, error } = await supabase
    .schema("inference")
    .from("api_keys")
    .insert({
      org_id: org.org_id,
      created_by_user_id: auth.user!.id,
      name: parsed.data.name,
      key_prefix: keyPrefix,
      key_last_four: keyLastFour,
      key_hash: keyHash,
      allowed_models: parsed.data.allowed_models ?? null,
      allowed_ip_cidrs: parsed.data.allowed_ip_cidrs ?? null,
      zdr_enabled: parsed.data.zdr_enabled ?? false,
      semantic_cache_enabled: parsed.data.semantic_cache_enabled ?? false,
      monthly_budget_cents: parsed.data.monthly_budget_cents ?? null,
      hard_cap_cents: parsed.data.hard_cap_cents ?? null,
      rate_limit_rpm: parsed.data.rate_limit_rpm ?? null,
      expires_at: parsed.data.expires_at ?? null,
    })
    .select("id, name, key_prefix, key_last_four, created_at")
    .single();

  if (error) {
    console.error("[Inference Keys] insert error:", error);
    return NextResponse.json(
      { error: "Failed to create API key" },
      { status: 500 }
    );
  }

  // Fire-and-forget audit event
  const ctx = auditContextFrom(request);
  void recordAudit({
    orgId: org.org_id,
    actorUserId: auth.user!.id,
    action: "key.created",
    targetType: "api_key",
    targetId: data.id,
    metadata: {
      name: data.name,
      key_prefix: data.key_prefix,
      zdr_enabled: parsed.data.zdr_enabled ?? false,
      monthly_budget_cents: parsed.data.monthly_budget_cents ?? null,
      hard_cap_cents: parsed.data.hard_cap_cents ?? null,
    },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return NextResponse.json(
    {
      success: true,
      data: {
        ...data,
        // Show-once: plaintext key returned ONLY in this response
        api_key: fullKey,
      },
      message:
        "Copy this key now — for security, the full key will never be shown again.",
    },
    { status: 201 }
  );
}
