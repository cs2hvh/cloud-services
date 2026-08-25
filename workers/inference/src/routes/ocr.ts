/**
 * POST /v1/ocr — Document OCR / text extraction.
 *
 * Own-verb endpoint (not OpenAI-compatible — no standard exists for document OCR).
 *
 * Customer request — two input shapes:
 *
 *   JSON:      { model, document: { type: "url", url: "https://..." } }
 *   Multipart: model=ahura/ocr-doc + file=@document.pdf
 *
 * Supports: PDF, PNG, JPEG, WEBP, GIF (anything Gemini's vision accepts).
 *
 * Upstream: OpenRouter google/gemini-2.5-flash via chat completions.
 * The document is sent as a data-URI image_url content block; page content
 * is extracted via PAGE_N: markers in the model prompt.
 *
 * Response:
 *   { model, pages: [{ page: 1, markdown: "..." }], usage: { pages: N } }
 *
 * Billing: per page extracted (numUnits = pages.length, unitLabel = 'ocr_page').
 * Pricing key in inference.models.pricing: { "cents_per_page": N }
 */
import type { Handler } from "hono";
import { z } from "zod";
import type { Env, HonoVariables } from "../types.ts";
import {
  gatewayError, buildBaseEvent, enqueueUsage, checkModelScope, resolveRouting, resolvePlatformKey,
  classifyUpstreamError, buildBaseSpan, enqueueTrace,
} from "../lib/gateway.ts";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_URL_FETCH  = 20 * 1024 * 1024;

const MIME_PREFIXES: Record<string, string> = {
  "application/pdf": "data:application/pdf;base64,",
  "image/png":       "data:image/png;base64,",
  "image/jpeg":      "data:image/jpeg;base64,",
  "image/jpg":       "data:image/jpeg;base64,",
  "image/webp":      "data:image/webp;base64,",
  "image/gif":       "data:image/gif;base64,",
};

const jsonSchema = z.object({
  model:    z.string().min(1),
  document: z.discriminatedUnion("type", [
    z.object({ type: z.literal("url"),    url:  z.string().url() }),
    z.object({ type: z.literal("base64"), data: z.string().min(1), media_type: z.string().min(1) }),
  ]),
});

