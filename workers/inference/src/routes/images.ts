/**
 * POST /v1/images/generations — OpenAI Images–compatible, one image per
 * request, returned as base64. Served by the partner that carries image
 * models; billed per image at the tier the requested size falls in.
 */
import type { Handler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import type { Env, HonoVariables } from "../types.ts";
import { resolveModelId } from "../lib/aliases.ts";
import { resolveUpstreamKey } from "../lib/wokey.ts";
import { imageTierFor, loadMediaModel, partnerImage, relayMediaError } from "../lib/media.ts";
import { baseUsageEvent, errorBody, sendUsage } from "../lib/usage-events.ts";

const schema = z
  .object({
    model: z.string().min(1),
    prompt: z.string().min(1).max(4000),
    n: z.number().int().min(1).max(4).optional(),
    size: z.string().regex(/^\d{3,4}x\d{3,4}$|^auto$/).optional(),
    response_format: z.enum(["b64_json", "url"]).optional(),
    stream: z.boolean().optional(),
    user: z.string().optional(),
  })
  .passthrough();

export const imageGenerations: Handler<{ Bindings: Env; Variables: HonoVariables }> = async (c) => {
  const auth = c.get("auth");
  const requestId = c.get("requestId");
  const startedAt = c.get("startedAt");

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(errorBody("Invalid JSON body", "invalid_request_error", "invalid_json", requestId), 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return c.json(errorBody(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), "invalid_request_error", "invalid_request", requestId), 400);
  }
  const req = parsed.data;

  if (req.stream) {
    return c.json(errorBody("Streaming partial images is not available yet; omit `stream`.", "invalid_request_error", "stream_unsupported", requestId), 400);
  }
  if (req.response_format === "url") {
    return c.json(errorBody("Images are returned as base64: set response_format to \"b64_json\" or omit it.", "invalid_request_error", "response_format_unsupported", requestId), 400);
  }
  if ((req.n ?? 1) !== 1) {
    return c.json(errorBody("One image per request: set n to 1 or omit it.", "invalid_request_error", "n_unsupported", requestId), 400);
  }

  const effectiveModel = await resolveModelId(c.env, req.model);
  if (auth.allowedModels && auth.allowedModels.length > 0 && !auth.allowedModels.includes(effectiveModel) && !auth.allowedModels.includes(req.model)) {
    return c.json(errorBody(`Model "${req.model}" is not allowed for this API key`, "invalid_request_error", "model_not_allowed", requestId), 403);
  }

  const model = await loadMediaModel(c.env, effectiveModel);
  if (!model || !model.is_active) {
    return c.json(errorBody("The requested model is not available. Call GET /v1/models for the current list.", "invalid_request_error", "model_not_found", requestId), 404);
  }
  if (model.modality !== "image") {
    return c.json(errorBody(`"${effectiveModel}" does not generate images. Pick a model whose modality is "image".`, "invalid_request_error", "model_wrong_modality", requestId), 400);
  }
  if (model.upstream_provider !== "wokey" || !model.upstream_model_id) {
    return c.json(errorBody("The requested model is not available right now.", "api_error", "model_unavailable", requestId), 503);
  }
  const sizes = (model.capabilities?.sizes ?? null) as string[] | null;
  if (req.size && req.size !== "auto" && sizes && !sizes.includes(req.size)) {
    return c.json(errorBody(`Size "${req.size}" is not offered by this model. Supported: ${sizes.join(", ")}.`, "invalid_request_error", "size_unsupported", requestId), 400);
  }

  let upstreamKey: string;
  try {
    upstreamKey = await resolveUpstreamKey(c.env, auth.billing, auth.orgId, auth.byokProvider);
  } catch (err) {
    return c.json(errorBody(err instanceof Error ? err.message : "BYOK key unavailable", "invalid_request_error", "byok_unavailable", requestId), 400);
  }

  c.header("X-Ahura-Model", effectiveModel);
  c.header("X-Ahura-Billing", auth.billing);

  const { model: _m, stream: _s, ...rest } = req;
  const upstreamBody = { ...rest, model: model.upstream_model_id, n: 1, response_format: "b64_json" };

  let upstream: Response;
  try {
    upstream = await partnerImage(c.env, upstreamKey, upstreamBody, c.req.raw.signal);
  } catch (err) {
    if (c.req.raw.signal.aborted) throw err;
    c.executionCtx.waitUntil(sendUsage(c.env, { ...baseUsageEvent(auth, effectiveModel, requestId, startedAt, "image"), status: "error_upstream", errorCode: "upstream_unreachable" }));
    return c.json(errorBody("The media service is temporarily unavailable. Retry in a few seconds.", "api_error", "media_unavailable", requestId), 503, { "Retry-After": "5" });
  }

  const text = await upstream.text();
  if (!upstream.ok) {
    const relayed = relayMediaError(upstream.status, text, requestId);
    console.error(JSON.stringify({ level: "error", message: "image upstream error", requestId, orgId: auth.orgId, model: effectiveModel, status: upstream.status, upstreamBody: text.slice(0, 300) }));
    c.executionCtx.waitUntil(sendUsage(c.env, { ...baseUsageEvent(auth, effectiveModel, requestId, startedAt, "image"), status: upstream.status >= 500 ? "error_upstream" : "error_validation", errorCode: `upstream_${upstream.status}`, upstreamProvider: "wokey" }));
    return c.json(relayed.body, relayed.status as ContentfulStatusCode, { "X-Ahura-Request-Id": requestId, "X-Ahura-Model": effectiveModel });
  }

  let images = 1;
  try {
    const j = JSON.parse(text) as { data?: unknown[] };
    if (Array.isArray(j.data)) images = j.data.length;
  } catch { /* bill one image; the body is passed through regardless */ }

  c.executionCtx.waitUntil(
    sendUsage(c.env, {
      ...baseUsageEvent(auth, effectiveModel, requestId, startedAt, "image"),
      numUnits: images,
      unitLabel: "image",
      unitTier: imageTierFor(model.capabilities, req.size),
      upstreamProvider: "wokey",
      status: "success",
    })
  );

  return new Response(text, {
    status: 200,
    headers: { "content-type": "application/json", "X-Ahura-Request-Id": requestId, "X-Ahura-Model": effectiveModel, "X-Ahura-Billing": auth.billing },
  });
};
