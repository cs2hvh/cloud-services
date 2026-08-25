/**
 * Inference BYOK Keys — list + create
 *
 * GET  /api/inference/byok-keys
 *   Returns the calling user's org's BYOK keys (masked).
 *
 * POST /api/inference/byok-keys
 *   Body: { name, provider, api_key }
 *   - Verifies the key against the upstream (OpenRouter for 'openrouter';
 *     skipped for other providers in Phase 1 since we only use OpenRouter)
 *   - Encrypts with BYOK_DEK (AES-GCM)
 *   - Stores in inference.byok_keys with the bytea ciphertext payload
 *
 * Auth: standard Supabase user session (cookie or Authorization header).
 * Org:  the user's active inference org (auto-bootstrapped if missing).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { actingUserId, controlPlaneAuth } from "@/lib/inference/control-plane-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import {
  bytesToPostgresBytea,
  encryptAesGcm,
} from "@/lib/inference/crypto";
import { auditContextFrom, recordAudit } from "@/lib/inference/audit";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  provider: z.enum(["openrouter", "openai", "anthropic", "google", "mistral", "custom"]),
  api_key: z.string().min(10).max(500),
});

// ───────────────────────────────────────────────────────────────
// GET — list BYOK keys (masked)
// ───────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const authResult = await controlPlaneAuth(request, { session: "cookie", org: "bootstrap", requireOrgKey: true });
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;

  const rl = await limitByUser(auth.subject, {
    prefix: "rl:inf-byok-list",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });
  }

  const org = { org_id: auth.orgId, role: auth.orgRole, org_name: auth.orgName, org_slug: auth.orgSlug };

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data, error } = await supabase
    .schema("inference")
    .from("byok_keys")
    .select(
      "id, name, provider, key_last_four, is_valid, last_verified_at, last_verify_error, created_at"
    )
    .eq("org_id", org.org_id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[Inference BYOK] list error:", error);
    return NextResponse.json({ error: "Failed to list BYOK keys" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    org: { id: org.org_id, slug: org.org_slug, name: org.org_name },
    data: (data ?? []).map((k) => ({
      id: k.id,
      name: k.name,
      provider: k.provider,
      preview: "••••••••" + k.key_last_four,
      is_valid: k.is_valid,
      last_verified_at: k.last_verified_at,
      last_verify_error: k.last_verify_error,
      created_at: k.created_at,
    })),
  });
}

// ───────────────────────────────────────────────────────────────
// POST — verify, encrypt, store
// ───────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const authResult = await controlPlaneAuth(request, { session: "cookie", org: "bootstrap", requireOrgKey: true });
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;

  const rl = await limitByUser(auth.subject, {
    prefix: "rl:inf-byok-create",
    limit: 10,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });
  }

  const dek = process.env.BYOK_DEK;
  if (!dek) {
    return NextResponse.json(
      { error: "BYOK_DEK is not configured on the server" },
      { status: 500 }
    );
  }

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation error", details: parsed.error.issues },
      { status: 400 }
    );
  }
  const { name, provider, api_key } = parsed.data;

  const org = { org_id: auth.orgId, role: auth.orgRole, org_name: auth.orgName, org_slug: auth.orgSlug };

  // Verify the key against the upstream before storing. Phase 1 only verifies
  // OpenRouter keys (the canonical BYOK provider); other providers skip
  // verification since the gateway always routes through OpenRouter anyway.
  let isValid = true;
  let verifyError: string | null = null;
  if (provider === "openrouter") {
    try {
      const resp = await fetch("https://openrouter.ai/api/v1/key", {
        headers: { Authorization: `Bearer ${api_key}` },
      });
      if (!resp.ok) {
        isValid = false;
        verifyError = `OpenRouter returned ${resp.status}`;
      }
    } catch (err) {
      isValid = false;
      verifyError = err instanceof Error ? err.message : String(err);
    }
    if (!isValid) {
      return NextResponse.json(
        { error: `BYOK key verification failed: ${verifyError}` },
        { status: 400 }
      );
    }
  }

  // Encrypt + format for bytea storage
  let ciphertextHex: string;
  try {
    const cipherBytes = await encryptAesGcm(api_key, dek);
    ciphertextHex = bytesToPostgresBytea(cipherBytes);
  } catch (err) {
    console.error("[Inference BYOK] encryption failed:", err);
    return NextResponse.json(
      { error: "Failed to encrypt BYOK key" },
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
    .from("byok_keys")
    .insert({
      org_id: org.org_id,
      added_by_user_id: (await actingUserId(auth))!,
      name,
      provider,
      ciphertext: ciphertextHex,
      kms_key_version: 1,
      key_last_four: api_key.slice(-4),
      is_valid: isValid,
      last_verified_at: new Date().toISOString(),
      last_verify_error: verifyError,
    })
    .select("id, name, provider, key_last_four, is_valid, created_at")
    .single();

  if (error) {
    // Unique violation on (org_id, name) → 409
    if (error.code === "23505") {
      return NextResponse.json(
        { error: `A BYOK key with name "${name}" already exists in this org` },
        { status: 409 }
      );
    }
    console.error("[Inference BYOK] insert failed:", error);
    return NextResponse.json(
      { error: "Failed to store BYOK key" },
      { status: 500 }
    );
  }

  const ctx = auditContextFrom(request);
  void recordAudit({
    orgId: org.org_id,
    actorUserId: auth.userId,
    action: "byok.added",
    targetType: "byok_key",
    targetId: data.id,
    metadata: {
      name: data.name,
      provider: data.provider,
      key_last_four: data.key_last_four,
      is_valid: data.is_valid,
    },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return NextResponse.json({ success: true, data }, { status: 201 });
}
