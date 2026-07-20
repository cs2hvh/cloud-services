/**
 * POST /v1/vector/collections/:id/answer — grounded generation with citations.
 *
 * nextstespsAI/04-rag-data-platform.md service #5, "RAG in one call": embed
 * the query → hybrid retrieve → rerank → build a numbered, cited context →
 * one chat completion → return the answer + the citations it actually used.
 *
 * Composes existing primitives (embeddings, inference.hybrid_search /
 * search_vectors, the rerank model, chat completions) rather than adding new
 * infrastructure — same "compose, don't rebuild" call the doc makes. The LLM
 * leg is a direct forwardJson call (this Worker has no SELF binding, so it
 * can't hit its own /chat/completions route in-process — same constraint
 * that made agentcore durable-only, see nextstespsAI/11 §16). v1 always
 * bills to the platform key (no BYOK here yet), matching the six other
 * per-unit routes in this gateway (see lib/gateway.ts's header comment).
 *
 * Guardrails: runs the SAME per-org guardrail engine /v1/chat/completions
 * uses (lib/guardrail.ts) over the constructed prompt before it reaches the
 * model — retrieved KB content is untrusted input injected into that
 * prompt, and "prompt injection through retrieved documents" is a named
 * production-RAG risk this route must not skip just because it composes
 * existing pieces rather than being the primary chat route.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Handler } from "hono";
import { z } from "zod";
import type { Env, HonoVariables } from "../types.ts";
import { buildBaseEvent, checkModelScope, enqueueUsage, gatewayError, resolveRouting } from "../lib/gateway.ts";
import { forwardJson, resolveUpstreamKey } from "../lib/openrouter.ts";
import { isValidUuid } from "../lib/on-behalf-of.ts";
import { makeSupabase, readJson } from "../lib/route-helpers.ts";
import { rerankCandidates } from "../lib/rag-rerank.ts";
import { embedText, fetchCollection } from "./vector-collections.ts";
import { resolveOrgGuardrailPolicy, evaluateOrgGuardrail, extractUserTextsFromOpenAI } from "../lib/guardrail.ts";

const MAX_CONTEXT_CHARS_PER_CHUNK = 2000;

export const answerSchema = z.object({
  query: z.string().min(1).max(4000),
  model: z.string().min(1),
  top_k: z.number().int().positive().max(20).default(6),
  mode: z.enum(["vector", "hybrid"]).default("hybrid"),
  rerank: z.boolean().default(true),
  filter: z.record(z.string(), z.unknown()).optional(),
});

interface AnswerCollectionRow {
  id: string;
  dimensions: number;
  distance_metric: string;
  embedding_model_id: string | null;
}

interface SearchRow {
  id: string;
  external_id: string;
  content: string | null;
  metadata: Record<string, unknown>;
  similarity: number;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export function buildContext(rows: SearchRow[]): { block: string; citations: Array<{ marker: number; document_id: string; source: string | null; snippet: string; score: number }> } {
  const citations = rows.map((r, i) => ({
    marker: i + 1,
    document_id: r.external_id,
    source: (r.metadata?.source as string | undefined) ?? r.external_id,
    snippet: (r.content ?? "").slice(0, 240),
    score: Number(r.similarity.toFixed(4)),
  }));
  const block = rows
    .map((r, i) => `[${i + 1}] ${(r.content ?? "").slice(0, MAX_CONTEXT_CHARS_PER_CHUNK)}`)
    .join("\n\n");
  return { block, citations };
}

/** Only return citations the answer actually referenced via [n] — a model
 *  that hallucinates a marker outside the retrieved range gets it dropped.
 *
 *  No "fall back to all context if nothing was cited" — found live,
 *  2026-07-20: that fallback (originally meant for a real answer where the
 *  model forgot its [n] markers) fires identically when the model correctly
 *  DECLINES to answer ("I don't have that information") because nothing was
 *  relevant, and citing every retrieved-but-irrelevant document on an "I
 *  don't know" answer is actively misleading, not a helpful degrade. An
 *  empty citations array on an uncited answer is the honest result either
 *  way — worst case a real answer loses attribution, which is strictly
 *  better than implying unrelated documents informed it. */
