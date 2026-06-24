/**
 * POST /v1/audio/music — Music generation (synchronous).
 *
 * Customer surface:
 *   { model, prompt, style?, make_instrumental?, response_format? }
 *
 * Upstream: OpenRouter google/lyria-3-clip-preview via chat completions
 * (stream:true, modalities:["audio"], format:"mp3"). The model returns the
 * full MP3 in a single large delta.audio.data base64 chunk.
 *
 * When response_format="b64_json" returns a JSON envelope — the playground
 * uses this to avoid a separate fetch for the audio element src.
 *
 * Billing: per music second. We use the "cents_per_media_second" pricing key.
 * Duration is estimated from output bytes at ~24kBps (average MP3 bitrate for
 * speech-quality music); actual seconds cap at the requested max.
 */
import type { Handler } from "hono";
import { z } from "zod";
import type { Env, HonoVariables } from "../types.ts";
import {
  gatewayError, buildBaseEvent, enqueueUsage, checkModelScope,
  resolveRouting, resolvePlatformKey, classifyUpstreamError,
} from "../lib/gateway.ts";

const MP3_AVG_KBPS = 24; // conservative estimate for Lyria output bitrate

const musicSchema = z.object({
  model:             z.string().min(1),
  prompt:            z.string().min(1).max(2000),
  style:             z.string().max(200).optional(),
  make_instrumental: z.boolean().optional().default(false),
  response_format:   z.enum(["mp3", "b64_json"]).optional().default("mp3"),
  // Optional image for image-to-music mode (Lyria 3 supports image inputs).
  // Accepts a public HTTPS URL or a data: URI (base64-encoded image).
  image_url:         z.string().url().or(z.string().startsWith("data:image/")).optional(),
});

