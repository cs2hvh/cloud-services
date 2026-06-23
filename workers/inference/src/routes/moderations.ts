/**
 * POST /v1/moderations — Text content safety classification.
 *
 * OpenAI moderation-compatible endpoint. Accepts a string or array of
 * strings and returns per-category harm scores plus a top-level flagged bool.
 *
 * Upstream: meta-llama/llama-guard-4-12b via OpenRouter chat completions.
 * Llama Guard returns plain text: "safe" or "unsafe\n<category>" (e.g. "unsafe\nS1").
 * We parse that into OpenAI's { flagged, categories, category_scores } shape.
 *
 * Llama Guard 4 category → OpenAI category mapping:
 *   S1  Violent Crimes          → violence, violence/graphic
 *   S2  Non-Violent Crimes      → illicit
 *   S3  Sex Crimes              → sexual
 *   S4  Child Exploitation      → sexual/minors
 *   S5  Defamation              → harassment
 *   S9  Weapons / WMD           → illicit/violent
 *   S10 Hate Speech             → hate, hate/threatening
 *   S11 Suicide & Self-Harm     → self-harm, self-harm/intent, self-harm/instructions
 *   S12 Sexual Content          → sexual
 *
 * Billing: per item screened (numUnits = items.length, unitLabel = 'moderation').
 * Pricing key in inference.models.pricing: { "cents_per_1k_moderation": N }
 *
 * Note: Llama Guard 4 does not support native batch input — each item is a
 * separate chat completions call, run concurrently. If any item fails, the
 * whole request fails closed instead of returning a false-safe result.
 */
import type { Handler } from "hono";
import { z } from "zod";
import type { Env, HonoVariables } from "../types.ts";
import {
  gatewayError, buildBaseEvent, enqueueUsage, checkModelScope, resolveRouting, resolvePlatformKey,
} from "../lib/gateway.ts";

const MAX_BATCH_SIZE  = 8;    // parallel chat calls; keep small to avoid rate limits
const MAX_ITEM_LENGTH = 8000;

const moderationsSchema = z.object({
  model: z.string().min(1),
  input: z.union([
    z.string().min(1).max(MAX_ITEM_LENGTH),
    z.array(z.string().min(1).max(MAX_ITEM_LENGTH)).min(1).max(MAX_BATCH_SIZE),
  ]),
});

// Llama Guard 4 category code → OpenAI moderation category flags
const LG_CATEGORY_MAP: Record<string, string[]> = {
  S1:  ["violence", "violence/graphic", "illicit/violent"],
  S2:  ["illicit"],
  S3:  ["sexual"],
  S4:  ["sexual/minors"],
  S5:  ["harassment"],
  S6:  ["self-harm"],
  S7:  [],
  S8:  [],
  S9:  ["illicit/violent", "hate/threatening"],
  S10: ["hate", "hate/threatening"],
  S11: ["self-harm", "self-harm/intent", "self-harm/instructions"],
  S12: ["sexual"],
  S13: [],
  S14: [],
};

const ALL_CATEGORIES = [
  "harassment", "harassment/threatening",
  "hate", "hate/threatening",
  "illicit", "illicit/violent",
  "self-harm", "self-harm/intent", "self-harm/instructions",
  "sexual", "sexual/minors",
  "violence", "violence/graphic",
];

interface ModerationResult {
  flagged: boolean;
  categories: Record<string, boolean>;
  category_scores: Record<string, number>;
  category_applied_input_types: Record<string, string[]>;
}

function parseLlamaGuardOutput(text: string): ModerationResult {
  const lines   = text.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const verdict = lines[0]?.toLowerCase();
  const flagged = verdict === "unsafe";

  const flaggedCategories = new Set<string>();
  if (flagged) {
    for (const line of lines.slice(1)) {
      const cats = LG_CATEGORY_MAP[line.toUpperCase()];
      if (cats) for (const c of cats) flaggedCategories.add(c);
    }
    if (flaggedCategories.size === 0) flaggedCategories.add("violence");
  }

  const categories: Record<string, boolean>  = {};
  const category_scores: Record<string, number> = {};
  const category_applied_input_types: Record<string, string[]> = {};
  for (const cat of ALL_CATEGORIES) {
    const hit = flaggedCategories.has(cat);
    categories[cat] = hit;
    category_scores[cat] = hit ? 0.99 : 0.01;
    category_applied_input_types[cat] = ["text"];
  }
  return { flagged, categories, category_scores, category_applied_input_types };
}

