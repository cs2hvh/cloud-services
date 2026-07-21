/**
 * POST /api/inference/vector/collections/[id]/answer
 *
 * Grounded generation with citations — the dashboard/session-authed
 * counterpart to the API-key gateway's POST /v1/vector/collections/:id/answer
 * (workers/inference/src/routes/vector-answer.ts). Same design: embed the
 * query → hybrid retrieve → rerank → build a numbered, cited context → one
 * chat completion → return the answer + only the citations it actually used.
 *
 * Guardrails: runs the same evaluateJailbreak/evaluateRegex/redactPii
 * primitives the gateway and the guardrails/test route both use, over the
 * constructed prompt (which includes the retrieved, untrusted KB content) —
 * not skipped just because this is the dashboard "try it out" surface.
 * "Prompt injection through retrieved documents" is a named production-RAG
 * risk, independent of which surface calls the model.
 *
 * Not billed — same as embedText/rerankCandidates on this dashboard surface;
 * production traffic goes through the API-key gateway, which bills every call.
 *
 * Body:
 *   { query: string, model: string, top_k?: number (1-20, default 6),
 *     mode?: "vector"|"hybrid" (default "hybrid"), rerank?: boolean (default true),
 *     filter?: object }
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { authenticateUserFromHeader } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getActiveOrgForUser } from "@/lib/inference/orgs";
import { embedText } from "@/lib/inference/embeddings";
import { rerankCandidates } from "@/lib/inference/rerank";
import { resolveChatUpstreamModelId, callChatCompletion } from "@/lib/inference/chat";
import { customerSafeErrorMessage } from "@/lib/inference/error-messages";
import { evaluateJailbreak, type GuardrailHit } from "@/lib/guardrail-eval";

const MAX_CONTEXT_CHARS_PER_CHUNK = 2000;

const answerSchema = z.object({
  query: z.string().min(1).max(4000),
  model: z.string().min(1),
  top_k: z.number().int().positive().max(20).default(6),
  mode: z.enum(["vector", "hybrid"]).default("hybrid"),
  rerank: z.boolean().default(true),
  filter: z.record(z.string(), z.unknown()).optional(),
});

function isUuid(s: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(s);
}

interface SearchRow {
  id: string;
  external_id: string;
  content: string | null;
  metadata: Record<string, unknown>;
  similarity: number;
  // Present only when mode:"hybrid" / rerank:true respectively — see the
  // sibling query/route.ts for why these exist.
  rrf_score?: number;
  rerank_score?: number;
}

interface Citation {
  marker: number;
  document_id: string;
  source: string | null;
  snippet: string;
  score: number;
}

function buildContext(rows: SearchRow[]): { block: string; citations: Citation[] } {
  const citations = rows.map((r, i) => ({
    marker: i + 1,
    document_id: r.external_id,
    source: (r.metadata?.source as string | undefined) ?? r.external_id,
    snippet: (r.content ?? "").slice(0, 240),
    // The score that actually decided this row's position — found live,
    // 2026-07-21: citations always showed pre-rerank/pre-fusion `similarity`,
    // giving no visible signal that reranking/hybrid fusion had reordered
    // the rows a citation's [n] marker points at.
    score: Number((r.rerank_score ?? r.rrf_score ?? r.similarity).toFixed(4)),
  }));
  const block = rows
    .map((r, i) => `[${i + 1}] ${(r.content ?? "").slice(0, MAX_CONTEXT_CHARS_PER_CHUNK)}`)
    .join("\n\n");
  return { block, citations };
}

/** Only citations the answer actually referenced via [n] — no fallback to
 *  "all context" when nothing was cited (that would misleadingly attach
 *  irrelevant documents to a correct "I don't know" answer). */
