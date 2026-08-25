# AhuraCloud — RAG & Data Platform Cluster: Design Document

## 1. Services & customer value

This cluster productizes what AhuraCloud already does internally for the Agents knowledge bases (`lib/ai/document-parsers.ts`, `lib/ai/chunking.ts`, `lib/ai/rag.ts`) and the managed pgvector store (`inference.vector_collections` / `vector_rows`), and exposes it as first-class, standalone APIs. Nine distinct services:

1. **Knowledge Bases as API (managed retrieval).** A customer creates a KB, points connectors/uploads at it, and gets a single `/v1/knowledge/{kb}/search` endpoint that handles parse → chunk → embed → index → hybrid-retrieve → rerank with zero infra on their side. This is the headline product — today the only way to get this is the per-Agent KB; we lift it out as a reusable primitive. *Reference points: Vectorize, Pinecone Assistant, Vertex AI Search, AWS Knowledge Bases for Bedrock.*

2. **Document parsing / OCR pipeline.** `/v1/parse` turns PDF/DOCX/PPTX/HTML/scanned images into clean Markdown + structured blocks (tables, headings, page spans). Customer buys "don't write a PDF parser." *Reference: Unstructured.io, LlamaParse, Reducto, Mistral OCR.*

3. **Chunking + embeddings pipeline.** Standalone `/v1/chunk` and the existing `/v1/embeddings`, plus a batched **embed-job** for millions of chunks. Customer buys throughput and chunking strategy (recursive, markdown-aware, semantic) without standing up a worker fleet.