export const createMusicJob: Handler<{ Bindings: Env; Variables: HonoVariables }> = async (c) => {
  const auth      = c.get("auth");
  const requestId = c.get("requestId");
  const startedAt = c.get("startedAt");

  let rawBody: unknown;
  try { rawBody = await c.req.json(); }
  catch {
    return c.json(gatewayError("Invalid JSON body", "invalid_request_error", "invalid_json", requestId), 400);
  }

  const parsed = musicSchema.safeParse(rawBody);
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

  const chatUrl = `${c.env.OPENROUTER_BASE_URL.replace(/\/+$/, "")}/chat/completions`;

  // Build the user message — weave style and instrumental hint into the prompt
  let textContent = req.prompt;
  if (req.style) textContent += `\n\nStyle: ${req.style}`;
  if (req.make_instrumental) textContent += "\n\nGenerate instrumental only — no vocals.";

  // When an image is supplied, use multimodal content array (image-to-music).
  // Otherwise keep a plain string (text-to-music).
  const userContent = req.image_url
    ? [
        { type: "text",      text:        textContent                     },
        { type: "image_url", image_url:   { url: req.image_url }          },
      ]
    : textContent;

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
        messages:   [{ role: "user", content: userContent }],
        modalities: ["audio"],
        audio:      { format: "mp3" },
        stream:     true,
      }),
      // No AbortSignal — music takes 30-90s and we want the upstream to complete
      // even if the HTTP client disconnects mid-wait.
    });
  } catch (err) {
    console.error(JSON.stringify({ level: "error", scope: "music", requestId, message: "Upstream fetch failed", err: String(err) }));
    c.executionCtx.waitUntil(enqueueUsage(c.env, buildBaseEvent(auth, req.model, "music", requestId, startedAt, {
      numUnits: 0, unitLabel: "music_second", status: "error_upstream", errorCode: "upstream_fetch_failed",
    })));
    return c.json(gatewayError("Music generation service is temporarily unavailable. Please try again.", "server_error", "service_unavailable", requestId), 503);
  }

  if (!upstreamResp.ok) {
    const errText = await upstreamResp.text().catch(() => "");
    console.error(JSON.stringify({ level: "error", scope: "music", requestId, httpStatus: upstreamResp.status, upstreamErr: errText.slice(0, 300) }));
    c.executionCtx.waitUntil(enqueueUsage(c.env, buildBaseEvent(auth, req.model, "music", requestId, startedAt, {
      numUnits: 0, unitLabel: "music_second", status: "error_upstream", errorCode: `upstream_${upstreamResp.status}`,
    })));
    const { status, retryAfter, errorType, errorCode, message } = classifyUpstreamError(upstreamResp.status, upstreamResp.headers);
    if (retryAfter) c.header("Retry-After", retryAfter);
    return c.json(gatewayError(message, errorType, errorCode, requestId), status as 429 | 408 | 503);
  }

  if (!upstreamResp.body) {
    c.executionCtx.waitUntil(enqueueUsage(c.env, buildBaseEvent(auth, req.model, "music", requestId, startedAt, {
      numUnits: 0, unitLabel: "music_second", status: "error_upstream", errorCode: "upstream_no_body",
    })));
    return c.json(gatewayError("Music generation service is temporarily unavailable. Please try again.", "server_error", "service_unavailable", requestId), 503);
  }

  const baseHeaders: Record<string, string> = {
    "X-Ahura-Request-Id": requestId,
    "X-Ahura-Model":      req.model,
  };

  // ── mp3 format: peek-then-stream.
  // Read the SSE stream until we have the FIRST audio chunk (or hit an error).
  // This way we can still return a proper 503 JSON error if OR produces no audio
  // (e.g. model rejects the request via an SSE error event, or stream ends empty).
  // Only after confirming audio exists do we commit to a 200 response and stream.
  if (req.response_format === "mp3") {
    const peek = await peekFirstAudioChunk(upstreamResp.body);

    if ("errorMessage" in peek) {
      const errMsg = peek.errorMessage;
      console.error(JSON.stringify({ level: "error", scope: "music", requestId, message: "No audio in SSE stream", err: errMsg }));
      c.executionCtx.waitUntil(enqueueUsage(c.env, buildBaseEvent(auth, req.model, "music", requestId, startedAt, {
        numUnits: 0, unitLabel: "music_second", status: "error_upstream", errorCode: "upstream_no_audio",
      })));
      return c.json(gatewayError(errMsg, "server_error", "service_unavailable", requestId), 503);
    }

    // First audio chunk received — commit to streaming the rest
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();

    let totalBytes = peek.firstChunk.length;
    const streamDone = (async () => {
      await writer.write(peek.firstChunk);
      const more = await streamRemainingMp3(peek.reader, peek.partialBuffer, writer);
      totalBytes += more;
    })().catch((err: unknown) => {
      console.error(JSON.stringify({ level: "error", scope: "music", requestId, message: "SSE stream failed mid-stream", err: String(err) }));
      writer.abort(err).catch(() => {});
    });

    c.executionCtx.waitUntil(
      streamDone.then(() => {
        const secs = Math.max(1, Math.round(totalBytes / (MP3_AVG_KBPS * 1024)));
        return enqueueUsage(c.env, buildBaseEvent(auth, req.model, "music", requestId, startedAt, {
          numUnits: secs, unitLabel: "music_second",
        }));
      }),
    );

    return new Response(readable, {
      status:  200,
      headers: { ...baseHeaders, "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  }

  // ── b64_json format: buffer everything (for API consumers who need the JSON envelope)
  let mp3Bytes: Uint8Array;
  try {
    mp3Bytes = await collectMp3FromSse(upstreamResp.body);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ level: "error", scope: "music", requestId, message: "SSE collection failed", err: errMsg }));
    c.executionCtx.waitUntil(enqueueUsage(c.env, buildBaseEvent(auth, req.model, "music", requestId, startedAt, {
      numUnits: 0, unitLabel: "music_second", status: "error_upstream", errorCode: "upstream_stream_error",
    })));
    return c.json(gatewayError(errMsg, "server_error", "service_unavailable", requestId), 503);
  }

  if (mp3Bytes.length === 0) {
    c.executionCtx.waitUntil(enqueueUsage(c.env, buildBaseEvent(auth, req.model, "music", requestId, startedAt, {
      numUnits: 0, unitLabel: "music_second", status: "error_upstream", errorCode: "upstream_no_audio",
    })));
    return c.json(gatewayError("Music generation service is temporarily unavailable. Please try again.", "server_error", "service_unavailable", requestId), 503);
  }

  const estimatedSeconds = Math.max(1, Math.round(mp3Bytes.length / (MP3_AVG_KBPS * 1024)));
  c.executionCtx.waitUntil(enqueueUsage(c.env, buildBaseEvent(auth, req.model, "music", requestId, startedAt, {
    numUnits: estimatedSeconds, unitLabel: "music_second",
  })));

  return c.json(
    { created: Math.floor(Date.now() / 1000), data: [{ b64_json: encodeBase64(mp3Bytes) }], model: req.model, usage: { music_seconds: estimatedSeconds } },
    200, { ...baseHeaders, "Content-Type": "application/json", "X-Ahura-Duration-Sec": String(estimatedSeconds) },
  );
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

type PeekOk = {
  firstChunk:    Uint8Array;
  reader:        ReadableStreamDefaultReader<Uint8Array>;
  partialBuffer: string;
};
type PeekErr = { errorMessage: string };

// Read OR's SSE stream until the first audio chunk arrives (or an error/empty stream).
// Returns the first decoded chunk + the reader in mid-stream state so the caller can
// continue, OR an errorMessage if no audio was found. The caller MUST NOT release the
// reader on success — streamRemainingMp3 will do that.
async function peekFirstAudioChunk(body: ReadableStream<Uint8Array>): Promise<PeekOk | PeekErr> {
  const reader  = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        reader.releaseLock();
        return { errorMessage: "Music generation produced no audio. Please try again." };
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const payload = trimmed.slice(6);
        if (payload === "[DONE]") {
          reader.releaseLock();
          return { errorMessage: "Music generation produced no audio. Please try again." };
        }
        try {
          const d = JSON.parse(payload) as Record<string, unknown>;
          // Surface OR error events with human-readable messages
          const orErr = d.error as { message?: string } | undefined;
          if (orErr?.message) {
            reader.releaseLock();
            const raw = orErr.message;
            const friendly =
              raw === "PROHIBITED_CONTENT"
                ? "Music generation was blocked by the content policy. Try a different prompt or style."
                : raw;
            return { errorMessage: friendly };
          }
          const choices   = d.choices as Array<{ delta?: { audio?: { data?: string } } }> | undefined;
          const audioData = choices?.[0]?.delta?.audio?.data;
          if (typeof audioData === "string" && audioData.length > 0) {
            // Don't release — caller continues reading via this reader
            return { firstChunk: decodeBase64(audioData), reader, partialBuffer: buffer };
          }
        } catch { /* malformed SSE line */ }
      }
    }
  } catch (err) {
    reader.releaseLock();
    return { errorMessage: String(err) };
  }
}

