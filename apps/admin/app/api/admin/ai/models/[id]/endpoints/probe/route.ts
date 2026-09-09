import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import {
  decryptAesGcm,
  postgresByteaToBytes,
} from "@/lib/inference/crypto";
import { validateBaseUrl } from "../route";

export const dynamic = "force-dynamic";

/**
 * Ask a serving endpoint what it actually serves: GET {base_url}/models.
 *
 * Probes either an endpoint already saved (by id, decrypting its stored key
 * server-side) or a candidate typed into the form before it is saved — the
 * point is to catch a wrong URL, a wrong key or a wrong served-model-name
 * while an operator is still looking at the form, rather than when a
 * customer's request fails.
 *
 * The key is used and discarded: it is never returned, logged, or echoed.
 */

const TIMEOUT_MS = 8000;

async function fetchModels(base: string, key: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await fetch(`${base}/models`, {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: controller.signal,
    });
    const latencyMs = Date.now() - started;
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = undefined;
    }
    return { ok: res.ok, status: res.status, latencyMs, body };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      latencyMs: Date.now() - started,
      body: undefined,
      networkError: e instanceof Error ? e.name : "fetch failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(
  request: Request,
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
  const body = (await request.json().catch(() => ({}))) as {
    endpoint_id?: string;
    base_url?: string;
    api_key?: string;
  };

  let base: string;
  let key: string;

  if (body.endpoint_id) {
    const dek = process.env.BYOK_DEK;
    if (!dek) {
      return NextResponse.json(
        {
          error:
            "BYOK_DEK is not set on this host, so a saved key cannot be decrypted to probe with. Paste the key into the form to probe a candidate instead.",
        },
        { status: 503 },
      );
    }
    try {
      const supabase = await createServiceClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inference = (supabase as any).schema("inference");
      const { data, error } = await inference
        .from("serving_endpoints")
        .select("base_url, api_key_ct")
        .eq("id", body.endpoint_id)
        .eq("model_id", modelId)
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (!data) return NextResponse.json({ error: "Endpoint not found" }, { status: 404 });
      base = data.base_url as string;
      key = await decryptAesGcm(
        postgresByteaToBytes(data.api_key_ct as string),
        dek,
      );
    } catch {
      return NextResponse.json(
        { error: "Stored key could not be decrypted — it may have been written under a different DEK." },
        { status: 500 },
      );
    }
  } else {
    const check = validateBaseUrl(String(body.base_url ?? ""));
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
    const candidateKey = String(body.api_key ?? "").trim();
    if (!candidateKey) {
      return NextResponse.json(
        { error: "Provide an api_key to probe with, or probe a saved endpoint by id" },
        { status: 400 },
      );
    }
    base = check.url;
    key = candidateKey;
  }

  // OpenAI-compatible bases are given with or without /v1 — try as written,
  // then the /v1 variant, so a missing suffix reads as a hint, not a failure.
  let attempt = await fetchModels(base, key);
  let probedBase = base;
  if (!attempt.ok && !/\/v\d+$/.test(base)) {
    const alt = `${base}/v1`;
    const second = await fetchModels(alt, key);
    if (second.ok) {
      attempt = second;
      probedBase = alt;
    }
  }

  const served = Array.isArray((attempt.body as { data?: { id?: string }[] } | undefined)?.data)
    ? ((attempt.body as { data: { id?: string }[] }).data
        .map((m) => m?.id)
        .filter((v): v is string => typeof v === "string"))
    : [];

  return NextResponse.json({
    ok: attempt.ok,
    status: attempt.status,
    latencyMs: attempt.latencyMs,
    probedBase,
    // The ids the pod answers to — served_model_name must be one of these.
    servedModels: served,
    suggestion:
      probedBase !== base
        ? `Reached it at ${probedBase} — save the base_url with the /v1 suffix.`
        : attempt.status === 401 || attempt.status === 403
          ? "The endpoint answered but rejected the key."
          : !attempt.ok
            ? "No usable response from this base_url."
            : null,
  });
}
