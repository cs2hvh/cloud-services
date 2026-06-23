/**
 * POST /v1/audio/transcriptions — Speech-to-text.
 *
 * OpenAI-compatible customer surface (multipart form):
 *   file      — audio file (mp3, wav, m4a, webm, flac, ogg …)
 *   model     — e.g. "ahura/stt-whisper"
 *   language  — optional BCP-47 language code (hint for accuracy)
 *   prompt    — optional context hint
 *
 * Upstream: OpenRouter google/gemini-2.5-flash via chat completions.
 * Audio bytes are base64-encoded and sent as an `input_audio` content part.
 * The model's text response is the transcription.
 *
 * Response: { text, duration? }  (OpenAI-compatible simple format)
 *
 * Billing: per estimated audio second (numUnits = estimatedSeconds,
 * unitLabel = 'stt_second').
 * Pricing key in inference.models.pricing: { "cents_per_audio_minute": N }
 */
import type { Handler } from "hono";
import type { Env, HonoVariables } from "../types.ts";
import {
  gatewayError, buildBaseEvent, enqueueUsage, checkModelScope, resolveRouting, resolvePlatformKey,
  classifyUpstreamError,
} from "../lib/gateway.ts";

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB — matches OpenAI limit

const FORMAT_MAP: Record<string, string> = {
  "audio/mpeg":   "mp3",
  "audio/mp3":    "mp3",
  "audio/wav":    "wav",
  "audio/wave":   "wav",
  "audio/x-wav":  "wav",
  "audio/webm":   "webm",
  "audio/ogg":    "ogg",
  "audio/flac":   "flac",
  "audio/x-flac": "flac",
  "audio/mp4":    "mp4",
  "audio/m4a":    "m4a",
  "audio/x-m4a":  "m4a",
};

