/**
 * Image and video generation through the partner that carries them.
 *
 * Images are synchronous: one request, one base64 image back, billed per
 * image on the response. Video is a job: submit, poll, download. The partner
 * fixes the price at submit time (duration × the per-second rate for the
 * resolution) and keeps the file for seven days.
 *
 * Billing a job on completion, not submission, means a failed job costs the
 * customer nothing. But billing only when the customer polls would mean a
 * customer who never polls is never billed, so the worker cron also sweeps
 * every open job each minute and settles it. Both paths go through
 * settleJob(), which bills at most once: the row is moved to "completed" with
 * a conditional update, and only the caller that wins that update enqueues
 * the usage event.
 *
 * Nothing partner-specific reaches the customer: our job ids, our model ids,
 * our content URL, and the partner's price is never in a response.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Env, UsageEvent } from "../types.ts";
import { baseUsageEvent, sendUsage } from "./usage-events.ts";

/**
 * Job status lives in two vocabularies. The table's check constraint allows
 * queued | running | completed | failed | canceled. Customers see the
 * OpenAI-style queued | in_progress | completed | failed | cancelled, and
 * the partner reports its own. Everything is mapped at the edges; the
 * stored form is what the sweep and the settle logic compare against.
 */
export const STORED_TERMINAL = new Set(["completed", "failed", "canceled"]);
/** @deprecated use STORED_TERMINAL; kept so callers written against the old name still compile. */
export const VIDEO_TERMINAL = STORED_TERMINAL;
export const JOB_DEADLINE_MS = 60 * 60_000;
export const CONTENT_RETENTION_DAYS = 7;

/** Partner or public status → what the table accepts. Pure. */
export function toStoredStatus(status: string | null | undefined): "queued" | "running" | "completed" | "failed" | "canceled" {
  switch ((status ?? "").toLowerCase()) {
    case "queued":
    case "pending":
      return "queued";
    case "completed":
    case "succeeded":
      return "completed";
    case "failed":
    case "error":
      return "failed";
    case "cancelled":
    case "canceled":
      return "canceled";
    default:
      return "running";
  }
}

/** Stored status → what the customer sees. Pure. */
export function toPublicStatus(stored: string): "queued" | "in_progress" | "completed" | "failed" | "cancelled" {
  switch (stored) {
    case "queued":
      return "queued";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "canceled":
      return "cancelled";
    default:
      return "in_progress";
  }
}

export interface MediaModel {
  model_id: string;
  modality: string;
  is_active: boolean;
  upstream_provider: string | null;
  upstream_model_id: string | null;
  capabilities: Record<string, unknown> | null;
}

export function mediaClient(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    global: { headers: { "X-Client-Info": "ahura-inference-media" } },
  });
}

export async function loadMediaModel(env: Env, modelId: string): Promise<MediaModel | null> {
  const { data } = await mediaClient(env)
    .schema("inference")
    .from("models")
    .select("model_id, modality, is_active, upstream_provider, upstream_model_id, capabilities")
    .eq("model_id", modelId)
    .maybeSingle<MediaModel>();
  return data ?? null;
}

/** Which price tier a requested image size falls in, from capabilities.size_tiers. Pure. */
export function imageTierFor(capabilities: Record<string, unknown> | null, size: string | undefined): string | null {
  if (!size) return null;
  const tiers = (capabilities?.size_tiers ?? null) as Record<string, string[]> | null;
  if (!tiers) return null;
  for (const [tier, sizes] of Object.entries(tiers)) if (Array.isArray(sizes) && sizes.includes(size)) return tier;
  return null;
}

