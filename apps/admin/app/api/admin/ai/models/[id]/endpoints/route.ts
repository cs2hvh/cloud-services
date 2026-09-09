import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { AuditLogService } from "@/lib/audit";
import { encryptAesGcm, bytesToPostgresBytea } from "@/lib/inference/crypto";

export const dynamic = "force-dynamic";

/**
 * Serving endpoints for a self-hosted model (inference.serving_endpoints).
 * Each row is one replica the edge worker may forward to, tried in weighted
 * order with failover on 5xx/network error.
 *
 * Secret handling, non-negotiable:
 *   - the pod's API key arrives in plaintext ONCE, is encrypted server-side
 *     with the same AES-GCM envelope as customer BYOK keys, and is written
 *     as bytea. It is never logged, never echoed back, never stored raw.
 *   - api_key_ct is never selected into a response; the UI gets `hasKey`.
 *   - if BYOK_DEK is absent from THIS host, the write is REFUSED rather
 *     than storing an unusable row. (The panel is a separate deployment
 *     whose .env is a first-run copy of the main app's, so a key added
 *     later is simply not here — the same trap that made the upstream
 *     health card claim an outage. Fail loudly, at the door.)
 */

type EndpointRow = {
  id: string;
  model_id: string;
  base_url: string;
  served_model_name: string | null;
  weight: number;
  enabled: boolean;
  label: string | null;
  created_at: string;
  updated_at: string;
};

// api_key_ct is deliberately absent from every select in this file.
const SAFE_COLUMNS =
  "id, model_id, base_url, served_model_name, weight, enabled, label, created_at, updated_at";

/** Operator-supplied URLs are fetched by the server, so keep them public https. */
export function validateBaseUrl(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return { ok: false, error: "base_url must be a full URL, e.g. https://pod.example.com/v1" };
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, error: "base_url must use https" };
  }
  const host = parsed.hostname.toLowerCase();
  const isPrivate =
    host === "localhost" ||
    host === "0.0.0.0" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (isPrivate) {
    return { ok: false, error: "base_url must be a public host, not a private or loopback address" };
  }
  // Store without a trailing slash; the worker appends its own paths.
  return { ok: true, url: parsed.toString().replace(/\/+$/, "") };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 403 },
    );
  }

  const { id } = await params;
  const modelId = decodeURIComponent(id);

  try {
    const supabase = await createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inference = (supabase as any).schema("inference");

    const { data, error } = await inference
      .from("serving_endpoints")
      // The ciphertext is read here only to answer "is a key set?" — it is
      // reduced to a boolean below and never enters the response, so it
      // reaches this server process and stops there.
      .select(`${SAFE_COLUMNS}, has_key:api_key_ct`)
      .eq("model_id", modelId)
      .order("weight", { ascending: false })
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[Admin AI] endpoints list failed:", error.message);
      return NextResponse.json(
        { error: "Failed to load endpoints" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      modelId,
      // Report only WHETHER a key exists — never its bytes.
      endpoints: ((data ?? []) as (EndpointRow & { has_key: unknown })[]).map(
        ({ has_key, ...row }) => ({ ...row, hasKey: has_key !== null }),
      ),
      dekConfigured: Boolean(process.env.BYOK_DEK),
    });
  } catch (err) {
    console.error("[Admin AI] endpoints unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin.ok || !admin.userId) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 403 },
    );
  }

  const { id } = await params;
  const modelId = decodeURIComponent(id);
  const body = (await request.json().catch(() => ({}))) as {
    base_url?: string;
    api_key?: string;
    served_model_name?: string;
    weight?: number;
    label?: string;
    enabled?: boolean;
  };

  const urlCheck = validateBaseUrl(String(body.base_url ?? ""));
  if (!urlCheck.ok) {
    return NextResponse.json({ error: urlCheck.error }, { status: 400 });
  }
  const apiKey = String(body.api_key ?? "").trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "api_key is required — the pod's key is stored encrypted and never shown again" },
      { status: 400 },
    );
  }
  const weight = Number(body.weight ?? 1);
  if (!Number.isInteger(weight) || weight < 1) {
    return NextResponse.json({ error: "weight must be a whole number ≥ 1" }, { status: 400 });
  }

  const dek = process.env.BYOK_DEK;
  if (!dek) {
    return NextResponse.json(
      {
        error:
          "BYOK_DEK is not set on this host, so the key cannot be encrypted. Refusing to store an endpoint the worker could never use.",
      },
      { status: 503 },
    );
  }

  try {
    const supabase = await createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inference = (supabase as any).schema("inference");

    // Anchor on the model so a typo cannot seed an orphan endpoint.
    const { data: model, error: modelErr } = await inference
      .from("models")
      .select("model_id, serving_type")
      .eq("model_id", modelId)
      .maybeSingle();
    if (modelErr) {
      return NextResponse.json({ error: modelErr.message }, { status: 500 });
    }
    if (!model) {
      return NextResponse.json({ error: `Model ${modelId} not found` }, { status: 404 });
    }

    const ciphertext = bytesToPostgresBytea(await encryptAesGcm(apiKey, dek));

    const { data, error } = await inference
      .from("serving_endpoints")
      .insert({
        model_id: modelId,
        base_url: urlCheck.url,
        api_key_ct: ciphertext,
        served_model_name: body.served_model_name?.trim() || null,
        weight,
        label: body.label?.trim() || null,
        enabled: body.enabled ?? true,
      })
      .select(SAFE_COLUMNS)
      .single();

    if (error) {
      const duplicate = error.code === "23505";
      return NextResponse.json(
        {
          error: duplicate
            ? "That base_url is already an endpoint for this model"
            : error.message,
        },
        { status: duplicate ? 409 : 500 },
      );
    }

    try {
      await AuditLogService.create({
        user_id: admin.userId,
        user_email: admin.email,
        user_role: "admin",
        action: "create",
        service_type: "ai_agent",
        service_id: data.id as string,
        service_name: `Serving endpoint for ${modelId}`,
        // The URL is operational detail worth keeping; the key never is.
        after_state: {
          model_id: modelId,
          base_url: urlCheck.url,
          served_model_name: data.served_model_name,
          weight,
          enabled: data.enabled,
          api_key: "[encrypted]",
        },
        metadata: { via: "admin-panel", operation: "ai.serving_endpoint.create" },
      });
    } catch {
      // audit must never fail the mutation
    }

    return NextResponse.json({ success: true, endpoint: { ...data, hasKey: true } });
  } catch (err) {
    console.error("[Admin AI] endpoint create failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