4. **Hybrid search + reranking.** Dense (pgvector) + sparse (BM25/`tsvector`) fusion via Reciprocal Rank Fusion, then a cross-encoder rerank pass. Closes the retrieval stack the platform already half-owns (embeddings + vector store exist; reranking is gap #3 in the competitive analysis). *Reference: Cohere Rerank, Voyage rerank, Pinecone hybrid.*

5. **Grounded-generation API with citations.** `/v1/knowledge/{kb}/answer` — retrieves, calls an LLM through the existing gateway, returns an answer with inline span-level citations back to source documents. This is the "RAG in one call" endpoint. *Reference: Perplexity Sonar API, Vertex grounded generation, Cohere `/chat` with `documents`.*

6. **Data connectors.** Managed sync from S3-compatible buckets, Google Drive, Notion, and web crawl. Incremental re-sync on a schedule. Customer buys "keep my KB fresh automatically." *Reference: Pinecone connectors, Vectorize.io, Carbon/Unstructured connectors.*

7. **Dataset management (versioned).** Immutable, versioned datasets (JSONL/Parquet) that feed both fine-tuning (`inference.finetunes`) and evals. A dataset version is a content-addressed snapshot in R2. Customer buys reproducibility for training + eval. *Reference: HF Datasets, W&B Artifacts, Scale Data Engine.*

8. **Synthetic data generation.** Generate instruction/QA/DPO-preference pairs from a KB or seed dataset, using the gateway's LLMs, written out as a new dataset version. Feeds the FT product. *Reference: OpenAI/Together synthetic data, Argilla Distilabel, Gretel.*

9. **RAG evaluation.** Run retrieval + answer quality metrics (recall@k, MRR, faithfulness, answer-relevance via LLM-judge) over a versioned eval dataset against a KB config. Proof point that sells fine-tuning + retrieval. *Reference: Ragas, TruLens, Vertex eval.*

The cluster's strategic role: it is the **attach-revenue ring around the vector store and fine-tuning**, and it removes the "Agents product is demo-grade" risk (gap #13) by giving the Agents KB a real, hardened backend.

## 2. Build vs proxy

The hard constraint (upstream names never customer-visible) means every "proxy" decision must route through a brand-hideable upstream whose name appears only in server env/logs/schema — exactly like `OPENROUTER_PLATFORM_KEY` in `lib/inference/embeddings.ts` today.

| Service | Decision | Upstream / substrate | Justification |
|---|---|---|---|
| **Embeddings** | **Proxy (already)** | OpenRouter via `OPENROUTER_PLATFORM_KEY` | Already shipped; reuse `embedText()`. Zero GPU burden. |
| **Reranking** | **Build on substrate** | RunPod Serverless now → own B300/H200 later (via `deploy-runner` pattern) | Cross-encoders (bge-reranker-v2-m3, ~560M) are tiny and not well-served by OpenRouter's chat-only catalog. Perfect fit for the existing BYO serverless deploy substrate (`lib/inference/deploy-runpod.ts`). Owning it gives per-token margin and avoids a third upstream. |
| **Document parsing / OCR** | **Hybrid** | Native libs in-process for text formats (`pdf-parse`, `mammoth` already used by `document-parsers.ts`); **GPU OCR model** on RunPod Serverless for scanned/image PDFs (e.g. a docTR/Marker-class model) | Text extraction is cheap CPU work — keep it on the k8s runner. Scanned-doc OCR needs GPU; reuse the same serverless deploy substrate as reranking. A proxied OCR SaaS would add a brand-scrub surface and a margin leak. |
| **Chunking** | **Build (in-process)** | k8s runner CPU | Pure CPU; `lib/ai/chunking.ts` already implements recursive + markdown splitters. Semantic chunking adds one embedding pass through the existing proxy. |
| **Hybrid search** | **Build (Postgres-native)** | Supabase Postgres (pgvector + `tsvector` GIN) | Both halves live in the DB we already run. RRF fusion is a SQL/RPC concern. No new dependency. |
| **Grounded generation** | **Compose** | Gateway → OpenRouter (LLM) + our own retrieval | It's retrieval (ours) + one chat completion (existing proxy). No new upstream. |
| **Connectors** | **Build** | k8s runner (BullMQ recurring jobs) + R2 staging | S3/Drive/Notion/crawl are HTTP clients; the OAuth tokens are BYO-credential (encrypt like `byok_keys`, AES-256-GCM per `lib/inference/crypto.ts`). Web crawl uses a headless fetch on the runner. No upstream to hide. |
| **Datasets** | **Build** | R2 (content-addressed) + Postgres metadata | Reuse the R2 client already used for LoRA adapters + batch storage (`lib/inference/batch-storage.ts`). |
| **Synthetic data** | **Compose** | Gateway LLMs + runner orchestration | Just structured LLM calls written to a dataset version; runner job. |
| **RAG evals** | **Build (compose)** | runner + gateway (LLM-judge) + retrieval | Recall/MRR are deterministic; faithfulness/relevance are LLM-judge calls through the proxy. |

**Net new upstream dependency: none customer-facing.** The only new *upstream-style* element is one or two GPU model images (reranker, OCR) running on the **existing RunPod Serverless substrate**, slotting into the planned own-fleet migration exactly like BYO deploys do today. The candidate upstreams I considered and rejected for proxying (so they never appear anywhere): Cohere/Voyage for rerank (margin leak + extra BYOK surface), LlamaParse/Reducto for OCR (brand-scrub surface). We self-serve those on substrate instead.

## 3. Architecture

The cluster maps onto the 4 existing deployables plus **one new k8s runner** (the data-runner). It deliberately mirrors the ft-runner shape.

**Deployable mapping:**

- **CF Worker gateway (`workers/inference`)** — adds the hot-path read APIs that must be globally fast and cheap: `/v1/rerank`, `/v1/knowledge/{kb}/search`, `/v1/knowledge/{kb}/answer`, `/v1/parse` (sync, small docs only). These slot into the existing `v1` Hono group after `authMiddleware` → `spendCheckMiddleware` → `rateLimitMiddleware` (`workers/inference/src/index.ts:96-109`). Search/rerank are read-heavy and latency-sensitive — exactly the edge's job. Heavy work (full-document OCR, KB ingest, connector sync, evals, synthetic gen) is **never** done inline on the Worker; the Worker enqueues and returns a job handle, identical to how chat-completions is the only heavy thing today.

- **Next.js control plane (`app/api/inference/*`)** — adds dashboard CRUD + job-submit routes under `app/api/inference/knowledge/`, `/parse/`, `/datasets/`, `/connectors/`, `/evals/`, `/synthetic/`. These insert the DB row then best-effort enqueue to BullMQ (the exact `enqueueFinetuneJob` pattern in `lib/inference/finetune-queue.ts`). Also hosts the cron-only internal sweep endpoints under `app/api/inference/internal/` (e.g. `/connector-scheduler`, `/ingest-watchdog`) called by the Worker `scheduled` handler with `X-Ahura-Internal-Token`.

- **k8s runners** — **NEW `data-runner`** (`workers/data-runner`), a sibling to `ft-runner` with the same boot shape (`workers/ft-runner/src/index.ts`): IORedis + BullMQ `Worker` + a Postgres `Claimer` polling for `queued` jobs + `/health` for k8s probes + heartbeat store. It owns long jobs: document OCR/parse, KB ingestion (parse→chunk→embed→index), connector sync, embed-jobs, synthetic generation, eval runs. Concurrency per-process (`MAX_CONCURRENT_JOBS`), single replica for v1. GPU work (reranker, OCR model) is reached the same way `ft-runner` reaches RunPod — the runner calls the serverless endpoint registered via the deploy substrate; it does not run the GPU itself.

- **Cron (CF Worker `scheduled`)** — extends the existing `scheduled()` dispatcher (`workers/inference/src/index.ts:197-216`). Two additions, both calling control-plane internal sweeps via `runControlPlaneSweep`:
  - every 5 min → `/api/inference/internal/connector-scheduler` (enqueue due connector re-syncs) and `/api/inference/internal/ingest-watchdog` (reap stalled ingest jobs by heartbeat, mirror of `runFinetuneWatchdog`).
  - The **billing meter** for KB storage rides the *existing* 5-minute platform billing cron (`bill_service_cycle_atomic` over `billing.active_*`), not this one — see §7.

**State location:**
- **Hot/edge state:** API-key auth in CF KV (unchanged); rerank model-id → serverless-endpoint routing cached in KV (like serving-pod routing).
- **Durable metadata:** Supabase Postgres `inference` schema (KBs, documents, chunks live as `vector_rows`, connectors, datasets, dataset_versions, eval_runs).
- **Vectors + BM25:** Postgres (pgvector `embedding` + `tsvector content_tsv`), partitioned/scaled per §9.
- **Blobs:** R2 — raw uploaded docs, parsed Markdown, dataset version files (content-addressed by sha256), eval reports. Same R2 client as adapters/batches.
- **Queues:** Redis/BullMQ `ahura-data-runner` queue; job claim source-of-truth in Postgres (`status='queued'`).

**Request flow — `POST /v1/knowledge/{kb}/answer` (grounded generation, step by step):**
1. CF anycast → Worker isolate; request-id + timing init.
2. `authMiddleware`: sha256(key) → KV → `AuthContext` (org, scopes, ZDR).
3. `spendCheckMiddleware`: KV spend counter vs `hard_cap_cents`; block if exceeded.
4. `rateLimitMiddleware`: per-key DO token bucket.
5. Route handler resolves `kb` → collection_id (KV-cached; Postgres fallback). Scope check: key allowed this KB.
6. Embed the query via the embeddings proxy (`embedText`, platform OpenRouter key).
7. Hybrid retrieve: one RPC `inference.hybrid_search(collection_id, query_embedding, query_text, k, metadata_filter)` doing pgvector + `tsvector` + RRF (extends `inference.search_vectors`).
8. Rerank top-N: POST to the reranker serverless endpoint (URL from KV), keep top-k.
9. Build grounded prompt with numbered context blocks (reuse `RAGPipeline.formatContext` logic), forward to OpenRouter chat completions (streaming) via the existing gateway path — citations parsed from the model's structured spans.
10. Stream answer to client; `waitUntil` enqueue **two** usage events (retrieval/rerank tokens + LLM tokens) to the `ahura-inference-usage` CF Queue → consumer writes `inference.usage`.
11. `waitUntil` audit event if mutating (not for read; answer is read-only).

**Ingestion flow (async):** dashboard `POST /api/inference/knowledge/{kb}/documents` → upload to R2 → insert `inference.kb_documents` row (`status='queued'`) → `enqueueDataJob(documentId,'ingest')` → data-runner claims → parse (CPU or GPU-OCR) → chunk → embed (proxy) → upsert into `vector_rows` with `content_tsv` populated → mark `status='indexed'`, heartbeat throughout. Watchdog reaps stalled rows.

## 4. Data model

Migration `supabase/migrations/20260616000001_rag_data_platform.sql` (sketch), matching the repo's style: `inference` schema, `IF NOT EXISTS`, RLS via `inference.is_org_member`, `DO $$ ... EXCEPTION WHEN duplicate_object`, GRANT to `authenticated` + `service_role`.

```sql
-- Knowledge Bases — a managed retrieval corpus. One KB ⇒ one vector collection.
CREATE TABLE IF NOT EXISTS inference.knowledge_bases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES inference.orgs(id) ON DELETE CASCADE,
  collection_id   UUID NOT NULL REFERENCES inference.vector_collections(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  embed_model     TEXT NOT NULL DEFAULT 'text-embedding-3-small',
  chunk_strategy  TEXT NOT NULL DEFAULT 'recursive'
                  CHECK (chunk_strategy IN ('recursive','markdown','semantic','fixed')),
  chunk_size      INT  NOT NULL DEFAULT 1024,
  chunk_overlap   INT  NOT NULL DEFAULT 128,
  rerank_model    TEXT,                       -- NULL = no rerank stage
  storage_bytes   BIGINT NOT NULL DEFAULT 0,  -- drives storage billing
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, name)
);

-- Source documents (raw blob in R2; parsed markdown in R2; chunks in vector_rows).
CREATE TABLE IF NOT EXISTS inference.kb_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kb_id           UUID NOT NULL REFERENCES inference.knowledge_bases(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL REFERENCES inference.orgs(id) ON DELETE CASCADE,
  connector_id    UUID REFERENCES inference.connectors(id) ON DELETE SET NULL,
  source_uri      TEXT,                       -- s3://, gdrive://, notion://, https://
  r2_raw_key      TEXT,
  r2_parsed_key   TEXT,
  content_sha256  TEXT,                       -- dedupe + incremental re-sync
  status          TEXT NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued','parsing','chunking','embedding','indexed','failed')),
  error           TEXT,
  chunk_count     INT NOT NULL DEFAULT 0,
  bytes           BIGINT NOT NULL DEFAULT 0,
  heartbeat_at    TIMESTAMPTZ,                -- watchdog reaps stale rows
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kb_documents_claim ON inference.kb_documents (status, created_at);
CREATE INDEX IF NOT EXISTS idx_kb_documents_kb ON inference.kb_documents (kb_id);

-- Connectors (encrypted credentials, like byok_keys).
CREATE TABLE IF NOT EXISTS inference.connectors (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES inference.orgs(id) ON DELETE CASCADE,
  kb_id           UUID NOT NULL REFERENCES inference.knowledge_bases(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL CHECK (kind IN ('s3','gdrive','notion','web_crawl')),
  config          JSONB NOT NULL DEFAULT '{}',     -- bucket/prefix, root url, etc.
  credential_ct   BYTEA,                            -- AES-256-GCM (lib/inference/crypto.ts)
  sync_schedule   TEXT,                             -- cron expr; NULL = manual
  last_synced_at  TIMESTAMPTZ,
  next_sync_at    TIMESTAMPTZ,                       -- connector-scheduler cron reads this
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','syncing','paused','error')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_connectors_due ON inference.connectors (next_sync_at) WHERE status='active';

-- Versioned datasets (FT + evals). Version files content-addressed in R2.
CREATE TABLE IF NOT EXISTS inference.datasets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES inference.orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'sft'
    CHECK (kind IN ('sft','dpo','eval','raw')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, name)
);
CREATE TABLE IF NOT EXISTS inference.dataset_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id UUID NOT NULL REFERENCES inference.datasets(id) ON DELETE CASCADE,
  version INT NOT NULL,
  r2_key TEXT NOT NULL, sha256 TEXT NOT NULL,
  row_count INT NOT NULL DEFAULT 0, bytes BIGINT NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'upload'
    CHECK (source IN ('upload','synthetic','kb_export','eval_result')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(dataset_id, version)
);

-- Eval runs.
CREATE TABLE IF NOT EXISTS inference.eval_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES inference.orgs(id) ON DELETE CASCADE,
  kb_id UUID REFERENCES inference.knowledge_bases(id) ON DELETE SET NULL,
  dataset_version_id UUID NOT NULL REFERENCES inference.dataset_versions(id),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','completed','failed')),
  metrics JSONB,            -- {recall@5, mrr, faithfulness, answer_relevance}
  r2_report_key TEXT, heartbeat_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- BM25 column on the existing vector_rows (additive, hybrid search).
ALTER TABLE inference.vector_rows
  ADD COLUMN IF NOT EXISTS content_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(content,''))) STORED;
CREATE INDEX IF NOT EXISTS idx_vector_rows_tsv ON inference.vector_rows USING GIN (content_tsv);

-- RLS (pattern from every inference table)
ALTER TABLE inference.knowledge_bases ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "members read kbs" ON inference.knowledge_bases
    FOR SELECT USING (inference.is_org_member(org_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "service_role all kbs" ON inference.knowledge_bases
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT SELECT ON inference.knowledge_bases TO authenticated;
GRANT ALL ON inference.knowledge_bases TO service_role;
```

**Billing metering keys (two mechanisms — see §7):**
- **KB storage** → new `billing.active_inference_kb` table (clone of `billing.active_inference_vector` from `20260614000005`), `service_id = knowledge_bases.id`, enrolled in `GRACE_SERVICE_TABLES` (`lib/billing/grace/constants.ts`) → grace + auto-delete for free.
- **Per-operation** (parse pages, embed tokens, rerank docs, OCR pages, grounded-gen tokens, synthetic/eval LLM tokens) → `usage`-event metering via `Billing.deduct` + `Billing.save_transaction` with new `serviceType` values, exactly like `finetune-billing.ts` / `serving-pod-billing.ts`.

## 5. API surface

**Customer `/v1/*` (CF gateway):**

```
POST /v1/parse                      # sync (<=10MB / <=20pp); larger → 202 + job
POST /v1/chunk                      # CPU, sync
POST /v1/rerank                     # Cohere-compatible shape
POST /v1/knowledge/{kb}/search      # hybrid retrieve (+optional rerank)
POST /v1/knowledge/{kb}/answer      # grounded generation w/ citations
POST /v1/knowledge/{kb}/documents   # 202 → ingest job (text body or R2 ref)
```

`POST /v1/rerank`:
```json
// request
{ "model": "rerank-multilingual-v1",
  "query": "how do refunds work?",
  "documents": ["Refunds are issued within 5 days...", "Shipping takes 3 days..."],
  "top_n": 1 }
// response
{ "results": [ { "index": 0, "relevance_score": 0.94 } ],
  "model": "rerank-multilingual-v1",
  "usage": { "total_docs": 2 } }
```

`POST /v1/knowledge/{kb}/answer`:
```json
// request
{ "query": "What is the SLA for the Pro plan?",
  "model": "openai/gpt-4o-mini", "top_k": 6, "rerank": true,
  "filter": { "tenant": "acme" } }
// response
{ "answer": "The Pro plan SLA is 99.9% uptime [1].",
  "citations": [
    { "marker": 1, "document_id": "doc_8f3a", "title": "SLA.pdf",
      "snippet": "Pro plan: 99.9% monthly uptime", "score": 0.91 } ],
  "usage": { "retrieval_docs": 6, "prompt_tokens": 1840, "completion_tokens": 64 } }
```

**Dashboard `/api/inference/*` (control plane):**

```
POST   /api/inference/knowledge                       # create KB
GET    /api/inference/knowledge                        # list
GET    /api/inference/knowledge/{kb}                    # detail + storage_bytes
POST   /api/inference/knowledge/{kb}/documents          # enqueue ingest
GET    /api/inference/knowledge/{kb}/documents          # ingest status
POST   /api/inference/connectors                        # create connector (encrypt cred)
POST   /api/inference/connectors/{id}/sync              # manual sync
POST   /api/inference/datasets                          # create dataset
POST   /api/inference/datasets/{id}/versions            # upload version
POST   /api/inference/datasets/{id}/synthetic           # enqueue synthetic gen
POST   /api/inference/evals                             # enqueue eval run
GET    /api/inference/evals/{id}                        # metrics
# cron-only internal:
POST   /api/inference/internal/connector-scheduler
POST   /api/inference/internal/ingest-watchdog
```

## 6. Code sketches

**(a) Gateway Hono route — `workers/inference/src/routes/rerank.ts`** (matches `chat-completions` style: `c.var.auth`, KV routing lookup, `waitUntil` usage enqueue):
```ts
import type { Context } from "hono";
import type { Env, HonoVariables } from "../types.ts";
import { customerSafeErrorMessage } from "../lib/error-messages.ts";

export async function rerank(c: Context<{ Bindings: Env; Variables: HonoVariables }>) {
  const auth = c.var.auth;
  const body = await c.req.json<{ model: string; query: string; documents: string[]; top_n?: number }>();
  if (!body?.query || !Array.isArray(body.documents) || body.documents.length === 0)
    return c.json({ error: { message: "query and non-empty documents required", type: "invalid_request" } }, 400);
  if (auth.allowedModels && !auth.allowedModels.includes(body.model))
    return c.json({ error: { message: `Model ${body.model} not permitted for this key`, type: "permission" } }, 403);

  // Resolve reranker serverless endpoint from KV (Postgres fallback) — same as serving-pod routing.
  const endpoint = await c.env.MODEL_ROUTE_KV.get(`rerank:${body.model}`);
  if (!endpoint) return c.json({ error: { message: "Unknown rerank model", type: "not_found" } }, 404);

  try {
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${c.env.SERVERLESS_TOKEN}` },
      body: JSON.stringify({ query: body.query, documents: body.documents, top_n: body.top_n ?? body.documents.length }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!upstream.ok) throw new Error(`rerank upstream ${upstream.status}`);
    const out = await upstream.json<{ results: { index: number; relevance_score: number }[] }>();

    c.executionCtx.waitUntil(c.env.USAGE_EVENTS.send({
      kind: "rerank", requestId: c.get("requestId"), orgId: auth.orgId, apiKeyId: auth.apiKeyId,
      model: body.model, units: body.documents.length, at: Date.now(),
    }));
    return c.json({ results: out.results, model: body.model, usage: { total_docs: body.documents.length } });
  } catch (err) {
    console.error(JSON.stringify({ level: "error", requestId: c.get("requestId"), message: String(err) }));
    return c.json({ error: { message: customerSafeErrorMessage(err), type: "upstream_error" } }, 502);
  }
}
```

**(b) data-runner job handler — `workers/data-runner/src/lifecycle.ts`** (mirrors `ft-runner` lifecycle: heartbeat, status transitions, reuse repo chunking):
```ts
import { chunkDocument } from "../../../lib/ai/chunking.js"; // shared splitter
import type { RunnerCtx } from "./types.js";

