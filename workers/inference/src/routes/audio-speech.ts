/**
 * POST /v1/audio/speech — Text-to-speech.
 *
 * OpenAI-compatible customer surface:
 *   { model, input, voice?, response_format?, speed? }
 *
 * Upstream: OpenRouter openai/gpt-audio-mini via chat completions (stream:true,
 * modalities:["text","audio"], format:"pcm16"). We collect all base64 PCM16
 * chunks from SSE, concatenate, wrap in a WAV header, and return audio/wav.
 *
 * When response_format="b64_json" we return a JSON envelope instead of binary —
 * the playground uses this to display an <audio> element without a separate
 * download step.
 *
 * Voice map: neutral Ahura names → OpenAI voice IDs (never customer-visible).
 * Billing: per character of input text (numUnits = input.length, unitLabel = 'tts_char').
 * Pricing key in inference.models.pricing: { "cents_per_1k_chars": N }
 */
import type { Handler } from "hono";
import { z } from "zod";
import type { Env, HonoVariables } from "../types.ts";
import {
  gatewayError, buildBaseEvent, enqueueUsage, checkModelScope, resolveRouting, resolvePlatformKey,
  classifyUpstreamError, buildBaseSpan, enqueueTrace,
} from "../lib/gateway.ts";

const PCM_SAMPLE_RATE = 24000;
const PCM_CHANNELS    = 1;
const PCM_BIT_DEPTH   = 16;

const VOICE_MAP: Record<string, string> = {
  aria:    "alloy",
  echo:    "echo",
  nova:    "nova",
  onyx:    "onyx",
  shimmer: "shimmer",
  fable:   "fable",
};

const speechSchema = z.object({
  model:           z.string().min(1),
  input:           z.string().min(1).max(4096),
  voice:           z.string().optional().default("aria"),
  response_format: z.enum(["wav", "b64_json"]).optional().default("wav"),
  speed:           z.number().min(0.25).max(4.0).optional(),
});

export const audioSpeech: Handler<{ Bindings: Env; Variables: HonoVariables }> = async (c) => {
  const auth      = c.get("auth");
  const requestId = c.get("requestId");
  const startedAt = c.get("startedAt");
  const traceId   = c.req.header("X-Ahura-Trace-Id") ?? crypto.randomUUID();
  c.header("X-Ahura-Trace-Id", traceId);

  // 1. Parse request
  let rawBody: unknown;
  try { rawBody = await c.req.json(); }
  catch {
    return c.json(gatewayError("Invalid JSON body", "invalid_request_error", "invalid_json", requestId), 400);
  }

  const parsed = speechSchema.safeParse(rawBody);
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

  const upstreamVoice = VOICE_MAP[req.voice] ?? "alloy";
  const chatUrl       = `${c.env.OPENROUTER_BASE_URL.replace(/\/+$/, "")}/chat/completions`;

  // 3. Stream chat/completions with audio modality
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
        model:      routing.upstreamModelId,
        messages: [
          { role: "system", content: `Speak the following text aloud, exactly word for word, nothing else: ${JSON.stringify(req.input)}` },
          { role: "user",   content: "Go." },
        ],
        modalities: ["text", "audio"],
        audio:      { voice: upstreamVoice, format: "pcm16" },
        stream:     true,
      }),
      signal: c.req.raw.signal,
    });
  } catch (err) {
    console.error(JSON.stringify({ level: "error", scope: "audio-speech", requestId, message: "Upstream fetch failed", err: String(err) }));
    c.executionCtx.waitUntil(enqueueUsage(c.env, buildBaseEvent(auth, req.model, "tts", requestId, startedAt, {
      numUnits: req.input.length, unitLabel: "tts_char", status: "error_upstream", errorCode: "upstream_fetch_failed",
    })));
    c.executionCtx.waitUntil(enqueueTrace(c.env, buildBaseSpan(auth, traceId, requestId, req.model, "gen_ai.audio", startedAt, "error_upstream")));
    return c.json(gatewayError("Text-to-speech service is temporarily unavailable. Please try again.", "server_error", "service_unavailable", requestId), 503);
  }

  if (!upstreamResp.ok) {
    const errText = await upstreamResp.text().catch(() => "");
    console.error(JSON.stringify({ level: "error", scope: "audio-speech", requestId, httpStatus: upstreamResp.status, upstreamErr: errText.slice(0, 200) }));
    c.executionCtx.waitUntil(enqueueUsage(c.env, buildBaseEvent(auth, req.model, "tts", requestId, startedAt, {
      numUnits: req.input.length, unitLabel: "tts_char", status: "error_upstream", errorCode: `upstream_${upstreamResp.status}`,
    })));
    c.executionCtx.waitUntil(enqueueTrace(c.env, buildBaseSpan(auth, traceId, requestId, req.model, "gen_ai.audio", startedAt, "error_upstream", { upstream_http_status: upstreamResp.status })));
    const { status, retryAfter, errorType, errorCode, message } = classifyUpstreamError(upstreamResp.status, upstreamResp.headers);
    if (retryAfter) c.header("Retry-After", retryAfter);
    return c.json(gatewayError(message, errorType, errorCode, requestId), status as 429 | 408 | 503);
  }
  if (!upstreamResp.body) {
    c.executionCtx.waitUntil(enqueueUsage(c.env, buildBaseEvent(auth, req.model, "tts", requestId, startedAt, {
      numUnits: req.input.length, unitLabel: "tts_char", status: "error_upstream", errorCode: "upstream_no_body",
    })));
    c.executionCtx.waitUntil(enqueueTrace(c.env, buildBaseSpan(auth, traceId, requestId, req.model, "gen_ai.audio", startedAt, "error_upstream")));
    return c.json(gatewayError("Text-to-speech service is temporarily unavailable. Please try again.", "server_error", "service_unavailable", requestId), 503);
  }

  // 4. Collect PCM16 chunks from SSE stream
  let pcmBytes: Uint8Array;
  try {
    pcmBytes = await collectPcmFromSse(upstreamResp.body);
  } catch (err) {
    console.error(JSON.stringify({ level: "error", scope: "audio-speech", requestId, message: "SSE collection failed", err: String(err) }));
    c.executionCtx.waitUntil(enqueueUsage(c.env, buildBaseEvent(auth, req.model, "tts", requestId, startedAt, {
      numUnits: req.input.length, unitLabel: "tts_char", status: "error_upstream", errorCode: "upstream_stream_error",
    })));
    c.executionCtx.waitUntil(enqueueTrace(c.env, buildBaseSpan(auth, traceId, requestId, req.model, "gen_ai.audio", startedAt, "error_upstream")));
    return c.json(gatewayError("Text-to-speech service is temporarily unavailable. Please try again.", "server_error", "service_unavailable", requestId), 503);
  }

  if (pcmBytes.length === 0) {
    c.executionCtx.waitUntil(enqueueUsage(c.env, buildBaseEvent(auth, req.model, "tts", requestId, startedAt, {
      numUnits: req.input.length, unitLabel: "tts_char", status: "error_upstream", errorCode: "upstream_no_audio",
    })));
    c.executionCtx.waitUntil(enqueueTrace(c.env, buildBaseSpan(auth, traceId, requestId, req.model, "gen_ai.audio", startedAt, "error_upstream")));
    return c.json(gatewayError("Text-to-speech service is temporarily unavailable. Please try again.", "server_error", "service_unavailable", requestId), 503);
  }

  const wavBytes  = buildWav(pcmBytes);
  const charCount = req.input.length;

  c.executionCtx.waitUntil(enqueueUsage(c.env, buildBaseEvent(auth, req.model, "tts", requestId, startedAt, {
    numUnits: charCount, unitLabel: "tts_char",
  })));
  c.executionCtx.waitUntil(enqueueTrace(c.env, buildBaseSpan(auth, traceId, requestId, req.model, "gen_ai.audio", startedAt, "success", { audio_type: "tts", char_count: charCount }, charCount, "tts_char")));

  const headers: Record<string, string> = {
    "X-Ahura-Request-Id": requestId,
    "X-Ahura-Model":      req.model,
    "X-Ahura-Trace-Id":   traceId,
  };

  if (req.response_format === "b64_json") {
    return c.json(
      { created: Math.floor(Date.now() / 1000), data: [{ b64_json: encodeBase64(wavBytes) }], model: req.model, usage: { chars: charCount } },
      200, headers,
    );
  }

  return new Response(wavBytes, {
    status: 200,
    headers: { ...headers, "Content-Type": "audio/wav", "Content-Length": String(wavBytes.length), "Cache-Control": "no-store" },
  });
};

