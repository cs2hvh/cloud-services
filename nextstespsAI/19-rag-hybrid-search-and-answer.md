# RAG hybrid search + grounded answer — what shipped, why, and how

**Date:** 2026-07-20 · **Companion to:** [04-rag-data-platform.md](04-rag-data-platform.md) (the design doc this implements a slice of) · **Status:** built, tested, migration written, not yet applied

---

## 1. What this is, in one paragraph

Customers already had a way to store documents and search them by meaning (vector similarity). This slice adds three things on top: **hybrid search** (meaning + exact keyword matching, fused into one ranked list), **reranking** (a second, more careful AI pass over the search results), and a brand-new **`/answer` endpoint** that does the whole "ask a question about your documents" job in one API call — search, rerank, and generate a written, cited answer — instead of making the customer stitch that together themselves.

---

## 2. Why this was built

Doc 04 ([04-rag-data-platform.md](04-rag-data-platform.md)) specs a full "Knowledge Bases as API" product — nine services including connectors, datasets, synthetic data, and RAG evals. Auditing the codebase against that doc found something important: **the headline feature was already ~70% built**, just under a different name. What customers call a "vector collection" (`inference.vector_collections` / `vector_rows`, with a dashboard page and a full API-key-authed CRUD surface) *is* the "Knowledge Base" primitive the doc describes — it just never got the doc's polish: no hybrid search, no reranking wired in, no one-call "ask a question" endpoint.

So instead of building a parallel system, this slice closes exactly that gap on the existing primitive. Everything else in doc 04 (connectors, datasets, RAG-specific evals, an async ingestion pipeline) is real, separate, larger work — not part of this slice.

---

## 3. The use case this serves

**The single most common thing a company wants from an AI platform:** *"let me ask questions about our own documents and get trustworthy answers."* Support bots over a help center, internal Q&A over company docs, a chatbot that answers from a product manual — all the same underlying need. Before this slice, a customer could search their documents and get back raw passages; they had to write their own logic to turn that into a real answer. Now there's one API call that does it.

**Concrete example — Priya, running support at a SaaS company:**
1. She creates a knowledge base (a "vector collection") and uploads her FAQ/policy docs.
2. A visitor asks her support bot "what's your refund policy?"
3. Her bot calls `POST /v1/vector/collections/{id}/answer` with that question.
4. It gets back a real answer — *"Refunds are issued within 5 days of purchase [1]. After that, they're prorated [1]."* — plus a `citations` array pointing at exactly which document each claim came from, so her bot (or a human reviewing it) can verify the answer isn't made up.

---

## 4. How it works technically

### 4.1 The three pieces, in order of how a request flows

