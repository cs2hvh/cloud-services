/**
 * POST /v1/videos        — Async video generation
 * GET  /v1/videos/:id    — Poll job status
 * POST /v1/videos/:id/retry — Retry a failed/canceled job
 *
 * Async job model:
 *   POST → validates, creates inference.media_jobs row (status=queued), returns 202 { id, status }.
 *   Worker uses waitUntil to call the upstream inline (Phase 1: no separate media-runner).
 *   GET /v1/videos/:id → reads job row, returns status + output_url when completed.
 *
 * Billing: per output second (unitLabel = 'video_second', key: 'cents_per_media_second').
 */
import { createClient } from "@supabase/supabase-js";
import type { Handler } from "hono";
import { z } from "zod";
import type { AuthContext, Env, HonoVariables } from "../types.ts";
import {
  gatewayError, buildBaseEvent, checkModelScope, resolveRouting,
  resolvePlatformKey, classifyUpstreamError,
} from "../lib/gateway.ts";

const MAX_PROMPT = 4000;

const videoSchema = z.object({
  model:        z.string().min(1),
  prompt:       z.string().min(1).max(MAX_PROMPT),
  duration:     z.number().int().min(1).max(60).optional().default(8),
  aspect_ratio: z.string().regex(/^\d+:\d+$/).optional().default("16:9"),
  resolution:   z.enum(["360p", "480p", "720p", "1080p"]).optional().default("720p"),
});

// OpenRouter POST /videos response shape (202 async job)
interface OpenRouterVideoJob {
  id:           string;
  status:       "pending" | "in_progress" | "completed" | "failed" | "cancelled" | "expired";
  unsigned_urls?: string[];
  error?:       string | null;
}

function makeSupabase(env: Env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
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

  // Create job record
  const supabase = makeSupabase(c.env);
  const deadline = new Date(Date.now() + 10 * 60 * 1000); // 10-minute deadline

  const { data: job, error: insertErr } = await supabase
    .schema("inference")
    .from("media_jobs")
    .insert({
      org_id:        auth.orgId,
      api_key_id:    auth.keyId,
      modality:      "video",
      model_id:      req.model,
      status:        "queued",
      request_params: { prompt: req.prompt, duration: req.duration, aspect_ratio: req.aspect_ratio, resolution: req.resolution },
      deadline_at:   deadline.toISOString(),
    })
    .select("id")
    .single<{ id: string }>();

  if (insertErr || !job) {
    console.error(JSON.stringify({ level: "error", scope: "video", requestId, message: "Failed to create media job", err: String(insertErr?.message) }));
    return c.json(gatewayError("Video generation service is temporarily unavailable. Please try again.", "server_error", "service_unavailable", requestId), 503);
  }

  const jobId = job.id;

  // Settle the job inline via waitUntil (Phase 1: no separate media-runner).
  // Worker holds the upstream connection open after returning 202.
  c.executionCtx.waitUntil(settleVideoJob({
    env: c.env, jobId, auth, req,
    upstreamModelId: routing.upstreamModelId,
    upstreamKey:     keyResult.key,
    requestId,
    startedAt,
  }));

  return c.json(
    { id: jobId, status: "queued", model: req.model },
    202,
    { "X-Ahura-Request-Id": requestId, "X-Ahura-Model": req.model },
  );
};

// ── GET /v1/videos/:id ────────────────────────────────────────────────────────

export const getVideoJob: Handler<{ Bindings: Env; Variables: HonoVariables }> = async (c) => {
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
    .select("id, org_id, model_id, status, output_url, error_code, created_at, updated_at")
    .eq("id", jobId)
    .eq("org_id", auth.orgId)   // scope to caller's org
    .maybeSingle<{
      id: string; org_id: string; model_id: string; status: string;
      output_url: string | null; error_code: string | null;
      created_at: string; updated_at: string;
    }>();

  if (!job) {
    return c.json(gatewayError("Video job not found", "invalid_request_error", "not_found", requestId), 404);
  }

  const body: Record<string, unknown> = {
    id:         job.id,
    model:      job.model_id,
    status:     job.status,
    created_at: job.created_at,
    updated_at: job.updated_at,
  };

  if (job.status === "completed" && job.output_url) {
    body.output_url = job.output_url;
    body.data = [{ url: job.output_url }];
  }
  if (job.status === "failed") {
    body.error = { code: job.error_code ?? "generation_failed" };
  }

  const httpStatus = job.status === "completed" ? 200 : job.status === "failed" ? 422 : 202;

  return c.json(body, httpStatus, {
    "X-Ahura-Request-Id": requestId,
    "X-Ahura-Model":      job.model_id,
  });
};

// ── Background settlement ─────────────────────────────────────────────────────

