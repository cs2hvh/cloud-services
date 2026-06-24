/**
 * POST /v1/videos        — Async video generation
 * GET  /v1/videos/:id    — Poll job status (also checks OR live)
 * POST /v1/videos/:id/retry — Retry a failed/canceled job
 *
 * Flow (decoupled from upstream constraints):
 *   POST → schema-validate → submit to OpenRouter synchronously →
 *     if OR rejects (400/5xx): return error immediately, no DB record created.
 *     if OR accepts (202):     create media_jobs row, return 202 { id }.
 *
 *   GET → read DB status; if still running, check OR live and update DB.
 *     No background tasks (waitUntil) — avoids workerd SIGSEGV under concurrent load.
 *     Stale jobs are recovered by the media-job-watchdog cron.
 *
 * OR owns all parameter validation (duration, resolution, etc.).
 * We never duplicate OR's rules — its error messages surface directly to callers.
 *
 * Billing: per output second (unitLabel = 'video_second').
 */
import { createClient } from "@supabase/supabase-js";
import type { Handler } from "hono";
import { z } from "zod";
import type { Env, HonoVariables } from "../types.ts";
import {
  gatewayError, buildBaseEvent, enqueueUsage, checkModelScope, resolveRouting,
  resolvePlatformKey, classifyUpstreamError,
} from "../lib/gateway.ts";

const MAX_PROMPT = 4000;

const videoSchema = z.object({
  model:        z.string().min(1),
  prompt:       z.string().min(1).max(MAX_PROMPT),
  duration:     z.number().int().min(1).max(120).optional().default(5),
  aspect_ratio: z.string().regex(/^\d+:\d+$/).optional().default("16:9"),
  resolution:   z.string().regex(/^\d+[pPkK]$/).optional().default("720p"),
  image_url:    z.string().url().or(z.string().startsWith("data:image/")).optional(),
});

// OR GET /videos/{id} response
interface OrVideoJob {
  id:             string;
  status:         "pending" | "in_progress" | "completed" | "failed" | "cancelled" | "expired";
  unsigned_urls?: string[];
  error?:         string | null;
}

