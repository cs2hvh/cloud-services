/**
 * Health probe for every hosted serving endpoint, run from the worker cron.
 *
 * Why it lives here and not in the admin panel: each pod's credential is
 * AES-GCM under BYOK_DEK, which only this worker holds. The panel reads the
 * two tables this writes and never sees a pod key.
 *
 * Why it exists: the flash model's pods were rebuilt under new RunPod
 * hostnames on 2026-09-12 and every request failed for three days before a
 * human looked. The gateway only fails over on 5xx and network errors, and
 * a dead hostname answers 404, so the failure was quiet.
 *
 * What "ok" means. Not just "the URL answered". A pod that is up but serving
 * a different model name 404s every real request — that was half of the
 * September outage — so the probe hits /models with the endpoint's own
 * credential and requires the endpoint's served-model-name to be in the
 * list. Anything else is a failure with a reason the panel can show.
 *
 * Disabled endpoints are probed too, and recorded as such. A staged pod
 * that is still loading shows up here the moment it starts answering,
 * which is how an operator knows it can be enabled.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { decryptAesGcm, postgresByteaToBytes } from "./crypto.ts";
import { managedPath } from "./model-routing.ts";
import type { Env } from "../types.ts";

export const PROBE_TIMEOUT_MS = 15_000;
export const LOG_RETENTION_DAYS = 7;

export interface EndpointRow {
  id: string;
  model_id: string;
  base_url: string;
  api_key_ct: string | null;
  served_model_name: string | null;
  enabled: boolean;
  label: string | null;
}

export type ProbeReason =
  | "ok"
  | "unreachable"
  | "timeout"
  | "credential"
  | "served_name_missing"
  | `http_${number}`;

export interface ProbeVerdict {
  ok: boolean;
  reason: ProbeReason;
  servedIds: string[];
}

/**
 * Decide health from what /models returned. Pure, so it is testable without
 * a network: the rules are the whole point of the probe.
 */
export function judgeProbe(
  status: number | null,
  body: unknown,
  servedModelName: string | null,
  error: string | null
): ProbeVerdict {
  if (error !== null) {
    return { ok: false, reason: /timeout|abort/i.test(error) ? "timeout" : "unreachable", servedIds: [] };
  }
  if (status !== 200) {
    return { ok: false, reason: `http_${status ?? 0}`, servedIds: [] };
  }
  const data = (body as { data?: unknown } | null)?.data;
  const servedIds = Array.isArray(data)
    ? data.map((m) => (m as { id?: unknown })?.id).filter((id): id is string => typeof id === "string")
    : [];
  if (servedModelName && !servedIds.includes(servedModelName)) {
    return { ok: false, reason: "served_name_missing", servedIds };
  }
  return { ok: true, reason: "ok", servedIds };
}

export interface ProbeResult extends ProbeVerdict {
  endpointId: string;
  status: number | null;
  latencyMs: number;
  error: string | null;
}

/** GET {base}/models with the endpoint's credential. Never throws. */
export async function probeEndpoint(
  row: EndpointRow,
  apiKey: string | null,
  fetchImpl: typeof fetch = fetch
): Promise<ProbeResult> {
  const started = Date.now();
  if (row.api_key_ct && apiKey === null) {
    return { endpointId: row.id, ok: false, reason: "credential", servedIds: [], status: null, latencyMs: 0, error: "credential could not be decrypted" };
  }
  let status: number | null = null;
  let body: unknown = null;
  let error: string | null = null;
  try {
    const res = await fetchImpl(managedPath(row.base_url, "/models"), {
      method: "GET",
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    status = res.status;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
  } catch (err) {
    error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  }
  const verdict = judgeProbe(status, body, row.served_model_name, error);
  return { endpointId: row.id, ...verdict, status, latencyMs: Date.now() - started, error };
}

interface HealthState {
  endpoint_id: string;
  ok: boolean;
  consecutive_failures: number;
  last_ok_at: string | null;
  last_fail_at: string | null;
}

function client(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    global: { headers: { "X-Client-Info": "ahura-inference-endpoint-health" } },
  });
}

/**
 * One sweep: probe every endpoint in parallel, upsert the current state,
 * append to the log, and once an hour prune the log. Logs only failures and
 * state changes, so a healthy fleet keeps the per-minute cron silent.
 */