// Continue streaming after peekFirstAudioChunk handed back the reader.
// Writes all remaining audio chunks to writer, then closes it.
async function streamRemainingMp3(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  initialBuffer: string,
  writer: WritableStreamDefaultWriter<Uint8Array>,
): Promise<number> {
  const decoder = new TextDecoder();
  let buffer = initialBuffer;
  let totalBytes = 0;

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
        if (payload === "[DONE]") { await writer.close(); return totalBytes; }
        try {
          const d = JSON.parse(payload) as Record<string, unknown>;
          const choices   = d.choices as Array<{ delta?: { audio?: { data?: string } } }> | undefined;
          const audioData = choices?.[0]?.delta?.audio?.data;
          if (typeof audioData === "string" && audioData.length > 0) {
            const chunk = decodeBase64(audioData);
            await writer.write(chunk);
            totalBytes += chunk.length;
          }
        } catch { /* malformed SSE line */ }
      }
    }
    await writer.close();
  } catch (err) {
    await writer.abort(err).catch(() => {});
    throw err;
  } finally {
    reader.releaseLock();
  }
  return totalBytes;
}

// Throws a descriptive Error if OR sends an error event. Returns empty Uint8Array if no audio.
async function collectMp3FromSse(body: ReadableStream<Uint8Array>): Promise<Uint8Array> {
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

        let d: Record<string, unknown>;
        try { d = JSON.parse(payload) as Record<string, unknown>; }
        catch { continue; } // malformed SSE line — skip

        // Surface OR error events instead of silently dropping them
        const orErr = d.error as { message?: string } | undefined;
        if (orErr?.message) {
          const raw = orErr.message;
          throw new Error(
            raw === "PROHIBITED_CONTENT"
              ? "Music generation was blocked by the content policy. Try a different prompt or style."
              : raw,
          );
        }

        const choices   = d.choices as Array<{ delta?: { audio?: { data?: string } } }> | undefined;
        const audioData = choices?.[0]?.delta?.audio?.data;
        if (typeof audioData === "string" && audioData.length > 0) {
          chunks.push(decodeBase64(audioData));
        }
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
