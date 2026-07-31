// GET /api/admin/inference/workers — fleet health, resolved on demand.
//
// Section A4 (Jobs & runners) of nextstespsAI/21-admin-platform.md. Runs when the page loads or
// Refresh is pressed; nothing is polled in the background and nothing is stored.
//
// LIVENESS: each runner already exposes a ClusterIP Service `ahura-<runner>-health`
// on 8080 (workers/<runner>/k8s/deployment.yaml), and the deployed app sits in the
// same cluster, so IN PRODUCTION these URLs are reachable — verified 2026-07-30 by
// reaching a cross-namespace ClusterIP from the dev app pod. Probing is still OFF
// by default because (a) no runner is deployed yet — namespace `ahura` does not
// exist — and (b) from a laptop the cluster DNS does not resolve, which would paint
// the whole fleet red. Turn it on with RUNNER_HEALTH_PROBE=on once the runners are
// deployed; ?probe=1 forces a one-off check, and RUNNER_HEALTH_URL_<SERVICE>
// retargets one runner (used to test against a local runner). See lib/admin/fleet.ts.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { inferenceAdminClient } from "@/lib/admin/inference-client";
import { RUNNERS, probeTargetFor, type RunnerSpec } from "@/lib/admin/runner-registry";
import {
  RECENT_HOURS,
  STUCK_AFTER_MS,
  snapshotOf,
  sortByUrgency,
  summarize,
  verdictFor,
  type JobRow,
  type ProbeResult,
  type QueueSnapshot,
  type RunnerHealthBody,
} from "@/lib/admin/fleet";

export const dynamic = "force-dynamic";

/** A probe must not hang the page — the fleet view is worthless if it times out. */
const PROBE_TIMEOUT_MS = 2_000;

/**
 * Backstop on rows per runner. The query is already narrowed to open work plus a
 * 24h window, so hitting this means something is genuinely wrong (a runaway
 * queue) — and it is reported rather than silently truncated.
 */
const MAX_ROWS_PER_RUNNER = 5_000;

/** Probe one runner's /health, bounded. Only called when probing is enabled. */
async function probeRunner(spec: RunnerSpec): Promise<ProbeResult> {
  const url = probeTargetFor(spec, process.env);
  const base: ProbeResult = {
    service: spec.service, url: url ?? "", outcome: "not_probed",
    latency_ms: null, status_code: null, body: null, error: null,
  };
  // Nothing to probe → stay in derived-only mode. See probeTargetFor(). The
  // wording reads as a clause inside the row's "why", so keep it a phrase.
  if (!url) return { ...base, error: "it has no /health endpoint to probe" };

  const started = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS), cache: "no-store" });
    const latency = Date.now() - started;
    let body: RunnerHealthBody | null = null;
    try {
      body = (await res.json()) as RunnerHealthBody;
    } catch {
      /* a 200 with no JSON still counts as reachable */
    }
    return {
      ...base,
      outcome: res.ok ? "ok" : "unhealthy",
      latency_ms: latency,
      status_code: res.status,
      body,
      error: res.ok ? null : `HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      ...base,
      outcome: "unreachable",
      latency_ms: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function GET(req: NextRequest) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Two INDEPENDENT facts, reported separately. Collapsing them into one
  // "enabled" flag forced the UI to guess from its own state, and it then told an
  // operator "not enabled by default" on a server where it was.
  const probeDefaultOn = process.env.RUNNER_HEALTH_PROBE === "on";
  const probeForced = req.nextUrl.searchParams.get("probe") === "1";
  const probingEnabled = probeDefaultOn || probeForced;

  const supabase = inferenceAdminClient();
  const now = Date.now();

  const recentCutoffIso = new Date(now - RECENT_HOURS * 3_600_000).toISOString();

  const snapshots = await Promise.all(
    RUNNERS.map(async (spec) => {
      const columns = ["status", spec.time_column, spec.heartbeat_column, ...(spec.extra_columns ?? [])]
        .filter(Boolean)
        .join(", ");

      // Fetch only what the counts need: work that is still open at ANY age, plus
      // rows that settled inside the throughput window.
      //
      // Reading whole tables was a latent correctness bug, not just slow:
      // PostgREST caps rows (1000 by default) and returns no error when it does,
      // so `agentcore.runs` — already 328 rows and growing with every agent run —
      // would eventually truncate and the page would silently under-report, or
      // miss queued work entirely, with nothing to indicate it.
      const openStatuses = [...spec.claimable, ...spec.in_flight];
      const { data, error } = await supabase
        .schema(spec.schema)
        .from(spec.table)
        .select(columns)
        .or(`status.in.(${openStatuses.join(",")}),${spec.time_column}.gte.${recentCutoffIso}`)
        .limit(MAX_ROWS_PER_RUNNER)
        .returns<JobRow[]>();
      if (error) {
        // A missing table must not blank the whole page — report the runner as
        // unreadable and carry on with the rest of the fleet.
        return { spec, snapshot: undefined as QueueSnapshot | undefined, error: error.message };
      }

      const snapshot = snapshotOf(spec, data ?? [], now);

      // `last_job_activity` must reflect the WHOLE table, not the filtered window
      // — verdictFor uses it to tell "down" from "never deployed", and the UI
      // shows it as "last activity". One indexed row, so it stays cheap.
      const { data: newest } = await supabase
        .schema(spec.schema)
        .from(spec.table)
        .select(spec.time_column)
        .order(spec.time_column, { ascending: false })
        .limit(1)
        .returns<JobRow[]>();
      const newestAt = newest?.[0]?.[spec.time_column];
      if (typeof newestAt === "string") snapshot.last_job_activity = newestAt;

      return { spec, snapshot, error: null as string | null };
    })
  );

  const probes = probingEnabled ? await Promise.all(RUNNERS.map(probeRunner)) : [];
  const probeBy = new Map(probes.map((p) => [p.service, p]));

  const verdicts = sortByUrgency(
    snapshots.map(({ spec, snapshot }) => verdictFor(spec.service, probeBy.get(spec.service), snapshot))
  );

  return NextResponse.json({
    probing: {
      enabled: probingEnabled,
      /** True when RUNNER_HEALTH_PROBE=on, i.e. every load probes. */
      default_on: probeDefaultOn,
      /** True when THIS request forced a one-off probe via ?probe=1. */
      forced: probeForced,
      // The UI states this rather than implying the fleet is broken.
      reason: probingEnabled
        ? null
        : "Health probing is off, so status below is derived from queue state alone. " +
          "Each runner does expose a /health service in the cluster; set RUNNER_HEALTH_PROBE=on " +
          "once the runners are deployed, or add ?probe=1 for a one-off check.",
      /** So the UI can offer the one-off check without hardcoding the flag. */
      force_param: "probe=1",
    },
    window_hours: RECENT_HOURS,
    stuck_after_minutes: STUCK_AFTER_MS / 60_000,
    summary: summarize(verdicts),
    runners: verdicts.map((v) => {
      const entry = snapshots.find((s) => s.spec.service === v.service);
      return {
        ...v,
        label: entry?.spec.label ?? v.service,
        purpose: entry?.spec.purpose ?? "",
        source: entry ? `${entry.spec.schema}.${entry.spec.table}` : null,
        has_heartbeat: !!entry?.spec.heartbeat_column,
        /** False when there is no /health service at all — a permanent fact
         *  about the runner, not a property of this check. */
        probeable: entry ? probeTargetFor(entry.spec, process.env) !== null : false,
        read_error: entry?.error ?? null,
        last_job_activity: entry?.snapshot?.last_job_activity ?? null,
      };
    }),
  });
}