async function settleVideoJob(args: {
  env: Env;
  jobId: string;
  auth: AuthContext;
  req: z.infer<typeof videoSchema>;
  upstreamModelId: string;
  upstreamKey: string;
  requestId: string;
  startedAt: number;
}): Promise<void> {
  const { env, jobId, auth, req, upstreamModelId, upstreamKey, requestId, startedAt } = args;
  const supabase = makeSupabase(env);

  // Mark as running
  await supabase.schema("inference").from("media_jobs")
    .update({ status: "running", claimed_at: new Date().toISOString(), heartbeat_at: new Date().toISOString() })
    .eq("id", jobId);

  const orBase = env.OPENROUTER_BASE_URL.replace(/\/+$/, "");

  try {
    // POST /videos — OpenRouter returns 202 with a pending async job
    const submitResp = await fetch(`${orBase}/videos`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${upstreamKey}`,
        "Content-Type":  "application/json",
        "HTTP-Referer":  "https://ahurasense.com",
        "X-Title":       "AhuraCloud",
      },
      body: JSON.stringify({
        model:        upstreamModelId,
        prompt:       req.prompt,
        duration:     req.duration,
        aspect_ratio: req.aspect_ratio,
        resolution:   req.resolution,
      }),
    });

    if (!submitResp.ok) {
      const errText = await submitResp.text().catch(() => "");
      console.error(JSON.stringify({ level: "error", scope: "video", jobId, requestId, httpStatus: submitResp.status, upstreamErr: errText.slice(0, 200) }));
      const { errorCode } = classifyUpstreamError(submitResp.status, submitResp.headers);
      await supabase.schema("inference").from("media_jobs")
        .update({ status: "failed", error_code: errorCode })
        .eq("id", jobId);
      await env.USAGE_EVENTS.send(buildBaseEvent(auth, req.model, "video", requestId, startedAt, {
        numUnits: 0, unitLabel: "video_second", status: "error_upstream", errorCode,
      }));
      return;
    }

    const initJob = (await submitResp.json()) as OpenRouterVideoJob;
    const orJobId = initJob.id;

    // Poll GET /videos/{orJobId} until completed (max 60 × 5 s = 5 min)
    let outputUrl: string | null = initJob.unsigned_urls?.[0] ?? null;
    let finalStatus = initJob.status;

    if (finalStatus !== "completed" && finalStatus !== "failed" && finalStatus !== "cancelled" && finalStatus !== "expired") {
      const POLL_ATTEMPTS = 60;
      for (let i = 0; i < POLL_ATTEMPTS; i++) {
        await new Promise<void>((resolve) => setTimeout(resolve, 5000));

        let pollResp: Response;
        try { pollResp = await fetch(`${orBase}/videos/${orJobId}`, { headers: { "Authorization": `Bearer ${upstreamKey}` } }); }
        catch { continue; } // network hiccup — keep polling

        if (!pollResp.ok) continue;

        const pollJob = (await pollResp.json()) as OpenRouterVideoJob;
        finalStatus = pollJob.status;
        if (pollJob.unsigned_urls?.[0]) outputUrl = pollJob.unsigned_urls[0];

        if (finalStatus === "completed" || finalStatus === "failed" || finalStatus === "cancelled" || finalStatus === "expired") break;
      }
    }

    if (finalStatus !== "completed" || !outputUrl) {
      const errorCode = finalStatus === "failed" ? "upstream_generation_failed"
        : finalStatus === "cancelled" ? "upstream_cancelled"
        : finalStatus === "expired"   ? "upstream_expired"
        : "upstream_timeout";
      console.error(JSON.stringify({ level: "error", scope: "video", jobId, requestId, finalStatus, message: "Video generation did not complete" }));
      await supabase.schema("inference").from("media_jobs")
        .update({ status: "failed", error_code: errorCode })
        .eq("id", jobId);
      await env.USAGE_EVENTS.send(buildBaseEvent(auth, req.model, "video", requestId, startedAt, {
        numUnits: 0, unitLabel: "video_second", status: "error_upstream", errorCode,
      }));
      return;
    }

    const durationSecs = req.duration;

    await supabase.schema("inference").from("media_jobs")
      .update({
        status:     "completed",
        output_url: outputUrl,
        num_units:  durationSecs,
        unit_label: "video_second",
      })
      .eq("id", jobId);

    await env.USAGE_EVENTS.send(buildBaseEvent(auth, req.model, "video", requestId, startedAt, {
      numUnits: durationSecs, unitLabel: "video_second",
    }));

  } catch (err) {
    console.error(JSON.stringify({ level: "error", scope: "video", jobId, requestId, message: "Settlement failed", err: String(err) }));
    void supabase.schema("inference").from("media_jobs")
      .update({ status: "failed", error_code: "upstream_fetch_failed" })
      .eq("id", jobId);
  }
}

// ── POST /v1/videos/:id/retry ─────────────────────────────────────────────────

export const retryVideoJob: Handler<{ Bindings: Env; Variables: HonoVariables }> = async (c) => {
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
    .select("id, org_id, model_id, status, request_params")
    .eq("id", jobId)
    .eq("org_id", auth.orgId)
    .maybeSingle<{
      id: string; org_id: string; model_id: string; status: string;
      request_params: { prompt: string; duration?: number; aspect_ratio?: string; resolution?: string };
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

  const deadline = new Date(Date.now() + 10 * 60 * 1000);
  await supabase.schema("inference").from("media_jobs")
    .update({ status: "queued", error_code: null, claimed_at: null, heartbeat_at: null, deadline_at: deadline.toISOString() })
    .eq("id", jobId);

  const req = {
    model:        job.model_id,
    prompt:       job.request_params.prompt,
    duration:     job.request_params.duration     ?? 8,
    aspect_ratio: job.request_params.aspect_ratio ?? "16:9",
    resolution:   (job.request_params.resolution  ?? "720p") as "360p" | "480p" | "720p" | "1080p",
  };

  c.executionCtx.waitUntil(settleVideoJob({
    env: c.env, jobId, auth, req,
    upstreamModelId: routing.upstreamModelId,
    upstreamKey:     keyResult.key,
    requestId,
    startedAt,
  }));

  return c.json(
    { id: jobId, status: "queued" },
    202,
    { "X-Ahura-Request-Id": requestId, "X-Ahura-Model": job.model_id },
  );
};