export const moderations: Handler<{ Bindings: Env; Variables: HonoVariables }> = async (c) => {
  const auth      = c.get("auth");
  const requestId = c.get("requestId");
  const startedAt = c.get("startedAt");

  // 1. Parse request
  let rawBody: unknown;
  try { rawBody = await c.req.json(); }
  catch {
    return c.json(gatewayError("Invalid JSON body", "invalid_request_error", "invalid_json", requestId), 400);
  }

  const parsed = moderationsSchema.safeParse(rawBody);
  if (!parsed.success) {
    return c.json(gatewayError(
      parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      "invalid_request_error", "invalid_request", requestId,
    ), 400);
  }
  const req   = parsed.data;
  const items = Array.isArray(req.input) ? req.input : [req.input];

  // 2. Scope, routing, key
  const scopeErr = checkModelScope(auth, req.model, requestId);
  if (scopeErr) return c.json(scopeErr, 403);

  const routing = await resolveRouting(c.env, req.model, requestId);
  if (!routing.ok) return c.json(routing.error, 503);

  const keyResult = await resolvePlatformKey(c.env, auth, requestId);
  if (!keyResult.ok) return c.json(keyResult.error, 400);

  const numItems     = items.length;
  const upstreamKey  = keyResult.key;
  const chatUrl      = `${c.env.OPENROUTER_BASE_URL.replace(/\/+$/, "")}/chat/completions`;

  // 3. Screen each item via Llama Guard chat completions (parallel)
  const callOne = async (text: string): Promise<ModerationResult> => {
    const resp = await fetch(chatUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${upstreamKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://ahurasense.com",
        "X-Title": "AhuraCloud",
      },
      body: JSON.stringify({
        model: routing.upstreamModelId,
        messages: [{ role: "user", content: text }],
        max_tokens: 20,
        temperature: 0,
      }),
      signal: c.req.raw.signal,
    });
    if (!resp.ok) throw Object.assign(new Error(`upstream_${resp.status}`), { httpStatus: resp.status });
    const body = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return parseLlamaGuardOutput(body.choices?.[0]?.message?.content ?? "");
  };

  const settled = await Promise.allSettled(items.map((item) => callOne(item)));

  const serviceErr = gatewayError(
    "Moderation service is temporarily unavailable. Please try again.",
    "server_error", "service_unavailable", requestId,
  );

  if (settled.every((r) => r.status === "rejected")) {
    const firstReason = (settled[0] as PromiseRejectedResult).reason as { httpStatus?: number } | undefined;
    const upstreamStatus = firstReason?.httpStatus ?? 503;
    console.error(JSON.stringify({ level: "error", scope: "moderations", requestId, message: "All moderation calls failed", httpStatus: upstreamStatus }));
    c.executionCtx.waitUntil(enqueueUsage(c.env, buildBaseEvent(auth, req.model, "moderation", requestId, startedAt, {
      numUnits: numItems, unitLabel: "moderation", status: "error_upstream", errorCode: `upstream_${upstreamStatus}`,
    })));
    if (upstreamStatus === 429) {
      return c.json(gatewayError("Moderation service is temporarily rate-limited. Please retry after a moment.", "rate_limit_error", "rate_limited", requestId), 429);
    }
    return c.json(serviceErr, 503);
  }

  // Fail closed on partial failures — a moderation endpoint must never invent a
  // "safe" result for content that was not actually screened.
  const partialFailures = settled.filter((r) => r.status === "rejected").length;
  if (partialFailures > 0) {
    console.error(JSON.stringify({ level: "error", scope: "moderations", requestId, message: `${partialFailures}/${numItems} moderation calls failed` }));
    c.executionCtx.waitUntil(enqueueUsage(c.env, buildBaseEvent(auth, req.model, "moderation", requestId, startedAt, {
      numUnits: numItems, unitLabel: "moderation", status: "error_upstream", errorCode: "partial_upstream_failure",
    })));
    return c.json(serviceErr, 503);
  }

  const results: ModerationResult[] = settled.map((r) => (r as PromiseFulfilledResult<ModerationResult>).value);

  c.executionCtx.waitUntil(enqueueUsage(c.env, buildBaseEvent(auth, req.model, "moderation", requestId, startedAt, {
    numUnits: numItems, unitLabel: "moderation",
  })));

  return c.json(
    { id: `modr-${requestId}`, model: req.model, results },
    200,
    { "X-Ahura-Request-Id": requestId, "X-Ahura-Model": req.model }
  );
};