// ─── Audio helpers ─────────────────────────────────────────────────────────────

async function collectPcmFromSse(body: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader  = body.getReader();
  const decoder = new TextDecoder();
  let buffer    = "";
  const chunks: Uint8Array[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const payload = trimmed.slice(6);
        if (payload === "[DONE]") continue;
        try {
          const d = JSON.parse(payload) as Record<string, unknown>;
          const choices   = d.choices as Array<{ delta?: { audio?: { data?: string } } }> | undefined;
          const audioData = choices?.[0]?.delta?.audio?.data;
          if (typeof audioData === "string" && audioData.length > 0) {
            chunks.push(decodeBase64(audioData));
          }
        } catch { /* malformed SSE line — skip */ }
      }
    }
  } finally {
    reader.releaseLock();
  }

  const totalLen = chunks.reduce((acc, a) => acc + a.length, 0);
  const result   = new Uint8Array(totalLen);
  let offset     = 0;
  for (const a of chunks) { result.set(a, offset); offset += a.length; }
  return result;
}

function buildWav(pcm: Uint8Array): Uint8Array {
  const dataLen    = pcm.length;
  const header     = new ArrayBuffer(44);
  const v          = new DataView(header);
  const byteRate   = PCM_SAMPLE_RATE * PCM_CHANNELS * (PCM_BIT_DEPTH / 8);
  const blockAlign = PCM_CHANNELS * (PCM_BIT_DEPTH / 8);

  v.setUint32(0,  0x52494646, false); // "RIFF"
  v.setUint32(4,  36 + dataLen, true);
  v.setUint32(8,  0x57415645, false); // "WAVE"
  v.setUint32(12, 0x666d7420, false); // "fmt "
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, PCM_CHANNELS, true);
  v.setUint32(24, PCM_SAMPLE_RATE, true);
  v.setUint32(28, byteRate, true);
  v.setUint16(32, blockAlign, true);
  v.setUint16(34, PCM_BIT_DEPTH, true);
  v.setUint32(36, 0x64617461, false); // "data"
  v.setUint32(40, dataLen, true);

  const result = new Uint8Array(44 + dataLen);
  result.set(new Uint8Array(header), 0);
  result.set(pcm, 44);
  return result;
}

function decodeBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(binary);
}