function makeSupabase(env: Env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

function buildOrBody(req: z.infer<typeof videoSchema>, upstreamModelId: string) {
  return JSON.stringify({
    model:        upstreamModelId,
    prompt:       req.prompt,
    duration:     req.duration,
    aspect_ratio: req.aspect_ratio,
    resolution:   req.resolution,
    ...(req.image_url ? {
      frame_images: [{
        type:       "image_url",
        image_url:  { url: req.image_url },
        frame_type: "first_frame",
      }],
    } : {}),
  });
}

// ── POST /v1/videos ───────────────────────────────────────────────────────────

export const createVideoJob: Handler<{ Bindings: Env; Variables: HonoVariables }> = async (c) => {
  const auth      = c.get("auth");
  const requestId = c.get("requestId");
  const startedAt = c.get("startedAt");

  let rawBody: unknown;
  try { rawBody = await c.req.json(); }
  catch {
    return c.json(gatewayError("Invalid JSON body", "invalid_request_error", "invalid_json", requestId), 400);
  }

  const parsed = videoSchema.safeParse(rawBody);
  if (!parsed.success) {
    return c.json(gatewayError(
      parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      "invalid_request_error", "invalid_request", requestId,
    ), 400);
  }
  const req = parsed.data;

  const scopeErr = checkModelScope(auth, req.model, requestId);
  if (scopeErr) return c.json(scopeErr, 403);

  const routing = await resolveRouting(c.env, req.model, requestId);
  if (!routing.ok) return c.json(routing.error, 503);

  const keyResult = await resolvePlatformKey(c.env, auth, requestId);
  if (!keyResult.ok) return c.json(keyResult.error, 400);

  const orBase = c.env.OPENROUTER_BASE_URL.replace(/\/+$/, "");

  // ── Submit to OR synchronously ────────────────────────────────────────────
  // OR validates all model-specific constraints (duration, resolution, etc.).
  // If it rejects, we return the error immediately — no DB record created.
  let submitResp: Response;
  try {
    submitResp = await fetch(`${orBase}/videos`, {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${keyResult.key}`,
        "Content-Type":  "application/json",
        "HTTP-Referer":  "https://ahurasense.com",
        "X-Title":       "AhuraCloud",
      },
      body: buildOrBody(req, routing.upstreamModelId),
    });
  } catch (err) {
    console.error(JSON.stringify({ level: "error", scope: "video", requestId, message: "OR submit network error", err: String(err) }));
    return c.json(gatewayError(
      "Video generation service is temporarily unavailable. Please try again.",
      "server_error", "service_unavailable", requestId,
    ), 503);
  }

  if (!submitResp.ok) {
    const errText = await submitResp.text().catch(() => "");
    console.error(JSON.stringify({ level: "error", scope: "video", requestId, httpStatus: submitResp.status, upstreamErr: errText.slice(0, 300) }));

    // Surface OR's validation message directly (safe — describes the request, not our internals)
    let orMessage: string | null = null;
    try {
      const parsed = JSON.parse(errText) as { error?: { message?: string } };
      orMessage = parsed?.error?.message ?? null;
    } catch { /* non-JSON */ }

    if (submitResp.status === 400 && orMessage) {
      return c.json(gatewayError(orMessage, "invalid_request_error", "invalid_request", requestId), 400);
    }

    const { status, retryAfter, errorType, errorCode, message } = classifyUpstreamError(submitResp.status, submitResp.headers);
    if (retryAfter) c.header("Retry-After", retryAfter);
    return c.json(gatewayError(message, errorType, errorCode, requestId), status as 429 | 408 | 503);
  }

  const initJob = (await submitResp.json()) as OrVideoJob;
  const orJobId = initJob.id;

  // ── Create DB record (OR accepted the job) ────────────────────────────────
  const supabase = makeSupabase(c.env);
  const deadline = new Date(Date.now() + 10 * 60 * 1000);

  const { data: job, error: insertErr } = await supabase
    .schema("inference")
    .from("media_jobs")
    .insert({
      org_id:         auth.orgId,
      api_key_id:     auth.keyId,
      modality:       "video",
      model_id:       req.model,
      status:         "running",
      claimed_at:     new Date().toISOString(),
      heartbeat_at:   new Date().toISOString(),
      upstream_job_id: orJobId,
      request_params: {
        prompt: req.prompt, duration: req.duration,
        aspect_ratio: req.aspect_ratio, resolution: req.resolution,
        ...(req.image_url ? { image_url: req.image_url } : {}),
      },
      deadline_at: deadline.toISOString(),
    })
    .select("id")
    .single<{ id: string }>();

  if (insertErr || !job) {
    console.error(JSON.stringify({ level: "error", scope: "video", requestId, message: "DB insert failed after OR acceptance", orJobId, err: String(insertErr?.message) }));
    return c.json(gatewayError(
      "Video generation service is temporarily unavailable. Please try again.",
      "server_error", "service_unavailable", requestId,
    ), 503);
  }

  // OR may have completed instantly (e.g. cached); handle that path.
  if (initJob.status === "completed" && initJob.unsigned_urls?.[0]) {
    await supabase.schema("inference").from("media_jobs")
      .update({ status: "completed", output_url: initJob.unsigned_urls[0], num_units: req.duration, unit_label: "video_second" })
      .eq("id", job.id);
    void enqueueUsage(c.env, buildBaseEvent(auth, req.model, "video", requestId, startedAt, { numUnits: req.duration, unitLabel: "video_second" }));
    const origin = new URL(c.req.url).origin;
    const proxyUrl = `${origin}/v1/videos/${job.id}/content`;
    return c.json({ id: job.id, status: "completed", model: req.model, url: proxyUrl, data: [{ url: proxyUrl }] }, 202, {
      "X-Ahura-Request-Id": requestId, "X-Ahura-Model": req.model,
    });
  }

  return c.json(
    { id: job.id, status: "queued", model: req.model },
    202,
    { "X-Ahura-Request-Id": requestId, "X-Ahura-Model": req.model },
  );
};

// ── GET /v1/videos/:id ────────────────────────────────────────────────────────
// Reads DB status; if still running, fetches live status from OR and updates DB.
// No background tasks — the frontend poll drives all OR status checks.

export const getVideoJob: Handler<{ Bindings: Env; Variables: HonoVariables }> = async (c) => {
  const auth      = c.get("auth");
  const requestId = c.get("requestId");
  const startedAt = c.get("startedAt");
  const jobId     = c.req.param("id");

  if (!jobId) {
    return c.json(gatewayError("Missing job id", "invalid_request_error", "invalid_request", requestId), 400);
  }

  const supabase = makeSupabase(c.env);
  const { data: job } = await supabase
    .schema("inference")
    .from("media_jobs")
    .select("id, org_id, model_id, status, output_url, error_code, upstream_job_id, request_params, created_at, updated_at")
    .eq("id", jobId)
    .eq("org_id", auth.orgId)
    .maybeSingle<{
      id: string; org_id: string; model_id: string; status: string;
      output_url: string | null; error_code: string | null;
      upstream_job_id: string | null;
      request_params: Record<string, unknown> | null;
      created_at: string; updated_at: string;
    }>();

  if (!job) {
    return c.json(gatewayError("Video job not found", "invalid_request_error", "not_found", requestId), 404);
  }

  // ── Live OR status check when DB says running ─────────────────────────────
  // This drives job completion without any background tasks in the worker.
  if (job.status === "running" && job.upstream_job_id) {
    const keyResult = await resolvePlatformKey(c.env, auth, requestId);
    if (keyResult.ok) {
      const orBase = c.env.OPENROUTER_BASE_URL.replace(/\/+$/, "");
      try {
        const orResp = await fetch(`${orBase}/videos/${job.upstream_job_id}`, {
          headers: { "Authorization": `Bearer ${keyResult.key}` },
        });

        if (orResp.ok) {
          const orJob = (await orResp.json()) as OrVideoJob;

          if (orJob.status === "completed" && orJob.unsigned_urls?.[0]) {
            const duration = Number(job.request_params?.duration ?? 5);
            await supabase.schema("inference").from("media_jobs")
              .update({ status: "completed", output_url: orJob.unsigned_urls[0], num_units: duration, unit_label: "video_second" })
              .eq("id", jobId);
            void enqueueUsage(c.env, buildBaseEvent(auth, job.model_id, "video", requestId, startedAt, {
              numUnits: duration, unitLabel: "video_second",
            }));
            job.status     = "completed";
            job.output_url = orJob.unsigned_urls[0];

          } else if (orJob.status === "failed" || orJob.status === "cancelled" || orJob.status === "expired") {
            const errorCode =
              orJob.status === "failed"    ? "upstream_generation_failed" :
              orJob.status === "cancelled" ? "upstream_cancelled" :
                                             "upstream_expired";
            await supabase.schema("inference").from("media_jobs")
              .update({ status: "failed", error_code: errorCode })
              .eq("id", jobId);
            void enqueueUsage(c.env, buildBaseEvent(auth, job.model_id, "video", requestId, startedAt, {
              numUnits: 0, unitLabel: "video_second", status: "error_upstream", errorCode,
            }));
            job.status     = "failed";
            job.error_code = errorCode;

          } else {
            // Still pending/in_progress — bump heartbeat for watchdog
            void supabase.schema("inference").from("media_jobs")
              .update({ heartbeat_at: new Date().toISOString() })
              .eq("id", jobId);
          }
        }
      } catch (err) {
        // OR unreachable — return current DB state; watchdog will recover
        console.warn(JSON.stringify({ level: "warn", scope: "video", jobId, message: "OR status check failed", err: String(err) }));
      }
    }
  }

  // Proxy URL hides the upstream provider from the API consumer.
  // Callers should use /v1/videos/:id/content — never the raw OR URL.
  const origin = new URL(c.req.url).origin;

  const body: Record<string, unknown> = {
    id:         job.id,
    model:      job.model_id,
    status:     job.status,
    created_at: job.created_at,
    updated_at: job.updated_at,
  };

  if (job.status === "completed" && job.output_url) {
    const proxyUrl = `${origin}/v1/videos/${job.id}/content`;
    body.url  = proxyUrl;
    body.data = [{ url: proxyUrl }];
  }
  if (job.status === "failed") {
    const code = job.error_code ?? "generation_failed";
    const message =
      code === "watchdog_timeout"           ? "Video generation timed out. Please try again." :
      code === "upstream_cancelled"         ? "Video generation was cancelled. Please try again." :
      code === "upstream_expired"           ? "Video generation expired. Please try again." :
      code === "upstream_generation_failed" ? "Video generation failed. Please try a different prompt." :
                                             "Video generation failed. Please try again.";
    body.error = { code, message };
  }

  const httpStatus = job.status === "completed" ? 200 : job.status === "failed" ? 422 : 202;

  return c.json(body, httpStatus, {
    "X-Ahura-Request-Id": requestId,
    "X-Ahura-Model":      job.model_id,
  });
};

// ── GET /v1/videos/:id/content ────────────────────────────────────────────────
// Proxy the OR video bytes so the browser never needs OR credentials.
// Forwards Range headers for seeking; returns Content-Disposition for download.

export const getVideoContent: Handler<{ Bindings: Env; Variables: HonoVariables }> = async (c) => {
  const auth      = c.get("auth");
  const requestId = c.get("requestId");
  const jobId     = c.req.param("id");

  const supabase = makeSupabase(c.env);
  const { data: job } = await supabase
    .schema("inference")
    .from("media_jobs")
    .select("id, org_id, status, output_url")
    .eq("id", jobId)
    .eq("org_id", auth.orgId)
    .maybeSingle<{ id: string; org_id: string; status: string; output_url: string | null }>();

  if (!job) {
    return c.json(gatewayError("Video job not found", "invalid_request_error", "not_found", requestId), 404);
  }
  if (job.status !== "completed" || !job.output_url) {
    return c.json(gatewayError("Video is not yet ready", "invalid_request_error", "not_ready", requestId), 409);
  }

  const keyResult = await resolvePlatformKey(c.env, auth, requestId);
  if (!keyResult.ok) return c.json(keyResult.error, 502);

  const fetchHeaders: Record<string, string> = {
    "Authorization": `Bearer ${keyResult.key}`,
  };
  const rangeHeader = c.req.header("Range");
  if (rangeHeader) fetchHeaders["Range"] = rangeHeader;

  let orResp: Response;
  try {
    orResp = await fetch(job.output_url, { headers: fetchHeaders });
  } catch (err) {
    console.error(JSON.stringify({ level: "error", scope: "video-content", jobId, message: "OR fetch failed", err: String(err) }));
    return c.json(gatewayError("Video content unavailable", "server_error", "service_unavailable", requestId), 502);
  }

  if (!orResp.ok && orResp.status !== 206) {
    return c.json(gatewayError("Video content unavailable", "server_error", "service_unavailable", requestId), 502);
  }

  const outHeaders: Record<string, string> = {
    "Content-Type":               orResp.headers.get("Content-Type") ?? "video/mp4",
    "Content-Disposition":        'inline; filename="video.mp4"',
    "Cache-Control":              "private, max-age=3600",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
    "X-Ahura-Request-Id":         requestId,
  };
  const cl = orResp.headers.get("Content-Length");   if (cl)  outHeaders["Content-Length"]  = cl;
  const cr = orResp.headers.get("Content-Range");    if (cr)  outHeaders["Content-Range"]   = cr;
  const ar = orResp.headers.get("Accept-Ranges");    if (ar)  outHeaders["Accept-Ranges"]   = ar;

  return new Response(orResp.body, { status: orResp.status, headers: outHeaders });
};

// ── POST /v1/videos/:id/retry ─────────────────────────────────────────────────

export const retryVideoJob: Handler<{ Bindings: Env; Variables: HonoVariables }> = async (c) => {
  const auth      = c.get("auth");
  const requestId = c.get("requestId");
  const jobId     = c.req.param("id");

  if (!jobId) {
    return c.json(gatewayError("Missing job id", "invalid_request_error", "invalid_request", requestId), 400);
  }

  const supabase = makeSupabase(c.env);
  const { data: job } = await supabase
    .schema("inference")
    .from("media_jobs")
    .select("id, org_id, model_id, status, request_params")
    .eq("id", jobId)
    .eq("org_id", auth.orgId)
    .maybeSingle<{
      id: string; org_id: string; model_id: string; status: string;
      request_params: { prompt: string; duration?: number; aspect_ratio?: string; resolution?: string; image_url?: string };
    }>();

  if (!job) {
    return c.json(gatewayError("Video job not found", "invalid_request_error", "not_found", requestId), 404);
  }

  if (job.status !== "failed" && job.status !== "canceled") {
    return c.json(
      gatewayError(`Job cannot be retried (status: ${job.status})`, "invalid_request_error", "invalid_state", requestId),
      409,
    );
  }

  const scopeErr = checkModelScope(auth, job.model_id, requestId);
  if (scopeErr) return c.json(scopeErr, 403);

  const routing = await resolveRouting(c.env, job.model_id, requestId);
  if (!routing.ok) return c.json(routing.error, 503);

  const keyResult = await resolvePlatformKey(c.env, auth, requestId);
  if (!keyResult.ok) return c.json(keyResult.error, 400);

  const req = {
    model:        job.model_id,
    prompt:       job.request_params.prompt,
    duration:     job.request_params.duration     ?? 5,
    aspect_ratio: job.request_params.aspect_ratio ?? "16:9",
    resolution:   job.request_params.resolution   ?? "720p",
    image_url:    job.request_params.image_url,
  };

  const orBase = c.env.OPENROUTER_BASE_URL.replace(/\/+$/, "");

  // Re-submit to OR — OR validates, we don't
  let submitResp: Response;
  try {
    submitResp = await fetch(`${orBase}/videos`, {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${keyResult.key}`,
        "Content-Type":  "application/json",
        "HTTP-Referer":  "https://ahurasense.com",
        "X-Title":       "AhuraCloud",
      },
      body: buildOrBody(req, routing.upstreamModelId),
    });
  } catch (err) {
    return c.json(gatewayError("Video generation service is temporarily unavailable.", "server_error", "service_unavailable", requestId), 503);
  }

  if (!submitResp.ok) {
    const errText = await submitResp.text().catch(() => "");
    let orMessage: string | null = null;
    try { orMessage = (JSON.parse(errText) as { error?: { message?: string } })?.error?.message ?? null; } catch { /* */ }
    if (submitResp.status === 400 && orMessage) {
      return c.json(gatewayError(orMessage, "invalid_request_error", "invalid_request", requestId), 400);
    }
    const { status, errorType, errorCode, message } = classifyUpstreamError(submitResp.status, submitResp.headers);
    return c.json(gatewayError(message, errorType, errorCode, requestId), status as 429 | 408 | 503);
  }

  const initJob = (await submitResp.json()) as OrVideoJob;
  const orJobId = initJob.id;
  const deadline = new Date(Date.now() + 10 * 60 * 1000);

  await supabase.schema("inference").from("media_jobs")
    .update({
      status: "running", error_code: null, claimed_at: new Date().toISOString(),
      heartbeat_at: new Date().toISOString(), upstream_job_id: orJobId,
      deadline_at: deadline.toISOString(),
    })
    .eq("id", jobId);

  return c.json(
    { id: jobId, status: "queued" },
    202,
    { "X-Ahura-Request-Id": requestId, "X-Ahura-Model": job.model_id },
  );
};