export interface DataJob { documentId: string; kind: "ingest" | "sync" | "synthetic" | "eval"; }

export async function runIngest(ctx: RunnerCtx, doc: DataJob): Promise<void> {
  const { supabase, log } = ctx;
  const beat = setInterval(() => void ctx.heartbeats.touch("kb_documents", doc.documentId), 10_000);
  try {
    await setStatus(ctx, doc.documentId, "parsing");
    const row = await loadDoc(ctx, doc.documentId);        // r2_raw_key, kb config
    const text = await parseDocument(ctx, row);            // CPU libs; GPU-OCR for scanned PDFs
    await setStatus(ctx, doc.documentId, "chunking");
    const chunks = chunkDocument(text, row.content_type, { chunkSize: row.chunk_size, chunkOverlap: row.chunk_overlap });
    await setStatus(ctx, doc.documentId, "embedding");
    const embedded = await embedBatch(ctx, chunks.map(c => c.content), row.embed_model); // OpenRouter proxy
    // Upsert via existing collection RPC; content_tsv is a generated column.
    const { error } = await supabase.schema("inference").from("vector_rows").insert(
      embedded.map((e, i) => ({ collection_id: row.collection_id, external_id: `${doc.documentId}:${i}`,
        content: chunks[i].content, embedding: e.embedding,
        metadata: { document_id: doc.documentId, chunk_index: i, source: row.source_uri } })));
    if (error) throw new Error(`vector upsert: ${error.message}`);
    await meterIngest(ctx, row, embedded);                 // §7 usage-event billing
    await supabase.schema("inference").from("kb_documents")
      .update({ status: "indexed", chunk_count: chunks.length }).eq("id", doc.documentId);
    log.info({ documentId: doc.documentId, chunks: chunks.length }, "ingest complete");
  } catch (err) {
    await setStatus(ctx, doc.documentId, "failed", String(err));
    throw err; // BullMQ records failure; watchdog won't double-process (status='failed')
  } finally { clearInterval(beat); }
}
```

**(c) Billing integration — `lib/inference/rag-billing.ts`** (clones `finetune-billing.ts` usage-event shape):
```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { Billing } from "@/lib/supabase/queries/billing";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceClient = SupabaseClient<any, any, any>;