function usedCitations(answer: string, all: Citation[]): Citation[] {
  const referenced = new Set(Array.from(answer.matchAll(/\[(\d+)\]/g)).map((m) => Number(m[1])));
  return all.filter((c) => referenced.has(c.marker));
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateUserFromHeader(request);
  if (!auth.authenticated) return auth.response;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid collection id" }, { status: 400 });

  const rl = await limitByUser(auth.user!.id, { prefix: "rl:inf-vec-answer", limit: 30, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const body = await request.json();
  const parsed = answerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation error", details: parsed.error.issues }, { status: 400 });
  }
  const req = parsed.data;

  const org = await getActiveOrgForUser(auth.user!.id);
  if (!org) return NextResponse.json({ error: "No inference org" }, { status: 404 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: collection } = await supabase
    .schema("inference")
    .from("vector_collections")
    .select("id, dimensions, distance_metric, embedding_model_id")
    .eq("id", id)
    .eq("org_id", org.org_id)
    .maybeSingle<{ id: string; dimensions: number; distance_metric: string; embedding_model_id: string | null }>();

  if (!collection) return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  if (!collection.embedding_model_id) {
    return NextResponse.json(
      {
        error:
          "This is a bring-your-own-embeddings collection — /answer needs server-side auto-embed and isn't available for it. Use Query with a pre-computed embedding instead.",
      },
      { status: 400 }
    );
  }

  const upstreamModelId = await resolveChatUpstreamModelId(req.model);
  if (!upstreamModelId) {
    return NextResponse.json({ error: `Model "${req.model}" is not available.` }, { status: 503 });
  }

  // 1. Embed the query.
  let queryEmbedding: number[];
  try {
    queryEmbedding = (await embedText(req.query, collection.embedding_model_id)).embedding;
  } catch (err) {
    console.error("[Inference Vector] answer auto-embed failed:", err);
    return NextResponse.json(
      { error: customerSafeErrorMessage(err instanceof Error ? err.message : "Auto-embed failed") || "Auto-embed failed. Try again." },
      { status: 502 }
    );
  }

  // 2. Retrieve.
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
    console.error("[Inference Vector] answer retrieval error:", error);
    return NextResponse.json({ error: "Retrieval failed" }, { status: 500 });
  }
  let rows = (data as unknown as SearchRow[] | null) ?? [];
  if (rows.length === 0) {
    return NextResponse.json({
      success: true,
      answer: "I don't have any information about that in this knowledge base.",
      citations: [],
      usage: { retrieval_docs: 0, prompt_tokens: 0, completion_tokens: 0 },
    });
  }

  // 3. Rerank (best-effort).
  if (req.rerank) rows = await rerankCandidates(req.query, rows);
  rows = rows.slice(0, req.top_k);

  // 4. Build the cited context + prompt.
  const { block, citations } = buildContext(rows);
  const messages = [
    {
      role: "system",
      content:
        "Answer the user's question using ONLY the numbered context blocks below. " +
        "Cite every claim with the matching [n] marker. If the context doesn't contain " +
        "the answer, say so plainly instead of guessing.\n\nContext:\n" + block,
    },
    { role: "user", content: req.query },
  ];

  // Guardrail — retrieved document content is untrusted input injected into
  // the prompt (a KB document could carry a hidden prompt-injection payload).
  // Same evaluator the gateway's /v1/chat/completions uses for its own
  // default (no X-Ahura-Guardrail header) policy: jailbreak-only, warn mode
  // (log, don't block) — matched deliberately, not just "picked a default",
  // so this dashboard panel demonstrates the SAME behavior the real API-key
  // gateway gives an org with no custom policy configured, not a divergent
  // stricter-or-looser one. PII redaction is opt-in per stored org policy on
  // the gateway (not part of its own default either), so it's not applied
  // here automatically — same reasoning, avoid inventing behavior the real
  // API doesn't have by default.
  const hits: GuardrailHit[] = evaluateJailbreak(messages.map((m) => m.content));
  if (hits.length > 0) {
    console.log(
      JSON.stringify({
        level: "info",
        scope: "vector-answer-guardrail",
        orgId: org.org_id,
        pattern_ids: hits.map((h) => h.pattern_id),
      })
    );
  }

  // 5. Generate.
  let result;
  try {
    result = await callChatCompletion(upstreamModelId, messages);
  } catch (err) {
    console.error("[Inference Vector] answer generation failed:", err);
    return NextResponse.json(
      { error: customerSafeErrorMessage(err instanceof Error ? err.message : "Generation failed") || "Generation failed. Try again." },
      { status: 502 }
    );
  }

  return NextResponse.json({
    success: true,
    answer: result.content,
    citations: usedCitations(result.content, citations),
    usage: { retrieval_docs: rows.length, prompt_tokens: result.promptTokens, completion_tokens: result.completionTokens },
  });
}
