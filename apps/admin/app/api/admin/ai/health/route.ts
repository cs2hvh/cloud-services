import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Check = {
  ok: boolean;
  /** True when this host cannot perform the probe at all — rendered as
   *  UNKNOWN, never as a failure. The panel not holding a credential is a
   *  fact about the panel, not about the platform. */
  unknown?: boolean;
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
 * provider (Wokey), and the control-plane database.
 *
 * The upstream probe needs WOKEY_PLATFORM_KEY in THIS process. The panel is
 * a separate deployment whose .env is a first-run copy of the main app's, so
 * a key added to the gateway later is simply absent here — which says
 * nothing about whether the upstream is healthy. That case reports
 * `unknown: true` and renders grey; only a real failed call is red.
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
  const starimgBase = process.env.STARIMG_BASE_URL || "https://ai.starimg.ru/v1";
  const starimgKey = process.env.STARIMG_PLATFORM_KEY;

  const [gatewayRes, upstreamRes, starimgRes, podCheck, dbCheck] = await Promise.all([
    timedFetch(`${gatewayBase}/health`, {}, 5000),
    wokeyKey
      ? timedFetch(
          `${wokeyBase}/models`,
          { headers: { Authorization: `Bearer ${wokeyKey}` } },
          7000,
        )
      : Promise.resolve(null),
    // Hosted pods: read what the gateway's own prober wrote. A model whose
    // only pod is dead is the outage that went three days unnoticed, so it
    // belongs on the same strip as the gateway and the database.
    // Starimg — the primary partner for chat since 2026-09-18. Same rule as
    // the other upstream probe: a key this host does not hold makes the check
    // UNKNOWN, never failed. The panel not holding a credential is a fact
    // about the panel.
    starimgKey
      ? timedFetch(
          `${starimgBase}/models`,
          { headers: { Authorization: `Bearer ${starimgKey}` } },
          7000,
        )
      : Promise.resolve(null),
    (async (): Promise<Check & { detail: string }> => {
      try {
        const supabase = await createServiceClient();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const inf = (supabase as any).schema("inference");
        const [{ data, error }, modelsRes] = await Promise.all([
          inf.from("endpoint_health").select("model_id, enabled, ok, checked_at"),
          inf.from("models").select("model_id, is_active"),
        ]);
        if (error) return { ok: false, unknown: true, detail: "pod health unreadable" };
        // A delisted model is unroutable — its dead pod is housekeeping, not
        // an outage, and must not colour this card red.
        const active = new Map<string, boolean>(
          ((modelsRes.data ?? []) as { model_id: string; is_active: boolean }[]).map(
            (m) => [m.model_id, m.is_active],
          ),
        );
        const rows = (data ?? []) as {
          model_id: string;
          enabled: boolean;
          ok: boolean;
          checked_at: string;
        }[];
        if (rows.length === 0) {
          return { ok: false, unknown: true, detail: "no pods are being probed" };
        }
        const newest = rows.reduce(
          (m, r) => (r.checked_at > m ? r.checked_at : m),
          rows[0].checked_at,
        );
        const ageSec = Math.round((Date.now() - Date.parse(newest)) / 1000);
        if (ageSec > 180) {
          return {
            ok: false,
            unknown: true,
            detail: `probe stale (${Math.round(ageSec / 60)}m) — status unknown`,
          };
        }
        const byModel = new Map<string, { live: number; up: number }>();
        for (const r of rows) {
          if (!r.enabled) continue;
          if (!(active.get(r.model_id) ?? false)) continue;
          const e = byModel.get(r.model_id) ?? { live: 0, up: 0 };
          e.live += 1;
          if (r.ok) e.up += 1;
          byModel.set(r.model_id, e);
        }
        const down = [...byModel.entries()].filter(([, v]) => v.up === 0);
        const degraded = [...byModel.entries()].filter(
          ([, v]) => v.up > 0 && v.up < v.live,
        );
        const live = rows.filter(
          (r) => r.enabled && (active.get(r.model_id) ?? false),
        );
        if (down.length > 0) {
          return {
            ok: false,
            detail: `${down.length} model(s) down: ${down.map(([m]) => m).join(", ")}`,
          };
        }
        // Zero routable pods is not health — say what it is rather than
        // reporting a confident "0/0 up".
        if (live.length === 0) {
          return {
            ok: false,
            unknown: true,
            detail: "no pod belongs to a listed model",
          };
        }
        return {
          ok: true,
          detail:
            degraded.length > 0
              ? `${live.filter((r) => r.ok).length}/${live.length} pods up · ${degraded.length} model(s) degraded`
              : `${live.filter((r) => r.ok).length}/${live.length} pods up`,
        };
      } catch (e) {
        return {
          ok: false,
          unknown: true,
          detail: e instanceof Error ? e.message : "failed",
        };
      }
    })(),
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
  const starimgModels = Array.isArray(
    (starimgRes?.body as { data?: unknown[] } | undefined)?.data,
  )
    ? ((starimgRes!.body as { data: unknown[] }).data.length)
    : undefined;
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
      : {
          ok: false,
          unknown: true,
          detail:
            "not checkable from the panel — WOKEY_PLATFORM_KEY is not in this host's environment",
        },
    starimg: starimgRes
      ? {
          ok: starimgRes.ok,
          latencyMs: starimgRes.latencyMs,
          detail: starimgRes.ok
            ? `${starimgModels ?? "?"} models listed`
            : `auth/reachability failed (${starimgRes.status ?? "timeout"})`,
        }
      : {
          ok: false,
          unknown: true,
          detail:
            "not checkable from the panel — STARIMG_PLATFORM_KEY is not in this host's environment",
        },
    database: dbCheck,
    pods: podCheck,
  });
}
