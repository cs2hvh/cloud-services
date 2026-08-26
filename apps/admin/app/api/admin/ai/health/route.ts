import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Check = {
  ok: boolean;
  latencyMs?: number;
  detail?: string;
};

async function timedFetch(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<{ ok: boolean; status?: number; latencyMs: number; body?: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();
  try {
    const res = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
    });
    const latencyMs = Date.now() - start;
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = undefined;
    }
    return { ok: res.ok, status: res.status, latencyMs, body };
  } catch {
    return { ok: false, latencyMs: Date.now() - start };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Platform health for the inference service: gateway edge, upstream
 * provider (Wokey), and the control-plane database. Mirrors the operator
 * branch of the main app's diagnostics page, minus org scoping.
 */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 403 },
    );
  }

  const gatewayBase =
    process.env.NEXT_PUBLIC_INFERENCE_API_BASE || "https://api.ahurasense.com/v1";
  const wokeyBase = process.env.WOKEY_BASE_URL || "https://api.wokey.ai/v1";
  const wokeyKey = process.env.WOKEY_PLATFORM_KEY;

  const [gatewayRes, upstreamRes, dbCheck] = await Promise.all([
    timedFetch(`${gatewayBase}/health`, {}, 5000),
    wokeyKey
      ? timedFetch(
          `${wokeyBase}/models`,
          { headers: { Authorization: `Bearer ${wokeyKey}` } },
          7000,
        )
      : Promise.resolve(null),
    (async (): Promise<Check> => {
      const start = Date.now();
      try {
        const supabase = await createServiceClient();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error, count } = await (supabase as any)
          .schema("inference")
          .from("orgs")
          .select("*", { count: "exact", head: true });
        if (error) return { ok: false, detail: error.message };
        return {
          ok: true,
          latencyMs: Date.now() - start,
          detail: `${count ?? 0} orgs`,
        };
      } catch (e) {
        return { ok: false, detail: e instanceof Error ? e.message : "failed" };
      }
    })(),
  ]);

  const gatewayBody = (gatewayRes.body ?? {}) as { version?: string; env?: string };
  const upstreamModels = Array.isArray(
    (upstreamRes?.body as { data?: unknown[] } | undefined)?.data,
  )
    ? ((upstreamRes!.body as { data: unknown[] }).data.length)
    : undefined;

  return NextResponse.json({
    gateway: {
      ok: gatewayRes.ok,
      latencyMs: gatewayRes.latencyMs,
      detail: gatewayRes.ok
        ? `v${gatewayBody.version ?? "?"} · ${gatewayBody.env ?? ""}`.trim()
        : `unreachable (${gatewayRes.status ?? "timeout"})`,
      url: gatewayBase,
    },
    upstream: upstreamRes
      ? {
          ok: upstreamRes.ok,
          latencyMs: upstreamRes.latencyMs,
          detail: upstreamRes.ok
            ? `${upstreamModels ?? "?"} models listed`
            : `auth/reachability failed (${upstreamRes.status ?? "timeout"})`,
        }
      : { ok: false, detail: "WOKEY_PLATFORM_KEY not configured" },
    database: dbCheck,
  });
}