export const audioTranscriptions: Handler<{ Bindings: Env; Variables: HonoVariables }> = async (c) => {
  const auth      = c.get("auth");
  const requestId = c.get("requestId");
  const startedAt = c.get("startedAt");

  // 1. Parse multipart form
  let formData: FormData;
  try { formData = await c.req.formData(); }
  catch {
    return c.json(gatewayError("Expected multipart/form-data body", "invalid_request_error", "invalid_request", requestId), 400);
  }

  const modelValue = formData.get("model");
  if (!modelValue || typeof modelValue !== "string") {
    return c.json(gatewayError("model field is required", "invalid_request_error", "invalid_request", requestId), 400);
  }

  const fileEntry = formData.get("file") as unknown as (Blob & { name: string }) | string | null;
  if (!fileEntry || typeof fileEntry === "string" || typeof (fileEntry as unknown as Record<string, unknown>).arrayBuffer !== "function") {
    return c.json(gatewayError("file field is required and must be a file upload", "invalid_request_error", "invalid_request", requestId), 400);
  }

  if (fileEntry.size > MAX_FILE_BYTES) {
    return c.json(gatewayError(`Audio file too large (max ${MAX_FILE_BYTES / 1024 / 1024} MB)`, "invalid_request_error", "file_too_large", requestId), 400);
  }

  const language = (formData.get("language") ?? "") as string;
  const prompt   = (formData.get("prompt")   ?? "") as string;
  const modelId  = modelValue;

  // 2. Scope, routing, key
  const scopeErr = checkModelScope(auth, modelId, requestId);
  if (scopeErr) return c.json(scopeErr, 403);

  const routing = await resolveRouting(c.env, modelId, requestId);
  if (!routing.ok) return c.json(routing.error, 503);

  const keyResult = await resolvePlatformKey(c.env, auth, requestId);
  if (!keyResult.ok) return c.json(keyResult.error, 400);

  // 3. Encode audio
  let fileBytes: Uint8Array;
  try { fileBytes = new Uint8Array(await fileEntry.arrayBuffer()); }
  catch {
    return c.json(gatewayError("Failed to read audio file", "invalid_request_error", "invalid_request", requestId), 400);
  }

  const contentType        = fileEntry.type || "audio/wav";
  const audioFormat        = FORMAT_MAP[contentType.toLowerCase()] ?? detectFormatFromName(fileEntry.name);
  const b64Audio           = encodeBase64(fileBytes);
  const estimatedSeconds   = estimateAudioDuration(fileBytes, contentType);

  const transcriptionInstruction = [
    "Transcribe the following audio accurately.",
    language ? `Language: ${language}.` : "",
    prompt   ? `Context hint: ${prompt}` : "",
    "Return only the transcription text with no extra commentary or formatting.",
  ].filter(Boolean).join(" ");

  // 4. Forward to OpenRouter
  const chatUrl = `${c.env.OPENROUTER_BASE_URL.replace(/\/+$/, "")}/chat/completions`;
  let upstreamResp: Response;
  try {
    upstreamResp = await fetch(chatUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${keyResult.key}`,
        "Content-Type":  "application/json",
        "HTTP-Referer":  "https://ahurasense.com",
        "X-Title":       "AhuraCloud",
      },
      body: JSON.stringify({
        model:    routing.upstreamModelId,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: transcriptionInstruction },
            { type: "input_audio", input_audio: { data: b64Audio, format: audioFormat } },
          ],
        }],
        stream: false,
      }),
      signal: c.req.raw.signal,
    });
  } catch (err) {
    console.error(JSON.stringify({ level: "error", scope: "audio-transcriptions", requestId, message: "Upstream fetch failed", err: String(err) }));
    c.executionCtx.waitUntil(enqueueUsage(c.env, buildBaseEvent(auth, modelId, "stt", requestId, startedAt, {
      numUnits: Math.ceil(estimatedSeconds), unitLabel: "stt_second", status: "error_upstream", errorCode: "upstream_fetch_failed",
    })));
    return c.json(gatewayError("Transcription service is temporarily unavailable. Please try again.", "server_error", "service_unavailable", requestId), 503);
  }

  if (!upstreamResp.ok) {
    const errText = await upstreamResp.text().catch(() => "");
    console.error(JSON.stringify({ level: "error", scope: "audio-transcriptions", requestId, httpStatus: upstreamResp.status, upstreamErr: errText.slice(0, 200) }));
    c.executionCtx.waitUntil(enqueueUsage(c.env, buildBaseEvent(auth, modelId, "stt", requestId, startedAt, {
      numUnits: Math.ceil(estimatedSeconds), unitLabel: "stt_second", status: "error_upstream", errorCode: `upstream_${upstreamResp.status}`,
    })));
    const { status, retryAfter, errorType, errorCode, message } = classifyUpstreamError(upstreamResp.status, upstreamResp.headers);
    if (retryAfter) c.header("Retry-After", retryAfter);
    return c.json(gatewayError(message, errorType, errorCode, requestId), status as 429 | 408 | 503);
  }

  let upstreamBody: Record<string, unknown>;
  try { upstreamBody = (await upstreamResp.json()) as Record<string, unknown>; }
  catch {
    c.executionCtx.waitUntil(enqueueUsage(c.env, buildBaseEvent(auth, modelId, "stt", requestId, startedAt, {
      numUnits: Math.ceil(estimatedSeconds), unitLabel: "stt_second", status: "error_upstream", errorCode: "upstream_invalid_response",
    })));
    return c.json(gatewayError("Transcription service is temporarily unavailable. Please try again.", "server_error", "service_unavailable", requestId), 503);
  }

  const text = extractTranscription(upstreamBody);
  if (text === null) {
    console.error(JSON.stringify({ level: "error", scope: "audio-transcriptions", requestId, message: "Could not extract transcription from upstream response" }));
    c.executionCtx.waitUntil(enqueueUsage(c.env, buildBaseEvent(auth, modelId, "stt", requestId, startedAt, {
      numUnits: Math.ceil(estimatedSeconds), unitLabel: "stt_second", status: "error_upstream", errorCode: "upstream_empty_transcription",
    })));
    return c.json(gatewayError("Transcription service is temporarily unavailable. Please try again.", "server_error", "service_unavailable", requestId), 503);
  }

  c.executionCtx.waitUntil(enqueueUsage(c.env, buildBaseEvent(auth, modelId, "stt", requestId, startedAt, {
    numUnits: Math.ceil(estimatedSeconds), unitLabel: "stt_second",
  })));

  return c.json(
    { text, duration: Math.round(estimatedSeconds * 100) / 100 },
    200,
    { "X-Ahura-Request-Id": requestId, "X-Ahura-Model": modelId }
  );
};

// ─── Audio helpers ─────────────────────────────────────────────────────────────

function detectFormatFromName(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  const map: Record<string, string> = { mp3: "mp3", wav: "wav", m4a: "m4a", mp4: "mp4", webm: "webm", ogg: "ogg", flac: "flac" };
  return map[ext] ?? "wav";
}

function estimateAudioDuration(bytes: Uint8Array, contentType: string): number {
  const mime = contentType.toLowerCase();
  if ((mime.includes("wav") || mime.includes("wave")) && bytes.length >= 44) {
    const view       = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const sampleRate = view.getUint32(24, true);
    const channels   = view.getUint16(22, true);
    const bitDepth   = view.getUint16(34, true);
    const dataSize   = view.getUint32(40, true);
    if (sampleRate > 0 && channels > 0 && bitDepth > 0) {
      return dataSize / (sampleRate * channels * (bitDepth / 8));
    }
  }
  return Math.max(1, (bytes.length / (1024 * 1024)) * 60);
}

function extractTranscription(body: Record<string, unknown>): string | null {
  const choices = body.choices as Array<{ message?: { content?: string } }> | undefined;
  const content = choices?.[0]?.message?.content;
  return typeof content === "string" && content.trim().length > 0 ? content.trim() : null;
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(binary);
}
