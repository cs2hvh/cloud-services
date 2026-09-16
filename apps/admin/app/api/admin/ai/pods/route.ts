import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Hosted-pod health, read from what the gateway worker probes every minute
 * (inference.endpoint_health / _log). The panel never touches a pod or a pod
 * credential — the worker owns the probing and the key.
 *
 * Why this surface exists: a hosted model served its last successful request
 * on 2026-09-12 and failed 266 requests over three days before anyone
 * noticed. RunPod rebuilds change the proxy hostname, a dead hostname answers
 * 404, and the gateway only fails over on 5xx/network — so a 404 pod is
 * quietly fatal. Nothing was watching. This is the watching.
 *
 * Two honesty rules shape the output:
 *   - "ok" means the pod answered 200 AND lists the model name we send it. A
 *     pod that is up but serving a different name 404s every real request, so
 *     it is DOWN here even though it is alive.
 *   - if the prober itself has stopped, that must not render as all-green.
 *     `probe.stale` says the data is old and the colours cannot be trusted.
 */

/** The worker probes every minute; beyond this the prober itself is suspect. */
const PROBE_STALE_AFTER_SEC = 180;
const FAILURE_SAMPLE_CAP = 1000;

const REASON_TEXT: Record<string, string> = {
  ok: "serving normally",
  unreachable: "host unreachable",
  timeout: "timed out",
  credential: "key rejected",
  served_name_missing: "up, but not serving the configured model name",
};

function reasonInWords(reason: string | null, statusCode: number | null): string {
  if (!reason) return "unknown";
  if (REASON_TEXT[reason]) return REASON_TEXT[reason];
  if (reason === "http_404") {
    return "404 — hostname is dead (a RunPod rebuild changes it)";
  }
  if (reason.startsWith("http_")) {
    const code = statusCode ?? Number(reason.slice(5));
    if (code >= 500) return `${code} — pod is erroring or still loading`;
    if (code === 401 || code === 403) return `${code} — key rejected`;
    return `HTTP ${code}`;
  }
  return reason;
}