const RATES = { parse_page: 0.30, ocr_page: 1.0, embed_1k_tok: 0.02, synth_1k_tok: 0.20 } as const; // cents

export async function meterIngestUsage(
  supabase: ServiceClient, orgId: string, kbId: string,
  pages: number, ocrPages: number, embedTokens: number,
): Promise<void> {
  const cents = Math.ceil(pages * RATES.parse_page + ocrPages * RATES.ocr_page
    + (embedTokens / 1000) * RATES.embed_1k_tok);
  if (cents <= 0) return;
  const usd = cents / 100;
  try {
    const { data: org } = await supabase.schema("inference").from("orgs")
      .select("billing_user_id, owner_user_id").eq("id", orgId).maybeSingle();
    const payer = org?.billing_user_id || org?.owner_user_id;
    if (!payer) { console.error(`[rag charge] no payer for org ${orgId}`); return; }
    const balanceAfter = await Billing.deduct(payer, usd);
    await Billing.save_transaction({
      userId: payer, amount: usd, status: "completed", type: "usage",
      balanceAfter: typeof balanceAfter === "number" ? balanceAfter : null,
      serviceId: kbId, serviceType: "inference_rag_ingest",
      description: "Knowledge base ingestion",
      metadata: { pages, ocr_pages: ocrPages, embed_tokens: embedTokens },
    });
  } catch (e) {
    console.error(`[rag charge] failed org ${orgId} kb ${kbId}:`, e instanceof Error ? e.message : e);
  }
}
```

## 7. Billing

Two enrollment mechanisms, both already proven in the codebase:

**A. Storage (continuous resource) → `billing.active_*` + the 5-min platform cron.** A KB's vector + blob storage is a billable resource like a vector collection. New table `billing.active_inference_kb` (exact clone of `20260614000005_inference_vector_billing.sql`), `service_id = knowledge_bases.id`, `hourly_rate = monthly_gb_rate × storage_gb / 720`. Add `"active_inference_kb"` to `GRACE_SERVICE_TABLES` (`lib/billing/grace/constants.ts`) so it gets proration + 7-day grace → auto-delete from `bill_service_cycle_atomic` with zero new cron code. On ingest completion the runner updates `knowledge_bases.storage_bytes` and upserts the active row's `hourly_rate`. Pricing: **$0.30 / GB-month** stored.

**B. Per-operation (event) → `Billing.deduct` + `Billing.save_transaction`.** Mirrors `finetune-billing.ts`. New `serviceType`s (add to the allowlist migration like `20260615000012_extend_transactions_service_type_allowlist`): `inference_rag_ingest`, `inference_rerank`, `inference_grounded`, `inference_parse`, `inference_synthetic`, `inference_eval`. Pricing:

| Operation | Unit | Price (illustrative, nonzero margin per gap #7) |
|---|---|---|
| Parse (text) | per page | $0.003 |
| OCR (scanned) | per page | $0.01 (covers GPU-second cost + margin) |
| Embeddings | per 1M tokens | upstream cost + markup |
| Rerank | per 1K docs | $2.00 (covers reranker GPU-second on substrate) |
| Grounded generation | LLM tokens (gateway) + retrieval flat | gateway token price + $0.001/query retrieval |
| Synthetic data | per 1M output tokens | gateway token price + 20% |
| Eval run | judge tokens + flat run fee | gateway tokens + $0.50/run |

GPU-backed ops (rerank, OCR) on RunPod-now / own-fleet-later: the per-unit price is set from amortized GPU-second cost (the same costing model `serving-pod-billing.ts` uses for hourly pods), so margin holds whether the unit runs on rented or owned GPUs.

**Spend-cap interaction.** Hot-path ops (`/v1/rerank`, `/answer`, `/search`) pass `spendCheckMiddleware` *before* execution — KV counter vs `hard_cap_cents`, identical to chat completions. Async ops (ingest, synthetic, eval) check balance **at submit time** in the control-plane route (the "Slice 1 pre-flight balance+quota guard" pattern already shipped per memory `project_inference_billing_gaps`) so a job with no funds never enqueues. Usage events feed the same per-key monthly budget counters, so RAG spend counts against existing org/key caps with no new cap machinery.

## 8. Delivery plan

Slices are independently shippable. Estimates in eng-weeks (1 backend eng).

- **Slice 1 — Reranking (3 wk).** Build/register a reranker image on the existing serverless deploy substrate (`lib/inference/deploy-runpod.ts`); add `/v1/rerank` gateway route + KV routing + usage metering. *Lowest-risk, highest table-stakes win (gap #3); no new deployable.* Depends on nothing.
- **Slice 2 — Hybrid search + grounded answer (3 wk).** `content_tsv` column + `inference.hybrid_search` RPC (RRF); `/v1/knowledge/{kb}/search` and `/answer` on the gateway composing existing embeddings proxy + chat completions + Slice 1 rerank. Depends on Slice 1.
- **Slice 3 — data-runner + KB ingestion (4 wk).** Scaffold `workers/data-runner` (copy `ft-runner` skeleton: claimer, BullMQ, heartbeat, health). `knowledge_bases`/`kb_documents` tables, ingest job (parse→chunk→embed→index reusing `lib/ai/*`), dashboard CRUD + upload, ingest-watchdog cron, storage billing (`active_inference_kb`). *This is the cluster's spine.*
- **Slice 4 — Document parsing / OCR (3 wk).** `/v1/parse` sync route for text formats; GPU-OCR model on substrate for scanned PDFs; per-page metering. Depends on Slice 3 (shares parse libs).
- **Slice 5 — Connectors (3 wk).** `connectors` table + encrypted creds, S3 + web-crawl first (Drive/Notion need OAuth app review — start that now, ship later), connector-scheduler cron, incremental re-sync via `content_sha256`. Depends on Slice 3.
- **Slice 6 — Datasets + synthetic (3 wk).** `datasets`/`dataset_versions` (R2 content-addressed), upload + KB-export + synthetic-gen job. Wires into FT (`inference.finetunes`). *Cross-cluster dependency: coordinate with the FT/DPO cluster so dataset versions are consumable by training.*
- **Slice 7 — RAG evals (3 wk).** `eval_runs`, retrieval metrics (deterministic) + LLM-judge faithfulness/relevance over a dataset version. Depends on Slices 2, 6. *Proof point that sells FT.*

**Cross-cluster dependencies:** (1) the **Compliance/enterprise** cluster (gap #5) gates connector data-residency promises and ZDR semantics for ingested docs; (2) the **Billing-completeness** cluster (gap #7) must land the nonzero-markup `serviceType` plumbing — RAG billing assumes it. (3) gap #11 multi-LoRA shared serving is *not* a dependency.

**Cut for v1:** semantic chunking (ship recursive + markdown only — already in `lib/ai/chunking.ts`); Drive/Notion connectors (OAuth review lead time — S3 + web-crawl cover most demand); LLM-judge evals (ship deterministic recall/MRR first); the pgvector→dedicated-vector-DB migration (defer until scale forces it, see §9).

## 9. Risks & open questions

1. **pgvector scale ceiling.** The single Supabase Postgres holds control plane + usage + audit + all vectors. KB-as-API could push vector row count to hundreds of millions, where pgvector HNSW build/recall and the shared DB's IOPS become the bottleneck — and it competes with the hourly billing cron for connections. **Upgrade path:** (a) keep pgvector but move `vector_rows` to a dedicated Postgres read replica / separate instance; (b) at the next tier, introduce a purpose-built vector engine (Qdrant/LanceDB self-hosted on k8s, or Turbopuffer as a brand-hideable upstream) behind the *same* `inference.hybrid_search` RPC contract so the gateway/runner don't change. **Open:** at what KB-row count do we trigger (b)? Propose 50M rows or p95 search latency > 300ms.

2. **Embedding-model lock-in.** A KB's vectors are tied to its `embed_model`. Switching models requires a full re-embed (expensive, customer-visible). **Open:** do we offer (and how do we price) a "reindex" operation? Lean toward charging it at ingest rates with a clear dashboard warning.

3. **OCR quality + cost variance.** Scanned-PDF OCR on GPU is the priciest per-page op and the most variable in accuracy. Risk of underpricing if customers dump huge scanned archives. **Mitigation:** per-page metering (not per-doc), a per-KB page-count guard at submit, and the same out-of-stock-style admin kill switch (`platform_settings`, `20260615000015`) for the OCR model if costs spike.

4. **Connector credential blast radius.** Storing customer Drive/Notion/S3 OAuth tokens (even AES-256-GCM at rest) is a high-value target and a compliance surface. **Mitigation:** reuse `byok_keys` encryption discipline + KMS-rotated DEK; scope tokens read-only; never log decrypted creds. **Open:** do we need a separate KMS key per connector kind?

5. **Brand-scrub on parse/connector errors.** New write paths (parser failures, connector sync errors, OCR upstream errors) are fresh leak vectors for upstream/provider names — exactly the discipline in memory `feedback_brand_scrub_discipline`. **Mitigation:** every customer-facing error in this cluster must route through `customerSafeErrorMessage()`; audit the new routes as a checklist item per slice.

6. **Grounded-generation citation fidelity.** Models hallucinate citation markers. **Open:** enforce citations by post-validating each marker resolves to a retrieved chunk and stripping/penalizing unresolved markers — adds a verification pass. Worth it for enterprise trust; costs latency.

7. **Synthetic data IP/licensing + cost runaway.** Generating millions of synthetic rows is unbounded LLM spend and raises model-output licensing questions for downstream FT. **Mitigation:** hard row/token cap per job, balance pre-flight at submit, and a ToS note. **Open:** which base models are license-clean for synthetic-data-then-train pipelines (relevant to the own-fleet DPR story)?

8. **data-runner single-replica throughput.** Like `ft-runner`, v1 is one replica with in-process concurrency. A big connector sync (100k docs) could starve interactive ingests. **Mitigation:** separate BullMQ priorities for interactive vs bulk; shard to multiple replicas (Postgres claim is already concurrency-safe) when we hit the ceiling — same trajectory noted in `ft-runner/src/index.ts`.