export async function runEndpointHealthSweep(
  env: Env,
  event: Pick<ScheduledEvent, "scheduledTime">,
  fetchImpl: typeof fetch = fetch
): Promise<{ probed: number; failing: number }> {
  const supabase = client(env);
  const checkedAt = new Date(event.scheduledTime).toISOString();

  const { data: rows, error: rowsErr } = await supabase
    .schema("inference")
    .from("serving_endpoints")
    .select("id, model_id, base_url, api_key_ct, served_model_name, enabled, label")
    .returns<EndpointRow[]>();
  if (rowsErr) {
    console.error(JSON.stringify({ level: "error", message: "endpoint-health: could not list endpoints", err: rowsErr.message }));
    return { probed: 0, failing: 0 };
  }
  const endpoints = rows ?? [];
  if (endpoints.length === 0) return { probed: 0, failing: 0 };

  const { data: prevRows } = await supabase
    .schema("inference")
    .from("endpoint_health")
    .select("endpoint_id, ok, consecutive_failures, last_ok_at, last_fail_at")
    .returns<HealthState[]>();
  const prev = new Map((prevRows ?? []).map((p) => [p.endpoint_id, p]));

  const results = await Promise.all(
    endpoints.map(async (row) => {
      let apiKey: string | null = null;
      if (row.api_key_ct) {
        try {
          apiKey = await decryptAesGcm(postgresByteaToBytes(row.api_key_ct), env.BYOK_DEK);
        } catch {
          apiKey = null;
        }
      }
      return { row, result: await probeEndpoint(row, apiKey, fetchImpl) };
    })
  );

  const stateRows = results.map(({ row, result }) => {
    const before = prev.get(row.id);
    const consecutiveFailures = result.ok ? 0 : (before?.consecutive_failures ?? 0) + 1;
    if (!result.ok || (before && before.ok !== result.ok)) {
      console.log(
        JSON.stringify({
          level: result.ok ? "info" : "warn",
          message: result.ok ? "endpoint-health: recovered" : "endpoint-health: failing",
          endpointId: row.id,
          modelId: row.model_id,
          label: row.label,
          enabled: row.enabled,
          reason: result.reason,
          status: result.status,
          consecutiveFailures,
          error: result.error,
        })
      );
    }
    return {
      endpoint_id: row.id,
      model_id: row.model_id,
      base_url: row.base_url,
      label: row.label,
      enabled: row.enabled,
      checked_at: checkedAt,
      ok: result.ok,
      reason: result.reason,
      status_code: result.status,
      latency_ms: result.latencyMs,
      served_ids: result.servedIds,
      error: result.error,
      consecutive_failures: consecutiveFailures,
      last_ok_at: result.ok ? checkedAt : (before?.last_ok_at ?? null),
      last_fail_at: result.ok ? (before?.last_fail_at ?? null) : checkedAt,
      updated_at: checkedAt,
    };
  });

  const { error: upsertErr } = await supabase
    .schema("inference")
    .from("endpoint_health")
    .upsert(stateRows, { onConflict: "endpoint_id" });
  if (upsertErr) {
    console.error(JSON.stringify({ level: "error", message: "endpoint-health: state upsert failed", err: upsertErr.message }));
  }

  const { error: logErr } = await supabase
    .schema("inference")
    .from("endpoint_health_log")
    .insert(
      results.map(({ row, result }) => ({
        endpoint_id: row.id,
        checked_at: checkedAt,
        ok: result.ok,
        reason: result.reason,
        status_code: result.status,
        latency_ms: result.latencyMs,
      }))
    );
  if (logErr) {
    console.error(JSON.stringify({ level: "error", message: "endpoint-health: log insert failed", err: logErr.message }));
  }

  // Prune once an hour; seven days at one row per endpoint per minute is
  // ~10k rows per endpoint, plenty for an uptime strip and cheap to keep.
  if (new Date(event.scheduledTime).getUTCMinutes() === 0) {
    const cutoff = new Date(Date.parse(checkedAt) - LOG_RETENTION_DAYS * 86_400_000).toISOString();
    const { error: pruneErr } = await supabase
      .schema("inference")
      .from("endpoint_health_log")
      .delete()
      .lt("checked_at", cutoff);
    if (pruneErr) {
      console.error(JSON.stringify({ level: "error", message: "endpoint-health: prune failed", err: pruneErr.message }));
    }
  }

  return { probed: results.length, failing: results.filter((r) => !r.result.ok).length };
}
