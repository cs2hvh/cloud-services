/**
 * POST /v1/rerank — Relevance reranking.
 *
 * Accepts a query + up to 100 text documents and returns them ranked by
 * relevance score. Proxied to OpenRouter's /api/v1/rerank endpoint
 * (cohere/rerank-v3.5 today; model ID is stored in inference.models and
 * never exposed to callers — brand-hidden per the hard constraint).
 *
 * Response normalized to strip upstream fields (provider, document.text)
 * so customers only see Ahura's model slug and index+score pairs.
 *
 * Billing: per document scored (numUnits = documents.length, unitLabel = 'rerank_unit').
 * Pricing key in inference.models.pricing: { "cents_per_1k_rerank": N }
 */
import type { Handler } from "hono";
import { z } from "zod";
import type { Env, HonoVariables } from "../types.ts";
import { forwardJson } from "../lib/openrouter.ts";
import {
  gatewayError, buildBaseEvent, enqueueUsage, checkModelScope, resolveRouting, resolvePlatformKey,
  classifyUpstreamError,
} from "../lib/gateway.ts";

const MAX_DOCUMENTS = 100;
const MAX_QUERY_LENGTH = 2000;
const MAX_DOCUMENT_LENGTH = 4000;

const rerankSchema = z.object({
  model: z.string().min(1),
  query: z.string().min(1).max(MAX_QUERY_LENGTH),
  documents: z.array(z.string().min(1).max(MAX_DOCUMENT_LENGTH)).min(1).max(MAX_DOCUMENTS),
  top_n: z.number().int().positive().max(MAX_DOCUMENTS).optional(),
});

interface OpenRouterRerankResult {
  index: number;
  relevance_score: number;
  document?: { text: string };
}

interface OpenRouterRerankResponse {
  results: OpenRouterRerankResult[];
}

export const rerank: Handler<{ Bindings: Env; Variables: HonoVariables }> = async (c) => {
  const auth      = c.get("auth");
  const requestId = c.get("requestId");
  const startedAt = c.get("startedAt");

  // 1. Parse request
  let rawBody: unknown;
  try { rawBody = await c.req.json(); }
  catch {
    return c.json(gatewayError("Invalid JSON body", "invalid_request_error", "invalid_json", requestId), 400);
  }

  const parsed = rerankSchema.safeParse(rawBody);
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

  const numDocs = req.documents.length;
  const topN    = Math.min(req.top_n ?? numDocs, numDocs);

  // 3. Forward to OpenRouter /rerank
  let upstreamResp: Response;
  try {
    upstreamResp = await forwardJson({
      env: c.env,
      body: { model: routing.upstreamModelId, query: req.query, documents: req.documents, top_n: topN },
      upstreamKey: keyResult.key,
      path: "/rerank",
      signal: c.req.raw.signal,
    });
  } catch (err) {
    console.error(JSON.stringify({ level: "error", scope: "rerank", requestId, message: "Upstream fetch failed", err: String(err) }));
    c.executionCtx.waitUntil(enqueueUsage(c.env, buildBaseEvent(auth, req.model, "rerank", requestId, startedAt, {
      numUnits: numDocs, unitLabel: "rerank_unit", status: "error_upstream", errorCode: "upstream_fetch_failed",
    })));
    return c.json(gatewayError("Rerank service is temporarily unavailable. Please try again.", "server_error", "service_unavailable", requestId), 503);
  }

  if (!upstreamResp.ok) {
    const errText = await upstreamResp.text().catch(() => "");
    console.error(JSON.stringify({ level: "error", scope: "rerank", requestId, httpStatus: upstreamResp.status, upstreamErr: errText.slice(0, 200) }));
    c.executionCtx.waitUntil(enqueueUsage(c.env, buildBaseEvent(auth, req.model, "rerank", requestId, startedAt, {
      numUnits: numDocs, unitLabel: "rerank_unit", status: "error_upstream", errorCode: `upstream_${upstreamResp.status}`,
    })));
    const { status, retryAfter, errorType, errorCode, message } = classifyUpstreamError(upstreamResp.status, upstreamResp.headers);
    if (retryAfter) c.header("Retry-After", retryAfter);
    return c.json(gatewayError(message, errorType, errorCode, requestId), status as 429 | 408 | 503);
  }

  // 4. Parse response
  let upstreamBody: OpenRouterRerankResponse;
  try {
    upstreamBody = (await upstreamResp.json()) as OpenRouterRerankResponse;
  } catch {
    c.executionCtx.waitUntil(enqueueUsage(c.env, buildBaseEvent(auth, req.model, "rerank", requestId, startedAt, {
      numUnits: numDocs, unitLabel: "rerank_unit", status: "error_upstream", errorCode: "upstream_invalid_response",
    })));
    return c.json(gatewayError("Rerank service returned an unexpected response.", "server_error", "service_unavailable", requestId), 503);
  }

  // 5. Enqueue usage + return normalized response — upstream model/provider never visible
  c.executionCtx.waitUntil(enqueueUsage(c.env, buildBaseEvent(auth, req.model, "rerank", requestId, startedAt, {
    numUnits: numDocs, unitLabel: "rerank_unit",
  })));

  return c.json(
    {
      model:   req.model,
      results: (upstreamBody.results ?? []).map((r) => ({ index: r.index, relevance_score: r.relevance_score })),
      usage:   { rerank_units: numDocs },
    },
    200,
    { "X-Ahura-Request-Id": requestId, "X-Ahura-Model": req.model }
  );
};