type HealthRow = {
  endpoint_id: string;
  model_id: string;
  base_url: string;
  label: string | null;
  enabled: boolean;
  checked_at: string;
  ok: boolean;
  reason: string | null;
  status_code: number | null;
  latency_ms: number | null;
  served_ids: unknown;
  error: string | null;
  consecutive_failures: number | null;
  last_ok_at: string | null;
  last_fail_at: string | null;
};

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(request.url);
  const windowHours = Math.min(
    168,
    Math.max(1, parseInt(searchParams.get("hours") || "24", 10) || 24),
  );
  const since = new Date(Date.now() - windowHours * 3600 * 1000).toISOString();
  const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  try {
    const supabase = await createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inference = (supabase as any).schema("inference");

    const [healthRes, endpointsRes, modelsRes] = await Promise.all([
      inference
        .from("endpoint_health")
        .select(
          "endpoint_id, model_id, base_url, label, enabled, checked_at, ok, reason, status_code, latency_ms, served_ids, error, consecutive_failures, last_ok_at, last_fail_at",
        )
        .order("model_id")
        .order("label"),
      // served_model_name lives on the endpoint, not the health row — it is
      // what we SEND, and the mismatch against what the pod LISTS is the
      // failure that looks like success.
      inference
        .from("serving_endpoints")
        .select("id, served_model_name, weight"),
      // A DELISTED model is unroutable: no customer request can reach it, so
      // its dead pod is housekeeping, not an outage. Without this join a
      // parked model shouts DOWN forever and teaches operators to ignore red.
      inference.from("models").select("model_id, is_active"),
    ]);

    if (healthRes.error) {
      console.error("[Admin AI] pod health read failed:", healthRes.error.message);
      return NextResponse.json(
        { error: "Could not read pod health", detail: healthRes.error.message },
        { status: 502 },
      );
    }

    const rows = (healthRes.data ?? []) as HealthRow[];
    const sentName = new Map<string, string | null>(
      ((endpointsRes.data ?? []) as { id: string; served_model_name: string | null }[]).map(
        (e) => [e.id, e.served_model_name],
      ),
    );
    const modelActive = new Map<string, boolean>(
      ((modelsRes.data ?? []) as { model_id: string; is_active: boolean }[]).map(
        (m) => [m.model_id, m.is_active],
      ),
    );
    const weightOf = new Map<string, number>(
      ((endpointsRes.data ?? []) as { id: string; weight: number }[]).map((e) => [
        e.id,
        e.weight,
      ]),
    );

    // ---- uptime: exact counts, no row transfer ----
    const uptimeFor = async (endpointId: string, from: string) => {
      const [total, okCount] = await Promise.all([
        inference
          .from("endpoint_health_log")
          .select("id", { count: "exact", head: true })
          .eq("endpoint_id", endpointId)
          .gte("checked_at", from),
        inference
          .from("endpoint_health_log")
          .select("id", { count: "exact", head: true })
          .eq("endpoint_id", endpointId)
          .eq("ok", true)
          .gte("checked_at", from),
      ]);
      const t = total.count ?? 0;
      const o = okCount.count ?? 0;
      return { probes: t, ok: o, pct: t > 0 ? (o / t) * 100 : null };
    };

    const enriched = await Promise.all(
      rows.map(async (r) => {
        const servedIds = Array.isArray(r.served_ids)
          ? (r.served_ids as unknown[]).filter(
              (v): v is string => typeof v === "string",
            )
          : [];
        const expected = sentName.get(r.endpoint_id) ?? null;

        const [h24, d7, failures] = await Promise.all([
          uptimeFor(r.endpoint_id, since),
          uptimeFor(r.endpoint_id, since7d),
          // Only the FAILING probes are fetched for the strip — on a healthy
          // endpoint that is a handful of rows instead of 1,440.
          inference
            .from("endpoint_health_log")
            .select("checked_at, reason, status_code")
            .eq("endpoint_id", r.endpoint_id)
            .eq("ok", false)
            .gte("checked_at", since)
            .order("checked_at", { ascending: false })
            .limit(FAILURE_SAMPLE_CAP),
        ]);

        const failureRows = (failures.data ?? []) as {
          checked_at: string;
          reason: string | null;
          status_code: number | null;
        }[];

        const ageSec = Math.max(
          0,
          Math.round((Date.now() - Date.parse(r.checked_at)) / 1000),
        );

        return {
          endpointId: r.endpoint_id,
          modelId: r.model_id,
          modelActive: modelActive.get(r.model_id) ?? false,
          baseUrl: r.base_url,
          label: r.label,
          enabled: r.enabled,
          weight: weightOf.get(r.endpoint_id) ?? null,
          ok: r.ok,
          reason: r.reason,
          reasonText: reasonInWords(r.reason, r.status_code),
          statusCode: r.status_code,
          latencyMs: r.latency_ms,
          checkedAt: r.checked_at,
          ageSec,
          consecutiveFailures: r.consecutive_failures ?? 0,
          lastOkAt: r.last_ok_at,
          lastFailAt: r.last_fail_at,
          error: r.error,
          servedIds,
          expectedName: expected,
          // The quiet killer: the pod is alive and lists models, but not the
          // one we route to it.
          nameMismatch:
            servedIds.length > 0 && !!expected && !servedIds.includes(expected),
          uptime: { h24, d7 },
          failures: failureRows.map((f) => ({
            at: f.checked_at,
            reason: reasonInWords(f.reason, f.status_code),
          })),
          failuresTruncated: failureRows.length >= FAILURE_SAMPLE_CAP,
        };
      }),
    );

    // ---- model roll-up: disabled endpoints are staged, not broken ----
    const byModel = new Map<string, typeof enriched>();
    for (const e of enriched) {
      const list = byModel.get(e.modelId) ?? [];
      list.push(e);
      byModel.set(e.modelId, list);
    }
    const models = [...byModel.entries()]
      .map(([modelId, eps]) => {
        // Unknown model (no catalog row) is treated as parked rather than
        // down — absence of a row is not evidence of an outage.
        const active = modelActive.get(modelId) ?? false;
        const live = eps.filter((e) => e.enabled);
        const okCount = live.filter((e) => e.ok).length;
        const status = !active
          ? ("parked" as const)
          : live.length === 0
            ? ("no_enabled_endpoint" as const)
            : okCount === live.length
              ? ("healthy" as const)
              : okCount === 0
                ? ("down" as const)
                : ("degraded" as const);
        return {
          modelId,
          modelActive: active,
          status,
          enabledEndpoints: live.length,
          okEndpoints: okCount,
          stagedEndpoints: eps.length - live.length,
          endpoints: eps,
        };
      })
      .sort((a, b) => {
        const rank = {
          down: 0,
          no_enabled_endpoint: 1,
          degraded: 2,
          healthy: 3,
          parked: 4,
        };
        return rank[a.status] - rank[b.status] || a.modelId.localeCompare(b.modelId);
      });

    // ---- is the prober itself alive? ----
    const lastCheckedAt = rows.reduce<string | null>(
      (max, r) => (!max || r.checked_at > max ? r.checked_at : max),
      null,
    );
    const probeAgeSec = lastCheckedAt
      ? Math.round((Date.now() - Date.parse(lastCheckedAt)) / 1000)
      : null;

    return NextResponse.json({
      windowHours,
      probe: {
        lastCheckedAt,
        ageSec: probeAgeSec,
        staleAfterSec: PROBE_STALE_AFTER_SEC,
        // No rows at all, or old rows, both mean the colours below are not
        // current — never let that read as healthy.
        stale: probeAgeSec === null || probeAgeSec > PROBE_STALE_AFTER_SEC,
      },
      totals: {
        endpoints: enriched.length,
        // "Serving" counts only pods that a customer request could actually
        // reach: endpoint enabled AND its model listed.
        enabled: enriched.filter(
          (e) => e.enabled && (modelActive.get(e.modelId) ?? false),
        ).length,
        up: enriched.filter(
          (e) => e.enabled && e.ok && (modelActive.get(e.modelId) ?? false),
        ).length,
        parkedEndpoints: enriched.filter(
          (e) => !(modelActive.get(e.modelId) ?? false),
        ).length,
        modelsDown: models.filter((m) => m.status === "down").length,
        modelsDegraded: models.filter((m) => m.status === "degraded").length,
        modelsParked: models.filter((m) => m.status === "parked").length,
      },
      // Anything an operator should act on, already worded.
      alerts: enriched
        .filter(
          (e) =>
            e.enabled &&
            !e.ok &&
            e.consecutiveFailures >= 3 &&
            // A parked model cannot be failing anyone.
            (modelActive.get(e.modelId) ?? false),
        )
        .map((e) => ({
          endpointId: e.endpointId,
          modelId: e.modelId,
          label: e.label,
          text: `${e.modelId} — ${e.label ?? e.baseUrl}: ${e.reasonText}, ${e.consecutiveFailures} consecutive failures`,
        })),
      models,
    });
  } catch (err) {
    console.error("[Admin AI] pod health unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
