/**
 * Video generation, in the shape of OpenAI's video API:
 *
 *   POST /v1/videos               submit; 202 with the job
 *   GET  /v1/videos               the org's recent jobs
 *   GET  /v1/videos/:id           the job, refreshed from the partner
 *   GET  /v1/videos/:id/content   the finished mp4
 *
 * The job id is ours; the partner's id, price and name never leave the
 * gateway. Billing happens once, on completion, in lib/media.ts.
 */
import type { Handler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import type { Env, HonoVariables } from "../types.ts";
import { resolveModelId } from "../lib/aliases.ts";
import { resolveUpstreamKey } from "../lib/wokey.ts";
import {
  JOB_DEADLINE_MS,
  STORED_TERMINAL,
  createJob,
  toStoredStatus,
  updateJob,
  getJobForOrg,
  listJobsForOrg,
  loadMediaModel,
  partnerVideoContent,
  partnerVideoCreate,
  partnerVideoGet,
  publicVideoJob,
  relayMediaError,
  rowIdFromPublic,
  settleJob,
} from "../lib/media.ts";
import { baseUsageEvent, errorBody, sendUsage } from "../lib/usage-events.ts";

type H = Handler<{ Bindings: Env; Variables: HonoVariables }>;

const submitSchema = z
  .object({
    model: z.string().min(1),
    prompt: z.string().min(1).max(4000),
    mode: z.string().optional(),
    duration_seconds: z.number().int().min(1).max(60),
    ratio: z.string().regex(/^\d{1,2}:\d{1,2}$/).optional(),
    resolution: z.string().regex(/^(\d{3,4}p|4K)$/i),
  })
  .passthrough();

export const videoCreate: H = async (c) => {
  const auth = c.get("auth");
  const requestId = c.get("requestId");
  const startedAt = c.get("startedAt");

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(errorBody("Invalid JSON body", "invalid_request_error", "invalid_json", requestId), 400);
  }
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(errorBody(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), "invalid_request_error", "invalid_request", requestId), 400);
  }
  const req = parsed.data;

  const effectiveModel = await resolveModelId(c.env, req.model);
  if (auth.allowedModels && auth.allowedModels.length > 0 && !auth.allowedModels.includes(effectiveModel) && !auth.allowedModels.includes(req.model)) {
    return c.json(errorBody(`Model "${req.model}" is not allowed for this API key`, "invalid_request_error", "model_not_allowed", requestId), 403);
  }
  const model = await loadMediaModel(c.env, effectiveModel);
  if (!model || !model.is_active) {
    return c.json(errorBody("The requested model is not available. Call GET /v1/models for the current list.", "invalid_request_error", "model_not_found", requestId), 404);
  }
  if (model.modality !== "video") {
    return c.json(errorBody(`"${effectiveModel}" does not generate video. Pick a model whose modality is "video".`, "invalid_request_error", "model_wrong_modality", requestId), 400);
  }
  if (model.upstream_provider !== "wokey" || !model.upstream_model_id) {
    return c.json(errorBody("The requested model is not available right now.", "api_error", "model_unavailable", requestId), 503);
  }
  const caps = model.capabilities ?? {};
  const range = caps.duration_seconds as { min?: number; max?: number } | undefined;
  if (range && ((range.min && req.duration_seconds < range.min) || (range.max && req.duration_seconds > range.max))) {
    return c.json(errorBody(`duration_seconds must be between ${range.min} and ${range.max} for this model.`, "invalid_request_error", "video_duration_invalid", requestId), 400);
  }
  const resolutions = caps.resolutions as string[] | undefined;
  if (resolutions && !resolutions.includes(req.resolution)) {
    return c.json(errorBody(`Resolution "${req.resolution}" is not offered by this model. Supported: ${resolutions.join(", ")}.`, "invalid_request_error", "video_resolution_unsupported", requestId), 400);
  }
  // BYOK holders bill through their own partner account; the job settlement
  // path bills the platform, so keep video to platform billing for now.
  if (auth.billing !== "platform") {
    return c.json(errorBody("Video generation is available on platform billing only.", "invalid_request_error", "byok_unsupported", requestId), 400);
  }
  let upstreamKey: string;
  try {
    upstreamKey = await resolveUpstreamKey(c.env, "platform", auth.orgId, undefined);
  } catch (err) {
    return c.json(errorBody(err instanceof Error ? err.message : "Upstream unavailable", "api_error", "upstream_unavailable", requestId), 503);
  }

  c.header("X-Ahura-Model", effectiveModel);
  c.header("X-Ahura-Billing", auth.billing);

  // Record first, submit second: a job the partner accepts can then never
  // exist without our row, so it is always billable and always retrievable.
  const row = await createJob(c.env, {
    org_id: auth.orgId,
    api_key_id: auth.keyId,
    model_id: effectiveModel,
    request_params: { prompt: req.prompt, mode: req.mode ?? "text_to_video", duration_seconds: req.duration_seconds, ratio: req.ratio ?? null, resolution: req.resolution },
    num_units: req.duration_seconds,
    unit_label: "second",
    cost_cents: 0,
    deadline_at: new Date(Date.now() + JOB_DEADLINE_MS).toISOString(),
  });
  if (!row) {
    return c.json(errorBody("The job could not be recorded. Retry, or contact support with the request id.", "api_error", "internal_error", requestId), 500);
  }

  const { model: _m, ...rest } = req;
  let upstream: Response;
  try {
    upstream = await partnerVideoCreate(c.env, upstreamKey, { ...rest, model: model.upstream_model_id }, c.req.raw.signal);
  } catch (err) {
    if (c.req.raw.signal.aborted) throw err;
    await updateJob(c.env, row.id, { status: "failed", error_code: "media_unavailable", error_message: "The media service could not be reached." });
    return c.json(errorBody("The media service is temporarily unavailable. Retry in a few seconds.", "api_error", "media_unavailable", requestId), 503, { "Retry-After": "5" });
  }
  const text = await upstream.text();
  if (!upstream.ok) {
    const relayed = relayMediaError(upstream.status, text, requestId);
    console.error(JSON.stringify({ level: "error", message: "video submit upstream error", requestId, orgId: auth.orgId, model: effectiveModel, status: upstream.status, upstreamBody: text.slice(0, 300) }));
    await updateJob(c.env, row.id, { status: "failed", error_code: relayed.body.error.code, error_message: relayed.body.error.message });
    c.executionCtx.waitUntil(sendUsage(c.env, { ...baseUsageEvent(auth, effectiveModel, requestId, startedAt, "video"), status: upstream.status >= 500 ? "error_upstream" : "error_validation", errorCode: `upstream_${upstream.status}`, upstreamProvider: "wokey" }));
    return c.json(relayed.body, relayed.status as ContentfulStatusCode);
  }
  let created: { id?: string; status?: string; mode?: string } = {};
  try { created = JSON.parse(text); } catch { /* handled below */ }
  if (!created.id) {
    await updateJob(c.env, row.id, { status: "failed", error_code: "media_unavailable", error_message: "The media service returned an unexpected response." });
    return c.json(errorBody("The media service returned an unexpected response.", "api_error", "media_unavailable", requestId), 502);
  }

  const recorded = await updateJob(c.env, row.id, {
    upstream_job_id: created.id,
    status: toStoredStatus(created.status ?? "in_progress"),
    request_params: { ...row.request_params, mode: created.mode ?? req.mode ?? "text_to_video" },
    heartbeat_at: new Date().toISOString(),
  });
  // The sweep will still find and settle it if this update failed, because
  // the partner id is what it keys on; only the customer's first view is off.
  return c.json(publicVideoJob(recorded ?? { ...row, upstream_job_id: created.id, status: toStoredStatus(created.status ?? "in_progress") }, null), 202, {
    "X-Ahura-Request-Id": requestId,
    "X-Ahura-Model": effectiveModel,
  });
};