export const ocr: Handler<{ Bindings: Env; Variables: HonoVariables }> = async (c) => {
  const auth      = c.get("auth");
  const requestId = c.get("requestId");
  const startedAt = c.get("startedAt");
  const traceId   = c.req.header("X-Ahura-Trace-Id") ?? crypto.randomUUID();
  c.header("X-Ahura-Trace-Id", traceId);

  // 1. Parse input (JSON or multipart)
  const contentType = c.req.header("content-type") ?? "";
  let modelId = "";
  let dataUri = "";

  if (contentType.includes("multipart/form-data")) {
    let formData: FormData;
    try { formData = await c.req.formData(); }
    catch {
      return c.json(gatewayError("Expected multipart/form-data body", "invalid_request_error", "invalid_request", requestId), 400);
    }
    const modelVal = formData.get("model");
    if (!modelVal || typeof modelVal !== "string") {
      return c.json(gatewayError("model field is required", "invalid_request_error", "invalid_request", requestId), 400);
    }
    const fileVal = formData.get("file") as unknown as (Blob & { name: string }) | string | null;
    if (!fileVal || typeof fileVal === "string" || typeof (fileVal as unknown as Record<string, unknown>).arrayBuffer !== "function") {
      return c.json(gatewayError("file field is required", "invalid_request_error", "invalid_request", requestId), 400);
    }
    if (fileVal.size > MAX_FILE_BYTES) {
      return c.json(gatewayError(`File too large (max ${MAX_FILE_BYTES / 1024 / 1024} MB)`, "invalid_request_error", "file_too_large", requestId), 400);
    }
    modelId = modelVal;
    const mime   = fileVal.type || guessMime(fileVal.name);
    const bytes  = new Uint8Array(await fileVal.arrayBuffer());
    const prefix = MIME_PREFIXES[mime.toLowerCase()] ?? "data:application/octet-stream;base64,";
    dataUri = prefix + encodeBase64(bytes);

  } else {
    let raw: unknown;
    try { raw = await c.req.json(); }
    catch {
      return c.json(gatewayError("Invalid JSON body", "invalid_request_error", "invalid_json", requestId), 400);
    }
    const parsed = jsonSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json(gatewayError(
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        "invalid_request_error", "invalid_request", requestId,
      ), 400);
    }
    const req = parsed.data;
    modelId   = req.model;

    if (req.document.type === "base64") {
      const prefix = MIME_PREFIXES[req.document.media_type.toLowerCase()] ?? "data:application/pdf;base64,";
      dataUri = prefix + req.document.data;
    } else {
      let fetchResp: Response;
      try { fetchResp = await fetch(req.document.url, { headers: { "User-Agent": "AhuraCloud-OCR/1.0" } }); }
      catch {
        return c.json(gatewayError("Failed to fetch document URL", "invalid_request_error", "document_fetch_failed", requestId), 400);
      }
      if (!fetchResp.ok) {
        return c.json(gatewayError(`Document URL returned ${fetchResp.status}`, "invalid_request_error", "document_fetch_failed", requestId), 400);
      }
      const mime   = (fetchResp.headers.get("content-type") ?? "application/pdf").split(";")[0]?.trim() ?? "application/pdf";
      const bytes  = new Uint8Array(await fetchResp.arrayBuffer());
      if (bytes.length > MAX_URL_FETCH) {
        return c.json(gatewayError(`Document too large (max ${MAX_URL_FETCH / 1024 / 1024} MB)`, "invalid_request_error", "document_too_large", requestId), 400);
      }
      const prefix = MIME_PREFIXES[mime.toLowerCase()] ?? "data:application/pdf;base64,";
      dataUri = prefix + encodeBase64(bytes);
    }
  }

  // 2. Scope, routing, key
  const scopeErr = checkModelScope(auth, modelId, requestId);
  if (scopeErr) return c.json(scopeErr, 403);

  const routing = await resolveRouting(c.env, modelId, requestId);
  if (!routing.ok) return c.json(routing.error, 503);

  const keyResult = await resolvePlatformKey(c.env, auth, requestId);
  if (!keyResult.ok) return c.json(keyResult.error, 400);

  // 3. Call Gemini via OpenRouter chat completions
  const chatUrl = `${c.env.OPENROUTER_BASE_URL.replace(/\/+$/, "")}/chat/completions`;
  let upstreamResp: Response;
  try {
    upstreamResp = await fetch(chatUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${keyResult.key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://ahurasense.com",
        "X-Title": "AhuraCloud",
      },
      body: JSON.stringify({
        model:    routing.upstreamModelId,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: "Extract all text from this document page by page. Start each page with the exact marker \"PAGE_N:\" (e.g. PAGE_1:, PAGE_2:) on its own line, followed by the page content in markdown (preserve headings, tables, lists). Output only the pages with their markers — no introduction, no commentary." },
            { type: "image_url", image_url: { url: dataUri } },
          ],
        }],
        stream: false,
      }),
      signal: c.req.raw.signal,
    });
  } catch (err) {
    console.error(JSON.stringify({ level: "error", scope: "ocr", requestId, message: "Upstream fetch failed", err: String(err) }));
    c.executionCtx.waitUntil(enqueueUsage(c.env, buildBaseEvent(auth, modelId, "ocr", requestId, startedAt, {
      numUnits: 0, unitLabel: "ocr_page", status: "error_upstream", errorCode: "upstream_fetch_failed",
    })));
    c.executionCtx.waitUntil(enqueueTrace(c.env, buildBaseSpan(auth, traceId, requestId, modelId, "gen_ai.ocr", startedAt, "error_upstream")));
    return c.json(gatewayError("OCR service is temporarily unavailable. Please try again.", "server_error", "service_unavailable", requestId), 503);
  }

  if (!upstreamResp.ok) {
    const errText = await upstreamResp.text().catch(() => "");
    console.error(JSON.stringify({ level: "error", scope: "ocr", requestId, httpStatus: upstreamResp.status, upstreamErr: errText.slice(0, 200) }));
    c.executionCtx.waitUntil(enqueueUsage(c.env, buildBaseEvent(auth, modelId, "ocr", requestId, startedAt, {
      numUnits: 0, unitLabel: "ocr_page", status: "error_upstream", errorCode: `upstream_${upstreamResp.status}`,
    })));
    c.executionCtx.waitUntil(enqueueTrace(c.env, buildBaseSpan(auth, traceId, requestId, modelId, "gen_ai.ocr", startedAt, "error_upstream", { upstream_http_status: upstreamResp.status })));
    const { status, retryAfter, errorType, errorCode, message } = classifyUpstreamError(upstreamResp.status, upstreamResp.headers);
    if (retryAfter) c.header("Retry-After", retryAfter);
    return c.json(gatewayError(message, errorType, errorCode, requestId), status as 429 | 408 | 503);
  }

  let upstreamBody: Record<string, unknown>;
  try { upstreamBody = (await upstreamResp.json()) as Record<string, unknown>; }
  catch {
    c.executionCtx.waitUntil(enqueueUsage(c.env, buildBaseEvent(auth, modelId, "ocr", requestId, startedAt, {
      numUnits: 0, unitLabel: "ocr_page", status: "error_upstream", errorCode: "upstream_invalid_response",
    })));
    c.executionCtx.waitUntil(enqueueTrace(c.env, buildBaseSpan(auth, traceId, requestId, modelId, "gen_ai.ocr", startedAt, "error_upstream")));
    return c.json(gatewayError("OCR service is temporarily unavailable. Please try again.", "server_error", "service_unavailable", requestId), 503);
  }

  // 4. Parse pages
  const rawText = extractContent(upstreamBody);
  if (!rawText) {
    c.executionCtx.waitUntil(enqueueUsage(c.env, buildBaseEvent(auth, modelId, "ocr", requestId, startedAt, {
      numUnits: 0, unitLabel: "ocr_page", status: "error_upstream", errorCode: "upstream_empty_response",
    })));
    c.executionCtx.waitUntil(enqueueTrace(c.env, buildBaseSpan(auth, traceId, requestId, modelId, "gen_ai.ocr", startedAt, "error_upstream")));
    return c.json(gatewayError("OCR service is temporarily unavailable. Please try again.", "server_error", "service_unavailable", requestId), 503);
  }

  const pages     = parsePages(rawText);
  const pageCount = pages.length || 1;

  c.executionCtx.waitUntil(enqueueUsage(c.env, buildBaseEvent(auth, modelId, "ocr", requestId, startedAt, {
    numUnits: pageCount, unitLabel: "ocr_page",
  })));
  c.executionCtx.waitUntil(enqueueTrace(c.env, buildBaseSpan(auth, traceId, requestId, modelId, "gen_ai.ocr", startedAt, "success", { page_count: pageCount }, pageCount, "ocr_page")));

  return c.json(
    { model: modelId, pages, usage: { pages: pageCount } },
    200,
    { "X-Ahura-Request-Id": requestId, "X-Ahura-Model": modelId, "X-Ahura-Trace-Id": traceId }
  );
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parsePages(text: string): Array<{ page: number; markdown: string }> {
  const parts = text.split(/\n?PAGE_(\d+):/);
  const pages: Array<{ page: number; markdown: string }> = [];

  let i = 0;
  const part0 = parts[0] ?? "";
  if (part0.trimStart().startsWith("PAGE_")) {
    const m = part0.trimStart().match(/^PAGE_(\d+):(.*)/s);
    if (m) { pages.push({ page: parseInt(m[1] ?? "0"), markdown: (m[2] ?? "").trim() }); i = 1; }
  } else if (part0.trim().length > 0 && parts.length === 1) {
    return [{ page: 1, markdown: text.trim() }];
  } else {
    i = 1;
  }

  for (; i + 1 < parts.length; i += 2) {
    const num  = parseInt(parts[i] ?? "");
    const body = (parts[i + 1] ?? "").trim();
    if (!isNaN(num)) pages.push({ page: num, markdown: body });
  }

  return pages.length > 0 ? pages : [{ page: 1, markdown: text.trim() }];
}

function extractContent(body: Record<string, unknown>): string | null {
  const choices = body.choices as Array<{ message?: { content?: string } }> | undefined;
  const content = choices?.[0]?.message?.content;
  return typeof content === "string" && content.trim().length > 0 ? content.trim() : null;
}

function guessMime(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  const map: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" };
  return map[ext] ?? "application/pdf";
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(binary);
}
