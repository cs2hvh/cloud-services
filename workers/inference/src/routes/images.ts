/**
 * POST /v1/images/generations — Image generation.
 *
 * OpenAI-compatible customer surface:
 *   { model, prompt, n?, size?, quality?, response_format?, image_config? }
 *
 * Upstream: OpenRouter dedicated POST /images endpoint.
 * Returns { created, data: [{ b64_json }], usage }.
 * Upstream model/provider names never leave the gateway.
 *
 * Billing: per image returned (numUnits = data.length, unitLabel = 'image').
 * Pricing key in inference.models.pricing: { "cents_per_image": N }
 */
import type { Handler } from "hono";
import { z } from "zod";
import type { Env, HonoVariables } from "../types.ts";
import {
  gatewayError, buildBaseEvent, enqueueUsage, checkModelScope, resolveRouting, resolvePlatformKey,
  classifyUpstreamError,
} from "../lib/gateway.ts";

const MAX_PROMPT_LENGTH = 4000;
const MAX_IMAGES = 4;

const imageConfigSchema = z.object({
  aspect_ratio: z.string().min(1).optional(),
  image_size:   z.enum(["512", "1K", "2K", "4K"]).optional(),
}).passthrough();

const imageGenerationSchema = z.object({
  model:           z.string().min(1),
  prompt:          z.string().min(1).max(MAX_PROMPT_LENGTH),
  n:               z.number().int().min(1).max(MAX_IMAGES).optional(),
  size:            z.string().min(3).max(32).optional(),
  quality:         z.enum(["standard", "hd", "auto"]).optional(),
  response_format: z.enum(["url", "b64_json"]).optional(),
  user:            z.string().max(256).optional(),
  image_config:    imageConfigSchema.optional(),
});

type ImageGenerationRequest = z.infer<typeof imageGenerationSchema>;

interface OpenRouterImagesResponse {
  created?: number;
  data?: Array<{ b64_json?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cost?: number };
}