export function usedCitations(
  answer: string,
  all: Array<{ marker: number; document_id: string; source: string | null; snippet: string; score: number }>,
): Array<{ marker: number; document_id: string; source: string | null; snippet: string; score: number }> {
  const referenced = new Set(
    Array.from(answer.matchAll(/\[(\d+)\]/g)).map((m) => Number(m[1])),
  );
  return all.filter((c) => referenced.has(c.marker));
}

// POST /v1/vector/collections/:id/answer
export const answerFromCollection: Handler<{ Bindings: Env; Variables: HonoVariables }> = async (c) => {
  const auth = c.get("auth");
  const requestId = c.get("requestId");
  const startedAt = Date.now();
  const id = c.req.param("id");
  if (!id || !isValidUuid(id)) {
    return c.json(gatewayError("Invalid collection id", "invalid_request_error", "invalid_request", requestId), 400);
  }

  const raw = await readJson(c);
  if (raw === undefined) {
    return c.json(gatewayError("Invalid JSON body", "invalid_request_error", "invalid_json", requestId), 400);
  }
  const parsed = answerSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      gatewayError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), "invalid_request_error", "invalid_request", requestId),
      400,
    );
  }
  const req = parsed.data;

  const scopeErr = checkModelScope(auth, req.model, requestId);
  if (scopeErr) return c.json(scopeErr, 403);

  const supabase: SupabaseClient = makeSupabase(c.env);
  const collection = await fetchCollection<AnswerCollectionRow>(
    supabase,
    auth.orgId,
    id,
    "id, dimensions, distance_metric, embedding_model_id",
  );
  if (!collection) {
    return c.json(gatewayError("Collection not found", "invalid_request_error", "collection_not_found", requestId), 404);
  }
  if (!collection.embedding_model_id) {
    return c.json(
      gatewayError(
        "This is a bring-your-own-embeddings collection — /answer needs server-side auto-embed and isn't available for it. Use /query with a pre-computed embedding instead.",
        "invalid_request_error",
        "byo_embeddings_collection",
        requestId,
      ),
      400,
    );
  }

  const routing = await resolveRouting(c.env, req.model, requestId);
  // resolveRouting's every failure branch codes as "model_unavailable" — no
  // finer-grained signal to branch on, so match the established convention
  // (rerank.ts, the six other per-unit routes) of a flat 503 here.
  if (!routing.ok) return c.json(routing.error, 503);

  // 1. Embed the query. Billed like any other embedding call — this hits a
  // real, metered upstream regardless of customer billing, so leaving it
  // free would be a real margin leak on what's meant to be the flagship
  // "ask a question" endpoint (nextstespsAI/04-rag-data-platform.md).
  let queryEmbedding: number[];
  try {
    const embedResult = await embedText(c.env, req.query, collection.embedding_model_id);
    queryEmbedding = embedResult.embedding;
    void enqueueUsage(
      c.env,
      buildBaseEvent(auth, collection.embedding_model_id, "embedding", requestId, startedAt, {
        inputTokens: embedResult.inputTokens,
        outputTokens: 0,
        numUnits: 1,
        unitLabel: "embedding",
      }),
    );
  } catch {
    return c.json(gatewayError("Failed to embed the query. Try again in a moment.", "server_error", "embed_failed", requestId), 502);
  }

  // 2. Retrieve — over-fetch when reranking, same reasoning as queryCollection.
  const fetchLimit = req.rerank ? Math.min(Math.max(req.top_k * 4, 20), 100) : req.top_k;
  const { data, error } =
    req.mode === "hybrid"
      ? await supabase.schema("inference").rpc("hybrid_search", {
          p_collection_id: collection.id,
          p_query_embedding: JSON.stringify(queryEmbedding),
          p_query_text: req.query,
          p_distance_metric: collection.distance_metric,
          p_limit: fetchLimit,
          ...(req.filter ? { p_metadata_filter: req.filter } : {}),
        })
      : await supabase.schema("inference").rpc("search_vectors", {
          p_collection_id: collection.id,
          p_query_embedding: JSON.stringify(queryEmbedding),
          p_distance_metric: collection.distance_metric,
          p_limit: fetchLimit,
          p_min_similarity: 0,
          ...(req.filter ? { p_metadata_filter: req.filter } : {}),
        });
  if (error) {
    return c.json(gatewayError("Retrieval failed", "server_error", "vector_search_failed", requestId), 500);
  }
  let rows = (data as unknown as SearchRow[] | null) ?? [];
  if (rows.length === 0) {
    return c.json({ answer: "I don't have any information about that in this knowledge base.", citations: [], usage: { retrieval_docs: 0, prompt_tokens: 0, completion_tokens: 0 } });
  }

  // 3. Rerank (best-effort).
  if (req.rerank) {
    rows = await rerankCandidates(c.env, auth, requestId, req.query, rows);
  }
  rows = rows.slice(0, req.top_k);

  // 4. Build the cited context + prompt, call the model directly (no SELF
  //    binding — see file header). Platform-billed, matching every other
  //    per-unit route.
  const { block, citations } = buildContext(rows);
  let messages: Array<{ role: string; content: string }> = [
    {
      role: "system",
      content:
        "Answer the user's question using ONLY the numbered context blocks below. " +
        "Cite every claim with the matching [n] marker. If the context doesn't contain " +
        "the answer, say so plainly instead of guessing.\n\nContext:\n" + block,
    },
    { role: "user", content: req.query },
  ];

  // Guardrail — retrieved document content is untrusted input injected
  // straight into the prompt (a KB document a customer ingested, possibly
  // from a URL or file upload, could carry a hidden prompt-injection
  // payload). "Prompt injection through retrieved documents" is a named,
  // explicit production-RAG risk (found via research, 2026-07-20) — this
  // was a real gap, not a v1 nice-to-have: the route was forwarding
  // retrieved content straight to the LLM with zero scanning. Reuses the
  // exact same engine /v1/chat/completions already runs — not a new
  // guardrail invented for this route. extractUserTextsFromOpenAI scans
  // BOTH "user" and "system" roles, so it covers the injected context block
  // (system) as well as the customer's own query (user).
  const orgGuardrailPolicy = await resolveOrgGuardrailPolicy(c.env, auth.orgId, c.req.header("X-Ahura-Guardrail"));
  const guardrailTexts = extractUserTextsFromOpenAI(messages);
  const guardrail = evaluateOrgGuardrail(guardrailTexts, messages, orgGuardrailPolicy);
  c.header("X-Ahura-Guardrail", guardrail.action);
  if (guardrail.action === "blocked") {
    return c.json(
      gatewayError(
        `Request blocked by guardrail (patterns: ${guardrail.hits.map((h) => h.pattern_id).join(", ")})`,
        "invalid_request_error",
        "guardrail_blocked",
        requestId,
      ),
      400,
    );
  }
  if (guardrail.redactedMessages) {
    messages = guardrail.redactedMessages as typeof messages;
  }

  // Always "platform" billing (v1 has no BYOK here) — the only way this
  // throws is a missing OPENROUTER_PLATFORM_KEY, a server misconfiguration,
  // not a customer error. Report it as one: 500, not the 400
  // "byok_unavailable" a real BYOK-resolution failure would use elsewhere.
  let upstreamKey: string;
  try {
    upstreamKey = await resolveUpstreamKey(c.env, "platform", auth.orgId, undefined);
  } catch {
    return c.json(gatewayError("Generation is temporarily unavailable. Please try again.", "server_error", "service_unavailable", requestId), 500);
  }

  let upstream: Response;
  try {
    upstream = await forwardJson({
      env: c.env,
      upstreamKey,
      path: "/chat/completions",
      body: { model: routing.upstreamModelId, messages },
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    return c.json(gatewayError("Generation is temporarily unavailable. Please try again.", "server_error", "service_unavailable", requestId), 503);
  }
  if (!upstream.ok) {
    return c.json(gatewayError("Generation failed upstream.", "server_error", "service_unavailable", requestId), 502);
  }

  const body = (await upstream.json()) as ChatCompletionResponse;
  const answer = body.choices?.[0]?.message?.content ?? "";
  const promptTokens = body.usage?.prompt_tokens ?? 0;
  const completionTokens = body.usage?.completion_tokens ?? 0;

  void enqueueUsage(
    c.env,
    buildBaseEvent(auth, req.model, "chat", requestId, startedAt, {
      inputTokens: promptTokens,
      outputTokens: completionTokens,
    }),
  );

  return c.json({
    answer,
    citations: usedCitations(answer, citations),
    usage: { retrieval_docs: rows.length, prompt_tokens: promptTokens, completion_tokens: completionTokens },
  });
};
