/**
 * Inference BYOK Keys — list + create
 *
 * GET  /api/inference/byok-keys
 *   Returns the calling user's org's BYOK keys (masked).
 *
 * POST /api/inference/byok-keys
 *   Body: { name, provider, api_key }
 *   - Verifies the key against the upstream (a 1-token completion for 'wokey';
 *     skipped for providers the gateway does not route to)
 *   - Encrypts with BYOK_DEK (AES-GCM)
 *   - Stores in inference.byok_keys with the bytea ciphertext payload
 *
 * Auth: standard Supabase user session (cookie or Authorization header).
 * Org:  the user's active inference org (auto-bootstrapped if missing).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import {
  bytesToPostgresBytea,
  encryptAesGcm,
} from "@/lib/inference/crypto";
import { getOrBootstrapOrgForUser } from "@/lib/inference/orgs";
import { auditContextFrom, recordAudit } from "@/lib/inference/audit";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  provider: z.enum(["wokey", "openrouter", "openai", "anthropic", "google", "mistral", "custom"]),
  api_key: z.string().min(10).max(500),
});

// ───────────────────────────────────────────────────────────────
// GET — list BYOK keys (masked)
// ───────────────────────────────────────────────────────────────
export async function GET() {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const rl = await limitByUser(auth.user!.id, {
    prefix: "rl:inf-byok-list",
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
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const rl = await limitByUser(auth.user!.id, {
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

  let org;
  try {
    org = await getOrBootstrapOrgForUser(auth.user!.id, auth.user!.email ?? "");
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Org resolution failed" },
      { status: 500 }
    );
  }

  // Verify the key against the upstream before storing, so a typo surfaces
  // here rather than as a mystery 401 on the customer's first real request.
  //
  // Wokey has no key-introspection endpoint, and its GET /v1/models answers
  // 200 WITHOUT auth — so hitting that would "verify" any string at all.
  // The cheapest authenticated probe is a 1-token completion. It costs the
  // customer a fraction of a cent against their own key, which is the price
  // of not storing a credential we never confirmed.
  //
  // Only 401/403 marks a key invalid. A 5xx or a network blip means the
  // upstream is unhappy, not that the key is wrong, and rejecting on those
  // would block a customer from adding a perfectly good key during an
  // upstream incident.
  let isValid = true;
  let verifyError: string | null = null;

  if (provider === "wokey") {
    const base = process.env.WOKEY_BASE_URL ?? "https://api.wokey.ai/v1";
    try {
      const resp = await fetch(`${base.replace(/\/+$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${api_key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5",
          messages: [{ role: "user", content: "hi" }],
          max_tokens: 1,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (resp.status === 401 || resp.status === 403) {
        isValid = false;
        verifyError = "the provider rejected this key";
      }
    } catch (err) {
      // Network/timeout — inconclusive, not invalid. Store it and let the
      // gateway's own error path report the truth on first use.
      console.warn(
        "[Inference BYOK] wokey verification inconclusive:",
        err instanceof Error ? err.message : String(err)
      );
    }
  } else if (provider === "openrouter") {
    // Retained for the historical rows only — 'openrouter' is no longer the
    // platform upstream, so a key stored under it will never be used.
    try {
      const resp = await fetch("https://openrouter.ai/api/v1/key", {
        headers: { Authorization: `Bearer ${api_key}` },
      });
      if (!resp.ok) {
        isValid = false;
        verifyError = `provider returned ${resp.status}`;
      }
    } catch (err) {
      isValid = false;
      verifyError = err instanceof Error ? err.message : String(err);
    }
  }

  if (!isValid) {
    return NextResponse.json(
      { error: `BYOK key verification failed: ${verifyError}` },
      { status: 400 }
    );
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
      added_by_user_id: auth.user!.id,
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
    actorUserId: auth.user!.id,
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