export const imageGenerations: Handler<{ Bindings: Env; Variables: HonoVariables }> = async (c) => {
  const auth      = c.get("auth");
  const requestId = c.get("requestId");
  const startedAt = c.get("startedAt");

  // 1. Parse request
  let rawBody: unknown;
  try { rawBody = await c.req.json(); }
  catch {
    return c.json(gatewayError("Invalid JSON body", "invalid_request_error", "invalid_json", requestId), 400);
  }

  const parsed = imageGenerationSchema.safeParse(rawBody);
  if (!parsed.success) {
    return c.json(gatewayError(
      parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      "invalid_request_error", "invalid_request", requestId,
    ), 400);
  }
  const req = parsed.data;

  // 2. Scope, routing, key
  const scopeErr = checkModelScope(auth, req.model, requestId);
  if (scopeErr) return c.json(scopeErr, 403);

  const routing = await resolveRouting(c.env, req.model, requestId);
  if (!routing.ok) return c.json(routing.error, 503);

  const keyResult = await resolvePlatformKey(c.env, auth, requestId);
  if (!keyResult.ok) return c.json(keyResult.error, 400);

  // 3. Forward to OpenRouter dedicated /images endpoint
  const imagesUrl = `${c.env.OPENROUTER_BASE_URL.replace(/\/+$/, "")}/images`;
  let upstreamResp: Response;
  try {
    upstreamResp = await fetch(imagesUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${keyResult.key}`,
        "Content-Type":  "application/json",
        "HTTP-Referer":  "https://ahurasense.com",
        "X-Title":       "AhuraCloud",
      },
      body: JSON.stringify(buildImagesBody(req, routing.upstreamModelId)),
      signal: c.req.raw.signal,
    });
  } catch (err) {
    console.error(JSON.stringify({ level: "error", scope: "images", requestId, message: "Upstream fetch failed", err: String(err) }));
    c.executionCtx.waitUntil(enqueueUsage(c.env, buildBaseEvent(auth, req.model, "image", requestId, startedAt, {
      numUnits: 0, unitLabel: "image", status: "error_upstream", errorCode: "upstream_fetch_failed",
    })));
    return c.json(gatewayError("Image generation service is temporarily unavailable. Please try again.", "server_error", "service_unavailable", requestId), 503);
  }

  if (!upstreamResp.ok) {
    const errText = await upstreamResp.text().catch(() => "");
    console.error(JSON.stringify({ level: "error", scope: "images", requestId, httpStatus: upstreamResp.status, upstreamErr: errText.slice(0, 200) }));
    c.executionCtx.waitUntil(enqueueUsage(c.env, buildBaseEvent(auth, req.model, "image", requestId, startedAt, {
      numUnits: 0, unitLabel: "image", status: "error_upstream", errorCode: `upstream_${upstreamResp.status}`,
    })));
    // Surface prompt-quality rejections clearly rather than hiding them as 503
    if (errText.toLowerCase().includes("no image data") || errText.toLowerCase().includes("no images")) {
      return c.json(gatewayError(
        "Your prompt didn't produce an image. Try a more descriptive visual prompt, e.g. \"a mountain landscape at sunset, photorealistic\".",
        "invalid_request_error", "prompt_rejected", requestId,
      ), 422);
    }
    const { status, retryAfter, errorType, errorCode, message } = classifyUpstreamError(upstreamResp.status, upstreamResp.headers);
    if (retryAfter) c.header("Retry-After", retryAfter);
    return c.json(gatewayError(message, errorType, errorCode, requestId), status as 429 | 408 | 503);
  }

  let upstreamBody: OpenRouterImagesResponse;
  try {
    upstreamBody = (await upstreamResp.json()) as OpenRouterImagesResponse;
  } catch {
    c.executionCtx.waitUntil(enqueueUsage(c.env, buildBaseEvent(auth, req.model, "image", requestId, startedAt, {
      numUnits: 0, unitLabel: "image", status: "error_upstream", errorCode: "upstream_invalid_response",
    })));
    return c.json(gatewayError("Image generation service is temporarily unavailable. Please try again.", "server_error", "service_unavailable", requestId), 503);
  }

  const items = (upstreamBody.data ?? []).filter((d) => typeof d.b64_json === "string" && d.b64_json.length > 0);
  if (items.length === 0) {
    console.error(JSON.stringify({ level: "error", scope: "images", requestId, message: "Upstream returned no images", upstream: JSON.stringify(upstreamBody).slice(0, 300) }));
    c.executionCtx.waitUntil(enqueueUsage(c.env, buildBaseEvent(auth, req.model, "image", requestId, startedAt, {
      numUnits: 0, unitLabel: "image", status: "error_upstream", errorCode: "upstream_no_images",
    })));
    return c.json(gatewayError(
      "Your prompt didn't produce an image. Try a more descriptive visual prompt, e.g. \"a mountain landscape at sunset, photorealistic\".",
      "invalid_request_error", "prompt_rejected", requestId,
    ), 422);
  }

  const responseFormat = req.response_format ?? "b64_json";
  const data           = items.map((d) => normalizeImage(d.b64_json!, responseFormat));
  const imageCount     = data.length;

  c.executionCtx.waitUntil(enqueueUsage(c.env, buildBaseEvent(auth, req.model, "image", requestId, startedAt, {
    numUnits: imageCount, unitLabel: "image",
  })));

  return c.json(
    { created: Math.floor(Date.now() / 1000), data, model: req.model, usage: { images: imageCount } },
    200,
    { "X-Ahura-Request-Id": requestId, "X-Ahura-Model": req.model },
  );
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildImagesBody(req: ImageGenerationRequest, upstreamModelId: string) {
  const body: Record<string, unknown> = {
    model:  upstreamModelId,
    prompt: req.prompt,
  };

  if (req.n && req.n > 1) body.n = req.n;

  // aspect_ratio: prefer explicit image_config, fall back to deriving from size
  const aspectRatio = req.image_config?.aspect_ratio ?? sizeToAspectRatio(req.size);
  if (aspectRatio) body.aspect_ratio = aspectRatio;

  // resolution: 512 / 1K / 2K / 4K
  const resolution = req.image_config?.image_size;
  if (resolution) body.resolution = resolution;

  // quality mapping: customer "standard"/"hd"/"auto" → OpenRouter "auto"/"medium"/"high"
  const quality = mapQuality(req.quality);
  if (quality) body.quality = quality;

  return body;
}

function mapQuality(q: string | undefined): string | null {
  if (!q || q === "auto") return null;  // let OpenRouter pick
  if (q === "hd") return "high";
  return "medium"; // "standard"
}

function sizeToAspectRatio(size: string | undefined): string | null {
  if (!size) return null;
  const match = /^(\d+)x(\d+)$/.exec(size.trim());
  if (!match) return null;
  const w = Number(match[1]);
  const h = Number(match[2]);
  if (!Number.isFinite(w) || !Number.isFinite(h) || h === 0) return null;
  const g = gcd(w, h);
  return `${w / g}:${h / g}`;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) { const n = x % y; x = y; y = n; }
  return x || 1;
}

function normalizeImage(b64: string, responseFormat: "url" | "b64_json") {
  if (responseFormat === "url") {
    // Return as a data URI — works in browsers and the playground <img> element
    return { url: `data:image/png;base64,${b64}` };
  }
  return { b64_json: b64 };
}