/** The partner's error bodies for media are clean and provider-free; keep their code and message, drop everything else. Pure. */
export function relayMediaError(status: number, bodyText: string, requestId: string): { status: number; body: { error: { message: string; type: string; code: string; request_id: string } } } {
  if (status >= 500) {
    return { status: 503, body: { error: { message: "The media service is temporarily unavailable. Retry in a few seconds.", type: "api_error", code: "media_unavailable", request_id: requestId } } };
  }
  if (status === 401 || status === 403) {
    return { status: 503, body: { error: { message: "The media service is temporarily unable to process this request.", type: "api_error", code: "media_unavailable", request_id: requestId } } };
  }
  let code = `upstream_${status}`;
  let message = "The media service rejected this request.";
  try {
    const j = JSON.parse(bodyText) as { error?: { code?: unknown; message?: unknown } };
    if (typeof j.error?.code === "string" && /^[a-z0-9_]+$/.test(j.error.code)) code = j.error.code;
    if (typeof j.error?.message === "string" && j.error.message.length < 300 && !/wokey|starimg|http/i.test(j.error.message)) message = j.error.message;
  } catch { /* keep the generic text */ }
  return { status, body: { error: { message, type: status === 429 ? "rate_limit_error" : "invalid_request_error", code, request_id: requestId } } };
}

// ── Partner calls ────────────────────────────────────────────────────────

export interface PartnerVideo {
  id: string;
  status: string;
  model?: string;
  mode?: string;
  prompt?: string;
  duration_seconds?: number;
  ratio?: string;
  resolution?: string;
  created_at?: string;
  completed_at?: string | null;
  error?: { code?: string; message?: string } | string | null;
  content_status?: string | null;
}