export const videoList: H = async (c) => {
  const auth = c.get("auth");
  const rows = await listJobsForOrg(c.env, auth.orgId, 20);
  return c.json({ object: "list", data: rows.map((r) => publicVideoJob(r, null)) });
};

async function loadOwnedJob(c: Parameters<H>[0]) {
  const auth = c.get("auth");
  const requestId = c.get("requestId");
  const rowId = rowIdFromPublic(c.req.param("id") ?? "");
  const row = rowId ? await getJobForOrg(c.env, rowId, auth.orgId) : null;
  if (!row) {
    return { error: c.json(errorBody("Video job not found.", "invalid_request_error", "video_not_found", requestId), 404) };
  }
  return { row };
}

export const videoGet: H = async (c) => {
  const loaded = await loadOwnedJob(c);
  if ("error" in loaded) return loaded.error;
  let row = loaded.row;
  if (!STORED_TERMINAL.has(row.status) && row.upstream_job_id && c.env.WOKEY_PLATFORM_KEY) {
    const upstream = await partnerVideoGet(c.env, c.env.WOKEY_PLATFORM_KEY, row.upstream_job_id).catch(() => null);
    row = await settleJob(c.env, row, upstream);
    return c.json(publicVideoJob(row, upstream));
  }
  return c.json(publicVideoJob(row, null));
};

export const videoContent: H = async (c) => {
  const requestId = c.get("requestId");
  const loaded = await loadOwnedJob(c);
  if ("error" in loaded) return loaded.error;
  const row = loaded.row;
  if (row.status !== "completed" || !row.upstream_job_id) {
    return c.json(errorBody(`The video is not ready: status is "${row.status}".`, "invalid_request_error", "video_not_ready", requestId), 409);
  }
  const upstream = await partnerVideoContent(c.env, c.env.WOKEY_PLATFORM_KEY, row.upstream_job_id, c.req.raw.signal);
  if (!upstream.ok) {
    return c.json(errorBody("The video file is no longer available. Files are kept for seven days after completion.", "invalid_request_error", "video_content_expired", requestId), upstream.status === 404 ? 410 : 503);
  }
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "video/mp4",
      ...(upstream.headers.get("content-length") ? { "content-length": upstream.headers.get("content-length")! } : {}),
      "content-disposition": `inline; filename="${c.req.param("id")}.mp4"`,
      "X-Ahura-Request-Id": requestId,
    },
  });
};