**Hybrid search** (`inference.hybrid_search`, new Postgres RPC): a search request has two possible signals — *"documents like this in meaning"* (vector similarity, via pgvector) and *"documents containing these exact words"* (classic keyword search, via Postgres full-text search). Pure meaning-based search can miss an exact term (a SKU, a product code, a specific phrase) if the AI's embedding doesn't weight it heavily. This RPC runs both searches and **fuses them with Reciprocal Rank Fusion (RRF)**: each document gets a score based on *where it ranked* in each list (not the raw scores, which aren't comparable across the two methods), and the two rank-based scores are summed. A document that both methods agree on rises to the top; a document only one method found still surfaces, just lower.

**Reranking** (reuses the already-live `ahura/rerank-m3` model): search returns a batch of candidates fast but somewhat roughly ranked. Reranking takes that candidate pool and runs a slower, more accurate AI model over just those candidates to re-score and reorder them — the same two-stage "fast recall, then precise re-rank" pattern most production search systems use. This is best-effort: if the rerank call fails for any reason (timeout, model hiccup), the original search order is returned unchanged — a rerank failure never breaks the request.

**Grounded generation** (`POST /answer`, brand new): composes the above with one more step — it takes the top reranked passages, numbers them, hands them to an LLM with instructions to answer *only* from that context and cite every claim with a `[n]` marker, then parses the answer to return only the citations actually referenced (dropping unused ones, and any hallucinated marker outside the real range).

### 4.2 Request flow, end to end

```
customer → POST /v1/vector/collections/{id}/answer
             { "query": "what's the refund policy?", "model": "openai/gpt-4o-mini" }
                │
                ▼
  1. Validate + auth + spend-cap check (now correctly enforced — see §6)
  2. Embed the query text → a vector (billed)
  3. Hybrid search: vector + full-text fused via RRF → candidate pool
  4. Rerank the candidate pool with a real cross-encoder model (billed)
  5. Take the top N, build a numbered context block
  6. One chat completion: "answer using ONLY this context, cite with [n]" (billed)
  7. Parse the answer, keep only the citations it actually used
                │
                ▼
  ← { "answer": "...", "citations": [...], "usage": {...} }
```

### 4.3 What changed in the database

One migration (`20260720000001_rag_hybrid_search.sql`), additive only:
- A new `content_tsv` column on `vector_rows` — auto-maintained by Postgres itself (a "generated column"), no application code has to keep it in sync
- A search index (GIN) on that column, so keyword search is fast
- The new `hybrid_search` function — doesn't touch or replace the existing `search_vectors` function, so nothing that already works changes behavior

Nothing is destructive. No existing table is dropped or restructured, no existing API behavior changes unless a caller explicitly opts into the new `mode`/`rerank` parameters.

---

## 5. API reference

### `POST /v1/vector/collections/{id}/query` (existing endpoint, extended)

New optional fields, both default to today's exact behavior (no change unless you opt in):
```jsonc
{
  "text": "refund policy",
  "mode": "hybrid",     // "vector" (default, unchanged) | "hybrid" (new)
  "rerank": true         // default false
}
```

### `POST /v1/vector/collections/{id}/answer` (brand new)

```jsonc
// request
{
  "query": "What's the SLA for the Pro plan?",
  "model": "openai/gpt-4o-mini",
  "top_k": 6,           // default 6, max 20
  "mode": "hybrid",      // default "hybrid" (best quality by default here)
  "rerank": true          // default true
}
// response
{
  "answer": "The Pro plan SLA is 99.9% monthly uptime [1].",
  "citations": [
    { "marker": 1, "document_id": "sla-doc", "source": "SLA.pdf", "snippet": "...", "score": 0.91 }
  ],
  "usage": { "retrieval_docs": 6, "prompt_tokens": 340, "completion_tokens": 22 }
}
```

---

## 6. Billing — what's charged, and a real bug this work found and fixed

Every real step now bills correctly: the embedding call, the rerank call, and the chat completion. That wasn't automatic — building this surfaced a genuine, serious bug: **`/query` used to be exempt from the org spend-cap check** (correct when it was pure math with zero cost), and adding a paid `rerank` option to it without re-classifying it would have let an over-cap org bypass the hard cap entirely. Fixed by removing it from the exemption list — full detail in this repo's own commit history and the code comments in `lib/management-paths.ts`.

**Known, deliberate gap, not part of this slice:** the *ingestion* side (`/upsert`, and the dashboard's file/URL upload routes) has the identical "embed call is never billed to the customer" pattern this slice fixed for search/answer. It's a real gap, flagged, not yet fixed — a natural next slice.

---

## 7. What this is NOT (scope, stated plainly)

- **Not** the full doc 04 product — no connectors (S3/Drive/Notion/crawl), no versioned datasets, no synthetic data generation, no RAG-specific evals (recall@k/MRR/faithfulness), no async ingestion pipeline
- **No caching** — every `/answer` call re-embeds and re-generates fresh, even for an identical repeated question. A real cost consideration at scale, a known v1 simplification
- **No guardrails/BYOK on `/answer`'s LLM call** — it's a direct, minimal proxy call, not the full `/v1/chat/completions` feature set (no prompt-injection guardrail, no semantic cache, always platform-billed)
- **`full_text_weight`/`semantic_weight`** exist in the database function (for later tuning: bias a product-SKU-heavy KB toward exact matches, or a general-FAQ KB toward meaning) but aren't yet exposed on the customer-facing API

---

## 8. How to actually turn this on

1. Apply `supabase/migrations/20260720000001_rag_hybrid_search.sql` — additive, no downtime, no data migration needed
2. That's it — existing `/query` calls are unaffected; `mode`/`rerank` are opt-in; `/answer` is a new endpoint nothing depends on yet
3. Recommended first real test: create a small collection, add a few documents, call `/answer` with a real question, confirm the citations point at real content