export async function partnerImage(env: Env, key: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  return fetch(`${env.WOKEY_BASE_URL}/images/generations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}

export async function partnerVideoCreate(env: Env, key: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  return fetch(`${env.WOKEY_BASE_URL}/videos`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}

export async function partnerVideoGet(env: Env, key: string, upstreamId: string): Promise<PartnerVideo | null> {
  const r = await fetch(`${env.WOKEY_BASE_URL}/videos/${encodeURIComponent(upstreamId)}`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok) return null;
  return (await r.json()) as PartnerVideo;
}

export async function partnerVideoContent(env: Env, key: string, upstreamId: string, signal?: AbortSignal): Promise<Response> {
  return fetch(`${env.WOKEY_BASE_URL}/videos/${encodeURIComponent(upstreamId)}/content`, {
    headers: { Authorization: `Bearer ${key}` },
    signal,
  });
}

// ── Jobs ─────────────────────────────────────────────────────────────────

export interface JobRow {
  id: string;
  org_id: string;
  api_key_id: string;
  model_id: string;
  status: string;
  request_params: Record<string, unknown> | null;
  num_units: number | null;
  unit_label: string | null;
  cost_cents: number | null;
  upstream_job_id: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  deadline_at: string | null;
}

export const publicVideoId = (rowId: string) => `video_${rowId}`;
export const rowIdFromPublic = (publicId: string): string | null => {
  const m = /^video_([0-9a-f-]{36})$/i.exec(publicId);
  return m ? m[1]! : null;
};

/** The customer-facing job. Pure: no partner id, no partner price. */
export function publicVideoJob(row: JobRow, upstream: PartnerVideo | null) {
  const params = row.request_params ?? {};
  const stored = upstream ? toStoredStatus(upstream.status) : toStoredStatus(row.status);
  const status = toPublicStatus(stored);
  const done = stored === "completed";
  const err = row.error_code
    ? { code: row.error_code, message: row.error_message ?? "Generation failed." }
    : upstream && upstream.error
      ? { code: typeof upstream.error === "object" && upstream.error.code ? upstream.error.code : "generation_failed", message: typeof upstream.error === "object" && upstream.error.message ? upstream.error.message : "Generation failed." }
      : null;
  const createdMs = Date.parse(row.created_at);
  return {
    id: publicVideoId(row.id),
    object: "video",
    status,
    model: row.model_id,
    mode: upstream?.mode ?? (params.mode as string | undefined) ?? "text_to_video",
    prompt: (params.prompt as string | undefined) ?? "",
    duration_seconds: upstream?.duration_seconds ?? (params.duration_seconds as number | undefined) ?? row.num_units,
    ratio: upstream?.ratio ?? (params.ratio as string | undefined) ?? null,
    resolution: upstream?.resolution ?? (params.resolution as string | undefined) ?? null,
    created_at: row.created_at,
    completed_at: upstream?.completed_at ?? (done ? row.updated_at : null),
    error: err,
    content_url: done ? `/v1/videos/${publicVideoId(row.id)}/content` : null,
    content_expires_at: done && Number.isFinite(createdMs) ? new Date(createdMs + CONTENT_RETENTION_DAYS * 86_400_000).toISOString() : null,
  };
}

const JOB_COLUMNS = "id, org_id, api_key_id, model_id, status, request_params, num_units, unit_label, cost_cents, upstream_job_id, error_code, error_message, created_at, updated_at, deadline_at";

/** Patch a job row; returns it as it now stands, or null if the update failed. */
export async function updateJob(env: Env, rowId: string, patch: Record<string, unknown>): Promise<JobRow | null> {
  const { data, error } = await mediaClient(env)
    .schema("inference")
    .from("media_jobs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", rowId)
    .select(JOB_COLUMNS)
    .maybeSingle<JobRow>();
  if (error) {
    console.error(JSON.stringify({ level: "error", message: "media: job update failed", jobId: rowId, err: error.message }));
    return null;
  }
  return data ?? null;
}

/**
 * Record the job before the partner sees it: a row with no upstream id is
 * a submission in flight, and if the submit fails the row is marked failed.
 * That way a job the partner accepted can never exist without our record.
 */
export async function createJob(env: Env, row: Omit<JobRow, "id" | "created_at" | "updated_at" | "status" | "error_code" | "error_message" | "upstream_job_id">): Promise<JobRow | null> {
  const { data, error } = await mediaClient(env)
    .schema("inference")
    .from("media_jobs")
    .insert({
      org_id: row.org_id,
      api_key_id: row.api_key_id,
      modality: "video",
      model_id: row.model_id,
      status: "queued",
      request_params: row.request_params,
      num_units: row.num_units,
      unit_label: row.unit_label,
      cost_cents: 0,
      upstream_job_id: null,
      deadline_at: row.deadline_at,
      heartbeat_at: new Date().toISOString(),
    })
    .select("id, org_id, api_key_id, model_id, status, request_params, num_units, unit_label, cost_cents, upstream_job_id, error_code, error_message, created_at, updated_at, deadline_at")
    .single<JobRow>();
  if (error) {
    console.error(JSON.stringify({ level: "error", message: "media: job insert failed", err: error.message }));
    return null;
  }
  return data;
}

export async function getJobForOrg(env: Env, rowId: string, orgId: string): Promise<JobRow | null> {
  const { data } = await mediaClient(env)
    .schema("inference")
    .from("media_jobs")
    .select("id, org_id, api_key_id, model_id, status, request_params, num_units, unit_label, cost_cents, upstream_job_id, error_code, error_message, created_at, updated_at, deadline_at")
    .eq("id", rowId)
    .eq("org_id", orgId)
    .maybeSingle<JobRow>();
  return data ?? null;
}

export async function listJobsForOrg(env: Env, orgId: string, limit = 20): Promise<JobRow[]> {
  const { data } = await mediaClient(env)
    .schema("inference")
    .from("media_jobs")
    .select("id, org_id, api_key_id, model_id, status, request_params, num_units, unit_label, cost_cents, upstream_job_id, error_code, error_message, created_at, updated_at, deadline_at")
    .eq("org_id", orgId)
    .eq("modality", "video")
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<JobRow[]>();
  return data ?? [];
}

/**
 * Reconcile one job against the partner's view and bill it if it just
 * completed. Returns the row as it now stands. Safe to call from the
 * customer's poll and from the cron at the same time.
 */
export async function settleJob(env: Env, row: JobRow, upstream: PartnerVideo | null, now = new Date()): Promise<JobRow> {
  const supabase = mediaClient(env);
  const nowIso = now.toISOString();

  if (STORED_TERMINAL.has(row.status)) return row;
  const partnerStored = upstream ? toStoredStatus(upstream.status) : null;

  // The partner has lost the job, or it is long past its deadline with no
  // answer: fail it so it stops being polled and is never billed.
  if (!upstream) {
    const expired = row.deadline_at ? Date.parse(row.deadline_at) < now.getTime() : false;
    if (!expired) return row;
    const { data } = await supabase
      .schema("inference")
      .from("media_jobs")
      .update({ status: "failed", error_code: "watchdog_timeout", error_message: "The job did not finish in time.", updated_at: nowIso })
      .eq("id", row.id)
      .neq("status", "completed")
      .select("id, org_id, api_key_id, model_id, status, request_params, num_units, unit_label, cost_cents, upstream_job_id, error_code, error_message, created_at, updated_at, deadline_at")
      .maybeSingle<JobRow>();
    return data ?? row;
  }

  if (partnerStored === "completed") {
    // Win the transition, then bill exactly once.
    const { data } = await supabase
      .schema("inference")
      .from("media_jobs")
      .update({ status: "completed", num_units: upstream.duration_seconds ?? row.num_units, updated_at: nowIso, heartbeat_at: nowIso })
      .eq("id", row.id)
      .neq("status", "completed")
      .select("id, org_id, api_key_id, model_id, status, request_params, num_units, unit_label, cost_cents, upstream_job_id, error_code, error_message, created_at, updated_at, deadline_at")
      .maybeSingle<JobRow>();
    if (data) {
      const event: UsageEvent = {
        ...baseUsageEvent({ orgId: data.org_id, keyId: data.api_key_id, billing: "platform" }, data.model_id, `job_${data.id}`, Date.parse(data.created_at), "video"),
        numUnits: data.num_units,
        unitLabel: "second",
        unitTier: (upstream.resolution ?? (data.request_params?.resolution as string | undefined)) ?? null,
        upstreamProvider: "wokey",
        status: "success",
        occurredAt: nowIso,
      };
      await sendUsage(env, event);
      return data;
    }
    return { ...row, status: "completed" };
  }

  if (partnerStored === "failed" || partnerStored === "canceled") {
    const code = typeof upstream.error === "object" && upstream.error?.code ? upstream.error.code : "generation_failed";
    const message = typeof upstream.error === "object" && upstream.error?.message ? upstream.error.message : "Generation failed.";
    const { data } = await supabase
      .schema("inference")
      .from("media_jobs")
      .update({ status: partnerStored, error_code: code, error_message: message, updated_at: nowIso })
      .eq("id", row.id)
      .neq("status", "completed")
      .select("id, org_id, api_key_id, model_id, status, request_params, num_units, unit_label, cost_cents, upstream_job_id, error_code, error_message, created_at, updated_at, deadline_at")
      .maybeSingle<JobRow>();
    return data ?? row;
  }

  if (partnerStored && partnerStored !== row.status) {
    await supabase.schema("inference").from("media_jobs").update({ status: partnerStored, heartbeat_at: nowIso, updated_at: nowIso }).eq("id", row.id);
    return { ...row, status: partnerStored };
  }
  await supabase.schema("inference").from("media_jobs").update({ heartbeat_at: nowIso }).eq("id", row.id);
  return row;
}

/** Cron: settle every open video job, so a customer who never polls is still billed and a lost job is still closed. */
export async function runMediaJobSweep(env: Env, event: Pick<ScheduledEvent, "scheduledTime">): Promise<{ open: number; settled: number }> {
  if (!env.WOKEY_PLATFORM_KEY) return { open: 0, settled: 0 };
  const { data: rows } = await mediaClient(env)
    .schema("inference")
    .from("media_jobs")
    .select("id, org_id, api_key_id, model_id, status, request_params, num_units, unit_label, cost_cents, upstream_job_id, error_code, error_message, created_at, updated_at, deadline_at")
    .eq("modality", "video")
    .not("upstream_job_id", "is", null)
    .not("status", "in", "(completed,failed,canceled)")
    .order("created_at", { ascending: true })
    .limit(50)
    .returns<JobRow[]>();
  const open = rows ?? [];
  let settled = 0;
  const now = new Date(event.scheduledTime);
  await Promise.all(
    open.map(async (row) => {
      try {
        const upstream = await partnerVideoGet(env, env.WOKEY_PLATFORM_KEY, row.upstream_job_id!);
        const after = await settleJob(env, row, upstream, now);
        if (STORED_TERMINAL.has(after.status)) settled++;
      } catch (err) {
        console.error(JSON.stringify({ level: "error", message: "media sweep: job settle failed", jobId: row.id, err: err instanceof Error ? err.message : String(err) }));
      }
    })
  );
  if (settled > 0) console.log(JSON.stringify({ level: "info", message: "media sweep", open: open.length, settled }));
  return { open: open.length, settled };
}
