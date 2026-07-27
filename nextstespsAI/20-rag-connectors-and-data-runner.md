# RAG Connectors + `data-runner` — Design & Build Plan

**Date:** 2026-07-21 · **Companion to:** [04-rag-data-platform.md](04-rag-data-platform.md) (Slices 3 & 5 of the parent design) · [19-rag-hybrid-search-and-answer.md](19-rag-hybrid-search-and-answer.md) (the retrieval half, already shipped) · **Status:** Built (C0–C4 + review fixes + OCR fallback). Live-verified end to end; see [§11b](#11b-completion--test-status-as-built) for what is and isn't tested. Not yet deployed.

---

## 1. What this is, in one paragraph

Today a customer can only fill a knowledge base (a vector collection) by manually uploading files or pasting a URL, one at a time, through the dashboard. There is no way to say "point at my S3 bucket / this docs site and keep the KB current automatically." That manual-only limitation is the single biggest reason a KB feels like a demo instead of a product — in practice the KB goes stale within days and the (now working) hybrid-search + grounded-answer feature answers from outdated content. This slice adds **connectors** (a saved, credentialed link to where a customer's documents actually live) and **`data-runner`** (a background worker that periodically syncs those sources — fetch → extract → chunk → embed → upsert, incrementally). It is the piece that turns the retrieval work already shipped in doc 19 into something customers adopt and keep using.

**Why now / why this one:** it is the highest-demand, GPU-free item left in the whole roadmap. Every internal-docs use case (support bots, internal Q&A, policy search) wants automatic sync. The hard, differentiating half — hybrid search + rerank + grounded answer — is already done ([19](19-rag-hybrid-search-and-answer.md)); connectors is what makes it usable at production scale. No new GPU capacity is required: extraction/chunking is CPU work, embeddings proxy through the existing `/v1/embeddings` gateway exactly as the synchronous ingest path already does.

---

## 2. Scope decision (locked lean, grounded in real constraints)

**In v1 — two source types that need no third-party OAuth app review:**

| Source | Auth model | Why first |
|---|---|---|
| **S3 / S3-compatible** (AWS S3, R2, MinIO, Backblaze, Wasabi…) | Customer pastes an access-key-id + secret (+ endpoint/region/prefix), encrypted at rest like a BYOK key | `@aws-sdk/client-s3` is **already a dependency** (`package.json`), and `lib/aws/s3-client.ts` already wraps it. Zero new upstream, zero approval lead time, covers the largest single "where our docs live" answer for technical customers. |
| **Web crawl** (a seed URL + same-origin BFS to a depth/page cap) | None (public pages) | The SSRF-pinned fetch + HTML→paragraph extraction **already exists** (`lib/inference/url-ingest.ts`), production-hardened against DNS-rebinding. Crawl = that fetcher in a bounded same-origin loop. |

**Deferred, with the honest reason (not oversight):**

- **Google Drive / Notion** — both require registering an OAuth *application* with Google/Notion and passing their review (days-to-weeks of lead time, and Google's sensitive-scope verification for Drive). The connector *table* and the runner's per-source handler interface are designed so these slot in later as one more `kind` with an OAuth credential shape, reusing the exact OAuth-consent machinery **already built for MCP servers** (`lib/mcp/oauth-state.ts`, the `/oauth/authorize`+`/callback` dashboard routes, `encryptMcpToken`/`resolveOAuthToken` refresh — see [14](14-agent-mcp-implementation.md) M6). Start the app-registration paperwork in parallel; ship S3+crawl without waiting on it.
- Everything else in doc 04 (versioned datasets, synthetic data, RAG-specific evals) — separate slices, out of scope here.

**Not built speculatively:** connector sharing/marketplace, per-connector KMS keys, sub-file diffing (we re-ingest a *changed* document whole, not its changed paragraphs — simpler and correct; sub-doc diffing is a later optimization).

---

## 3. How a customer uses it — two personas, both first-class

This is a **"Knowledge Bases as API"** product (doc 04's headline). A connector that can only be created by clicking a dashboard is half-built — a customer's *backend* can't click. So connector management is **API-first**: a full `/v1/*` surface (the developer path) with the dashboard as a thin client over the same contract (the non-developer path). Both ship in v1. This mirrors exactly how `vector_collections` and `mcp_servers` already work — an API-key gateway route **and** a session-authed dashboard route over one set of queries.

### 3.1 The API developer (the primary consumer)

Priya's backend team wires their S3 bucket to a KB once, from their own service, and never touches a dashboard:

```jsonc
// 1. Create the connector (API key auth — same key they already use for /v1/chat)
POST /v1/vector/collections/{collection_id}/connectors
{ "kind": "s3", "display_name": "prod-docs",
  "config": { "bucket": "acme-docs", "region": "us-east-1", "prefix": "handbook/" },
  "credential": { "access_key_id": "AKIA…", "secret_access_key": "…" },   // encrypted at rest, never returned
  "sync_schedule": "daily" }
// → 201 { "id": "conn_…", "status": "idle", "has_credential": true, "next_sync_at": "…" }

// 2. Kick a sync now (don't wait on it — returns immediately)
POST /v1/connectors/{id}/sync
// → 202 { "sync_run_id": "…", "status": "queued" }

// 3. Poll status (or receive a webhook — §7) until it settles
GET /v1/connectors/{id}
// → { "id": "conn_…", "status": "syncing",           // idle | queued | syncing | error
//     "last_synced_at": null, "next_sync_at": "…",
//     "last_sync": { "docs_total": 812, "docs_added": 40, "docs_updated": 3,
//                    "docs_removed": 1, "docs_failed": 0 } }

// 4. That's it — the KB now answers from the synced docs. Their support bot's
//    existing POST /v1/vector/collections/{id}/answer call (doc 19) just works.
```

The developer's whole mental model: *register a source once → it stays current → my `/answer` calls reflect it.* No polling loop required if they set a webhook; no dashboard ever.

### 3.2 The dashboard user (the non-developer path)

Priya herself, or a non-technical teammate, does the same thing by clicking — the dashboard calls the identical contract:

1. KB detail page → **Connectors** tab → **Add connector** → pick **S3** or **Web crawl**.
2. **S3:** bucket, region/endpoint, optional prefix, access-key-id + secret. **Crawl:** seed URL, max-pages, max-depth.
3. Pick a schedule (manual / hourly / daily), or click **Sync now**.
4. Watch a live status row (spinner while `syncing`, then added/updated/removed counts, per-doc errors in a drill-in) — the KB stays current with zero further action.

Neither persona ever *waits* on a sync: the create/sync call returns in milliseconds after writing "this connector is due"; `data-runner` does the minutes-long work out of band, exactly like fine-tune / eval jobs. Both personas observe the same `status`/counters, whether via `GET /v1/connectors/{id}`, a webhook, or the dashboard polling that same endpoint.

---

## 4. Architecture

### 4.1 Deployable mapping (mirrors the existing 4 + one new runner)

- **CF Worker gateway** (`workers/inference/src/routes/connectors.ts`, NEW) — the **API-first surface**: API-key-authed connector CRUD + `sync` + status, mirroring the existing `routes/mcp-servers.ts` / `routes/vector-collections.ts` management routes (from `f81e9cb8`) *line-for-line* — Zod → org-scope → `encryptAesGcm(credential, BYOK_DEK)` → store ciphertext → **mask on every read**. "Sync now" just flips `status='queued'` + `next_sync_at=now()` and returns `202`; it never does work inline (Workers can't run a minutes-long sync). Plus the same two lines added to the `scheduled()` cron ladder (`workers/inference/src/index.ts:353`) for the internal sweeps. The runner reaches embeddings via the *existing* `/v1/embeddings` (platform key + `X-Ahura-On-Behalf-Of-Org`, exactly as agent-runner does for on-behalf-of billing — see [11 §9](11-agent-implementation-plan.md)).
- **Next.js control plane** (`app/api/inference/connectors/*`, NEW) — the **session-authed twin** of the gateway routes (the dashboard's path), over the *same* `AgentcoreConnectors`-style query module, plus the **two cron-only internal sweeps** (`X-Ahura-Internal-Token`, like `serving-pod-watchdog`): `connector-scheduler` (enqueue connectors whose `next_sync_at` passed) and `ingest-watchdog` (reap syncs whose runner died). One creation contract, two auth front-doors — never two drifting code paths (the exact discipline the access-keys work established, [15 §7](15-agent-access-keys.md)).
- **NEW k8s runner: `workers/data-runner`** — a `bootRunner()` instantiation of **`@ahura/runner-core`**, cloned from `workers/eval-runner` almost file-for-file (closest sibling: no GPU, only HTTP calls to our own gateway for embeddings). Same shape: `index.ts` / `scan.ts` / `lifecycle.ts` / `env.ts` / `supabase.ts` / `logger.ts` + `Dockerfile` + `k8s/deployment.yaml` + vendored `ingest/` helpers. It owns the long jobs: connector sync (list → extract → chunk → embed → upsert → reconcile deletions).
- **State:** connector metadata + per-document sync tracking in Postgres (`inference` schema); encrypted credentials in a `bytea` column (same as `byok_keys` / `mcp_servers.auth_token_enc`); embeddings/rows in the existing `vector_rows`; job queue on the existing Redis/BullMQ. **No R2 needed for v1** — text is extracted in-flight, the raw source blob never persisted (a later slice can stage raw docs in R2 for re-chunk-without-re-fetch; not required to ship).
- **State:** connector metadata + per-document sync tracking in Postgres (`inference` schema); encrypted credentials in a `bytea` column (same as `byok_keys` / `mcp_servers.auth_token_enc`); embeddings/rows in the existing `vector_rows`; job queue on the existing Redis/BullMQ. **No R2 needed for v1** — we extract text in-flight and never persist the raw source blob (a later slice can stage raw docs in R2 if we want re-chunk-without-re-fetch, but it is not required to ship).

### 4.2 The one correction to doc 04's sketch (verified against the real repo)

Doc 04's runner sketch writes `import { chunkDocument } from "../../../lib/ai/chunking.js"`. **That does not work here.** Verified: every existing runner (`eval-runner`, `ft-runner`, `agent-runner`) has `rootDir: ./src` + `include: ["src/**/*"]` and depends only on `@ahura/runner-core` (+ supabase/bullmq/ioredis/pino) — **none imports from the root `lib/`.** The root `tsconfig` also excludes `workers/`. So `data-runner` **vendors its own small, self-contained copies** of the three pure helpers it needs, inside `workers/data-runner/src/ingest/`:
- `extract.ts` — ported from `lib/inference/doc-ingest.ts` (PDF via `pdfjs-dist`, DOCX via `mammoth`, txt/md passthrough) + the OCR fallback hook.
- `chunk.ts` — the paragraph/recursive chunker (ported from `lib/inference/doc-ingest.ts`'s `chunkPlainText` + optionally `lib/ai/chunking.ts`'s recursive splitter).
- `fetch.ts` — the SSRF-pinned fetcher + HTML→paragraph extractor, ported **verbatim** from `lib/inference/url-ingest.ts` (this is the one where copying exactly matters — the DNS-rebinding pin is security-load-bearing).

This is the same discipline agent-runner already followed (it vendored `ssrf.ts` and ported `reRankChunks` into `file-search.ts` rather than cross-importing). Small duplication, zero coupling, each side independently testable — the established repo pattern, not a compromise. (If the duplication ever grows painful, the clean fix is a `@ahura/doc-ingest` leaf package like `runner-core` — but that's premature for three small files.)

### 4.3 Scalability & concurrency (designed for 10k-object buckets, many orgs)

A naïve "one connector at a time, one chunk at a time" runner does not scale — a single large bucket would block every other org's sync, and embedding 10,000 chunks sequentially would take hours. The design is scalable on **three independent axes**, each using a knob that already exists in `runner-core`:

| Axis | Mechanism | Why it's safe |
|---|---|---|
| **Many connectors in parallel** | `scan()` returns up to `MAX_CONCURRENT_JOBS` queued connectors; `bootRunner` runs that many syncs concurrently in one process (BullMQ `concurrency`). **Per-org fairness:** `scan` prefers connectors whose org has no in-flight sync (a `NOT EXISTS` guard on `status='syncing'` for the same org), so one org's giant bucket can't monopolize all slots. | The atomic `UPDATE … WHERE status='queued'` claim means two concurrent syncs (or two replicas) never grab the same connector. Add replicas → linear scale, claim stays correct — the runner-core guarantee. |
| **Many documents per sync** | The source is **streamed, not buffered**: `list()` is an async generator over `ListObjectsV2` pages / crawl-BFS frontier, so memory is O(page), not O(bucket). Documents flow through a **bounded worker pool** (e.g. `FETCH_CONCURRENCY=8`) — fetch+extract+embed several docs at once, but capped so we never open 10k sockets or flood the embed gateway. | Backpressure is the pool size; a slow doc can't stall the others; the per-doc try/catch means one failure is isolated (§6 step 3). |
| **Many chunks per document** | Embeddings are **batched**, not per-chunk: `/v1/embeddings` takes an input *array* (OpenAI-compatible), so we embed up to `EMBED_BATCH=96` chunks per HTTP call instead of one call per chunk — ~50–100× fewer round-trips and far friendlier to the gateway's rate limiter. | Batch size is bounded by the embed model's max-input limit; a partial batch failure retries the batch, not the whole doc. |

**Long-sync safety:** a multi-hour sync must outlive BullMQ's job lock. `heartbeats.touch("connectors", id)` is called every document (updating `heartbeat_at`), and `jobLockDurationMs` (a `runner-core` env knob) is set generously; the `ingest-watchdog` only reaps a sync whose heartbeat is *actually* stale (runner died), never a slow-but-alive one — the identical pattern that keeps long fine-tune/eval jobs from being falsely reaped. **Cost/DoS bound:** a per-sync `max_documents` cap + the existing `checkVectorQuota` gate (`lib/inference/vector-quota.ts`) stop a runaway bucket before it embeds unboundedly; the etag/hash skip (§6) means steady-state re-syncs of an unchanged corpus cost ~zero (list-and-compare only, no embed). **Horizontal:** nothing in a sync is stateful beyond its own run, so `data-runner` scales by replicas exactly like every other runner — start single-replica, add replicas when sync throughput demands it, no code change.

---

## 5. Data model

Migration `supabase/migrations/2026XXXX_rag_connectors.sql` (write SQL, **stop — the user applies migrations**; per repo policy). Style matches the repo exactly: `inference` schema, `IF NOT EXISTS`, RLS via `inference.is_org_member`, `DO $$ … EXCEPTION WHEN duplicate_object`, `GRANT SELECT authenticated / ALL service_role`, shared `set_updated_at` trigger.

```sql
-- ── Connectors: a saved, credentialed link from a KB to a source ───────────
CREATE TABLE IF NOT EXISTS inference.connectors (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES inference.orgs(id) ON DELETE CASCADE,
  collection_id   UUID NOT NULL REFERENCES inference.vector_collections(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL CHECK (kind IN ('s3','web_crawl')),   -- extend: 'gdrive','notion'
  display_name    TEXT NOT NULL,
  config          JSONB NOT NULL DEFAULT '{}',   -- non-secret: bucket/prefix/endpoint/region, seed_url/max_pages/max_depth, max_documents
  credential_enc  BYTEA,                          -- AES-256-GCM (lib/inference/crypto.ts); NULL for web_crawl
  webhook_url     TEXT,                            -- optional; POST a signed sync.completed/failed event on settle
  sync_schedule   TEXT NOT NULL DEFAULT 'manual'
                  CHECK (sync_schedule IN ('manual','hourly','daily')),
  status          TEXT NOT NULL DEFAULT 'idle'
                  CHECK (status IN ('idle','queued','syncing','error','disabled')),
  last_error      TEXT,
  last_synced_at  TIMESTAMPTZ,
  next_sync_at    TIMESTAMPTZ,                     -- scheduler enqueues when now() >= this
  claimed_by      TEXT,                            -- runner pod id
  heartbeat_at    TIMESTAMPTZ,                     -- watchdog reaps a stuck sync
  -- rollup counters from the last completed sync (for the dashboard)
  docs_total      INT NOT NULL DEFAULT 0,
  docs_added      INT NOT NULL DEFAULT 0,
  docs_updated    INT NOT NULL DEFAULT 0,
  docs_removed    INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(collection_id, display_name)
);
CREATE INDEX IF NOT EXISTS idx_connectors_due
  ON inference.connectors (next_sync_at)
  WHERE status IN ('idle','error') AND sync_schedule <> 'manual';
CREATE INDEX IF NOT EXISTS idx_connectors_claim
  ON inference.connectors (status) WHERE status = 'queued';

-- ── Per-document sync tracking: the incremental-sync ledger ────────────────
-- One row per source document ever seen, per connector. content_sha256 is the
-- change-detection key; row_external_ids ties a source doc to the vector_rows
-- it produced, so a deletion/tombstone can remove exactly those rows.
CREATE TABLE IF NOT EXISTS inference.connector_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id    UUID NOT NULL REFERENCES inference.connectors(id) ON DELETE CASCADE,
  collection_id   UUID NOT NULL REFERENCES inference.vector_collections(id) ON DELETE CASCADE,
  source_uri      TEXT NOT NULL,                   -- s3://bucket/key, https://site/page
  content_sha256  TEXT,                            -- of the extracted text; NULL until first ingest
  source_etag     TEXT,                            -- S3 ETag / HTTP ETag, a cheap pre-hash skip
  row_external_ids TEXT[] NOT NULL DEFAULT '{}',   -- the vector_rows.external_id this doc owns
  chunk_count     INT NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','indexed','failed','removed')),
  error           TEXT,
  last_seen_sync  UUID,                            -- the sync run id that last saw this doc (for tombstone)
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(connector_id, source_uri)
);
CREATE INDEX IF NOT EXISTS idx_connector_docs_conn ON inference.connector_documents (connector_id);

-- RLS: members read own org's connectors + docs (via the collection's org);
-- service_role ALL. (Full policy blocks omitted here — identical shape to
-- inference.mcp_servers / vector_collections.)
```

**Credential storage:** the S3 secret is `encryptAesGcm(JSON.stringify({accessKeyId, secretAccessKey}), BYOK_DEK)` → `bytea`, **masked on every read** (the CRUD route returns `has_credential: true`, never the ciphertext or plaintext — the same discipline `byok-keys` and `mcp-servers` routes use). `web_crawl` connectors have `credential_enc = NULL`.

**Why a separate `connector_documents` table (not just reuse `vector_rows`):** change-detection and deletion need a per-*document* record (hash, etag, which rows it owns), and one source document fans out to many `vector_rows` (one per chunk). Storing the hash on the rows themselves would duplicate it N times and give no clean "this whole doc is gone → remove its N rows" operation. This mirrors doc 04's `kb_documents` concept, scoped to what incremental sync actually needs.

---

## 6. The incremental-sync algorithm (the technical heart)

Grounded in the current best practice (content-hash + ETag skip, tombstone deletion — confirmed against RagFlow's S3 connector, Unstructured's continuous-ingestion guidance, and Pinecone/Bedrock's S3 sync model; sources at the end). One sync run, per connector:

1. **Mint a `sync_run_id`** (uuid, in-memory) and set `connectors.status='syncing'`, stamp `heartbeat_at`.
2. **List the source.** S3 → `ListObjectsV2` (paginated, honoring `prefix`), each object yields `{source_uri, etag}`. Web-crawl → BFS from `seed_url`, same-origin only, up to `max_pages`/`max_depth`, each page is a `source_uri` (etag from the HTTP `ETag` header if present).
3. **Per source document, decide skip / (re)ingest:**
   - Look up `connector_documents` by `(connector_id, source_uri)`.
   - **Cheap skip:** if the row exists, `status='indexed'`, and `source_etag` matches the listed etag → mark `last_seen_sync = sync_run_id`, **skip** (no fetch, no embed). This is the free path that keeps a 10k-doc bucket cheap when nothing changed.
   - Otherwise **fetch + extract** the text, compute `content_sha256`. If the row exists and the hash is unchanged (etag was absent/unreliable but content is identical) → update etag, mark seen, **skip embed**.
   - Else it's **new or changed**: chunk → **batch-embed** the chunks via `/v1/embeddings` (array input, `EMBED_BATCH` chunks per call — §4.3) → **upsert** into `vector_rows` (`external_id = "conn-{connectorId}-{docHash}-{chunkIdx}"`, `metadata: {connector_id, source_uri, doc_id, chunk_index}`). On a *changed* doc, first delete the doc's previous `row_external_ids` that are no longer produced (fewer chunks than before), then upsert the new set. Update `connector_documents` with the new hash/etag/row_external_ids/chunk_count, `status='indexed'`, `last_seen_sync = sync_run_id`.
   - Documents flow through a **bounded pool** (`FETCH_CONCURRENCY`, §4.3), not strictly one-at-a-time — but each doc's own steps are sequential and its failure is isolated: per-doc failures are recorded on that `connector_documents` row (`status='failed'`, `error=…`) and **do not abort the whole sync** — one bad PDF never blocks the other 9,999 docs.
4. **Tombstone deletion (reconcile):** after listing is exhausted, any `connector_documents` row for this connector with `status='indexed'` and `last_seen_sync <> sync_run_id` was *not seen this run* → the source deleted it. Delete its `row_external_ids` from `vector_rows`, set the doc row `status='removed'`. This is what keeps a KB from serving content the customer already deleted at the source (the "right to be forgotten" / stale-content problem the research flags as the #1 sync correctness bug).
5. **Settle:** update the connector rollup counters (`docs_added/updated/removed/total`), `status='idle'`, `last_synced_at=now()`, compute `next_sync_at` from the schedule, clear `claimed_by`/`heartbeat_at`. If `webhook_url` is set, POST the signed `connector.sync.completed` event (§7). On a fatal listing error (bad creds, bucket gone), `status='error'` + `last_error` (customer-safe), POST `connector.sync.failed`, and `next_sync_at` is pushed out with backoff.

**Idempotency & crash safety:** the atomic claim is the same `UPDATE … WHERE status='queued'` pattern every runner uses (only one runner wins a connector). If the runner dies mid-sync, `heartbeat_at` goes stale → the `ingest-watchdog` cron flips it back to `idle`/`error` after the threshold, and the next scheduled run re-lists — because every step is upsert-by-`source_uri` and hash-keyed, a re-run is naturally idempotent (already-ingested unchanged docs skip on etag/hash; the interrupted doc just gets finished). No partial-state corruption.

---

## 7. API surface

Connector management is **API-first** — the customer `/v1/*` gateway routes are the primary contract (v1, not deferred), and the dashboard's session-authed `/api/*` routes are a thin twin over the same query module. This is the exact two-front-door / one-contract shape `vector_collections` and `mcp_servers` already ship.

**Customer gateway (`/v1/*`, API-key auth — the developer path).** Inherits the existing edge chain (`auth → spend → rate-limit`) unchanged:

```
POST   /v1/vector/collections/{id}/connectors     create a connector on this KB
GET    /v1/vector/collections/{id}/connectors     list its connectors (credentials masked)
GET    /v1/connectors/{id}                         status + last-sync counters
PATCH  /v1/connectors/{id}                          edit config/schedule/credential (blank cred = keep)
DELETE /v1/connectors/{id}                          remove connector (?purge=true also deletes its rows)
POST   /v1/connectors/{id}/sync                     trigger a sync → 202 { sync_run_id, status:"queued" }
GET    /v1/connectors/{id}/documents                per-document sync status (paginated)
```

Request/response shapes are in §3.1. Every read **masks credentials** (`has_credential:true`, never ciphertext/plaintext). `GET /v1/connectors/{id}` is the one status endpoint both the developer's poll loop and the dashboard read.

**Sync-lifecycle webhooks (the developer's alternative to polling).** A connector can carry a `webhook_url` and an optional `webhook_secret` (16+ chars, AES-GCM encrypted at rest in `webhook_secret_enc`, masked to `has_webhook_secret` on read). On sync settle, `data-runner` POSTs the event; with a secret set it is signed exactly like the agent function-tool webhook — `sha256(secret, "{unix_ts}.{body}")` as `X-Ahura-Signature: sha256=<hex>` plus `X-Ahura-Timestamp`, so a captured request can't be replayed once the receiver rejects stale timestamps. **Fails closed:** if a secret is configured but can't be decrypted, the webhook is *not* sent (a silent downgrade to unsigned is indistinguishable from a forgery to a receiver that only checks the header "if present"); the outcome is still readable from `GET /v1/connectors/{id}`.

```jsonc
// POST {webhook_url}   X-Ahura-Signature: sha256=…
{ "event": "connector.sync.completed",             // or connector.sync.failed
  "connector_id": "conn_…", "collection_id": "…", "sync_run_id": "…",
  "docs_added": 40, "docs_updated": 3, "docs_removed": 1, "docs_failed": 0,
  "occurred_at": "…" }
```

So a backend never has to poll: register the connector with a `webhook_url`, get pinged when each sync finishes.

**Dashboard control plane (`/api/inference/connectors/*`, session-authed — the non-developer path):** the same seven operations, `authenticateUserFromHeader` + `canWrite`, over the **same** `Connectors` query module the gateway uses (one creation path, never two that drift — the access-keys discipline, [15 §7](15-agent-access-keys.md)). Plus the two cron-only internal sweeps:

```
POST /api/inference/internal/connector-scheduler   enqueue due connectors (next_sync_at passed)
POST /api/inference/internal/ingest-watchdog        reap stuck syncs (stale heartbeat)
```

**Dashboard UI:** a **Connectors** tab on the vector-collection detail page (`components/dashboard/inference/vector-detail.tsx`), mirroring `mcp-servers/page.tsx` 1:1 — a `DataTable` with status dot + last-synced + added/updated/removed counts, an **Add connector** dialog (kind toggle swaps S3 vs crawl fields, same shape as the MCP static-token/OAuth toggle), per-row **Sync now** / **Edit** / **Delete**, and a per-document drill-in. Every widget already exists in `chrome.tsx`; no new UI paradigm.

---

## 8. Code sketches (grounded in the real templates)

**(a) `workers/data-runner/src/scan.ts`** — clone of eval-runner's `scan.ts`, over `connectors`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EnqueueRequest, Logger } from "@ahura/runner-core";

export interface SyncJob { connectorId: string; collectionId: string; orgId: string; kind: "s3" | "web_crawl"; }

/** Return up to N queued connectors to enqueue. Atomic claim happens in lifecycle. */
export async function scanConnectors(supabase: SupabaseClient, logger: Logger): Promise<EnqueueRequest<SyncJob>[]> {
  const { data, error } = await supabase.schema("inference").from("connectors")
    .select("id, collection_id, org_id, kind")
    .eq("status", "queued")
    .order("next_sync_at", { ascending: true, nullsFirst: true })
    .limit(1);
  if (error) { logger.error({ err: error.message }, "connector scan failed"); return []; }
  return (data ?? []).map((c) => ({
    name: "connector-sync",
    jobId: c.id as string,                    // deterministic → dedupes across restarts
    data: { connectorId: c.id, collectionId: c.collection_id, orgId: c.org_id, kind: c.kind },
  }));
}
```

**(b) `workers/data-runner/src/lifecycle.ts`** (shape only — the algorithm is §6):

```ts
export async function runSync(ctx: RunnerCtx, job: SyncJob): Promise<void> {
  const { supabase } = ctx;
  const syncRunId = crypto.randomUUID();

  // Atomic claim: only a queued connector matches → no double-claim across replicas.
  const { data: conn } = await supabase.schema("inference").from("connectors")
    .update({ status: "syncing", claimed_by: ctx.podId, heartbeat_at: new Date().toISOString() })
    .eq("id", job.connectorId).eq("status", "queued")
    .select("id, kind, config, credential_enc, collection_id").maybeSingle();
  if (!conn) return;                                  // already claimed/cancelled

  try {
    const source = await openSource(ctx, conn);       // S3 client | crawl BFS; creds decrypted here only
    let added = 0, updated = 0;
    for await (const doc of source.list()) {          // {source_uri, etag}
      await ctx.heartbeats.touch("connectors", job.connectorId);   // same stall-detection as ft/eval
      const decision = await decideIngest(supabase, conn, doc);    // skip | ingest (§6 step 3)
      if (decision === "skip") { await markSeen(supabase, conn, doc, syncRunId); continue; }
      const { chunks } = await extractAndChunk(source, doc);       // vendored extract.ts + chunk.ts
      const embedded = await embedChunks(ctx.env, chunks, job.orgId); // /v1/embeddings, on-behalf-of
      const delta = await upsertRowsAndTrack(supabase, conn, doc, embedded, syncRunId);
      delta.isNew ? added++ : updated++;
    }
    const removed = await reconcileDeletions(supabase, conn.id, syncRunId);  // tombstone (§6 step 4)
    await settleConnector(supabase, conn, { added, updated, removed });
  } catch (err) {
    await failConnector(supabase, conn.id, customerSafe(err));     // status=error, safe message, backoff
  }
}
```

**(c) `app/api/inference/internal/connector-scheduler/route.ts`** — mirrors `session-reaper`/`run-reaper` verbatim (token guard → scan due → flip to `queued`):

```ts
// Enqueue every scheduled connector whose next_sync_at has passed. The runner's
// own claimer does the atomic queued→syncing transition; this just makes them
// eligible. Manual-schedule connectors are never touched here (only "sync now"
// flips them to queued directly from the dashboard route).
const { data: due } = await supabase.schema("inference").from("connectors")
  .update({ status: "queued" })
  .in("status", ["idle", "error"]).neq("sync_schedule", "manual")
  .lte("next_sync_at", new Date().toISOString())
  .select("id");
return NextResponse.json({ enqueued: due?.length ?? 0 });
```

Then two lines in `workers/inference/src/index.ts`'s `scheduled()` ladder (`:353`, the `minute % 5` block): `runControlPlaneSweep(env, event, "/api/inference/internal/connector-scheduler", "connector scheduler")` and `…/ingest-watchdog`.

---

## 9. Security

| Risk | Mitigation (all reuse existing, hardened machinery) |
|---|---|
| **Credential theft** | S3 secret AES-256-GCM encrypted at rest (`encryptAesGcm` + `BYOK_DEK`), decrypted **only** inside the runner at sync time, **never** returned by any read API (masked → `has_credential:true`), never logged. Same posture as `byok_keys` / `mcp_servers.auth_token_enc`. |
| **SSRF via web-crawl** | The crawl fetcher is `lib/inference/url-ingest.ts` ported **verbatim** — DNS-resolve-and-pin, block RFC-1918/loopback/link-local/`169.254.169.254`, manual redirect re-validation, one bounded deadline. Same-origin BFS caps prevent using a crawl to pivot across a customer's internal network. This is the one file where copy-exact (not re-derive) is mandatory. |
| **SSRF via S3 endpoint** | A custom S3 `endpoint` (for R2/MinIO) is validated with the same public-IP guard before the client is constructed — a customer can't point the "S3 endpoint" at an internal address to make the runner fetch it. |
| **Brand-scrub** | Every connector `last_error` and per-doc `error` routes through `customerSafeErrorMessage()` before persistence — an S3 SDK error or upstream embedding error must never leak provider/host/internal identifiers into a field the customer reads. Audit the new write paths per the three-layer discipline. |
| **Quota / cost runaway** | `checkVectorQuota` (`lib/inference/vector-quota.ts`, the existing per-org 1M-vector cap) is enforced before embedding a batch, and a per-connector `max_pages`/object-count guard bounds a single sync. Embed spend counts against the org's normal caps (§10). |
| **Cross-tenant** | Connector rows are org-scoped by RLS via the collection; the runner uses the service-role client and always filters by the connector's own `collection_id`/`org_id` when writing `vector_rows`. |

---

## 10. Billing

Ingestion's only real cost is the **embedding calls**, which already flow through `/v1/embeddings` → the existing `USAGE_EVENTS` pipeline → `inference.usage`, metered per-token, attributed to the customer org via `X-Ahura-On-Behalf-Of-Org` (the exact on-behalf-of path agent-runner uses). **So connector embed cost "just works" the moment the runner uses the gateway** — no new metering table, no new `service_type`.

**Known pre-existing gap this inherits (flagged, not introduced here):** doc 19 §6 already noted that the *dashboard* synchronous ingest path (`ingest-file`/`ingest-url`) calls `lib/inference/embeddings.ts` directly (not the metered gateway), so those embeds are currently unbilled. `data-runner` should do it **right** — call the metered `/v1/embeddings` gateway with on-behalf-of, so connector ingestion is correctly billed from day 0. (Retro-fixing the two dashboard routes to also go through the gateway is a small, separate cleanup worth doing in the same slice.) No `active_*` row: connectors aren't an always-on resource; they meter per-sync via usage events like every bounded job.

---

## 11. Delivery plan (slices, each independently shippable + testable)

| Slice | Scope | Test (isolated) |
|---|---|---|
| **C0 — schema + scaffold** | `connectors` + `connector_documents` migration (write SQL, user applies); scaffold `workers/data-runner` from the eval-runner template (`bootRunner`, empty `scan`/`lifecycle`, `Dockerfile`, `k8s/deployment.yaml`); it boots + `/health` green with no jobs. | Boot the process → `/health` ready; migration applies on a branch DB; RLS gates by org. |
| **C1 — connector API + UI (API-first)** | Shared `Connectors` query module; the **customer gateway routes** (`workers/inference/src/routes/connectors.ts`, API-key-authed CRUD + sync + status, credential encrypt-on-write / mask-on-read) **and** the session-authed `/api/inference/connectors/*` twin over the same module; the **Connectors** tab in `vector-detail.tsx`. No syncing yet. | Gateway + dashboard route tests (RBAC, credential never returned, org-scope); render test vs mock. Create an S3 connector via a raw `curl` to `/v1/...` **and** via the dashboard → both land the same masked row. |
| **C2 — web-crawl sync (no creds → simplest end-to-end)** | Runner `scan` (with **per-org fairness** guard) / `lifecycle` (bounded `FETCH_CONCURRENCY` pool + **batch embedding**) + vendored `fetch.ts`/`extract.ts`/`chunk.ts`; the full §6 algorithm for `kind='web_crawl'`; `connector-scheduler` + `ingest-watchdog` crons; sync-lifecycle **webhook** emit. **First real "it syncs" moment.** | Live: point a crawl connector at a small public docs site → runner ingests → hybrid search finds the rows → webhook fires with counts → delete a page at source → next sync tombstones its rows. |
| **C3 — S3 sync + scale proof** | `openSource` S3 path (`@aws-sdk/client-s3`, decrypt creds, **streamed** `ListObjectsV2` pagination + get-object, etag skip); endpoint SSRF guard. | Live against a real bucket: initial sync ingests all; unchanged re-sync is a **no-op** (etag skip, zero embeds — the scalability claim, proven); change one object → only it re-embeds; remove one → tombstone; two connectors from different orgs sync **concurrently** (fairness). |
| **C4 — polish** | Per-doc error surfacing in the UI, schedule (`hourly`/`daily`) + backoff, cost/quota guards verified live, retro-fix the two dashboard ingest routes to bill through the gateway (§10). | E2E: a scheduled connector auto-syncs on cadence; a bad-cred connector shows a customer-safe error, fires the `sync.failed` webhook, and backs off without hammering. |

## 11b. Completion & test status (as built)

Every slice below is **built and merged into the same changeset**. "Tested" records *how* it was
verified, not merely that it was written — the live column is a real sync against the real gateway,
Postgres and embedding pipeline, with an independent receiver checking what we claim.

| Slice | Built | Verified | How |
|---|---|---|---|
| **C0** schema + runner scaffold | ✅ | ✅ live | Migration applied on the real DB; runner boots, `/health` + `/ready` green, claimer ticks |
| **C1** connector API + UI | ✅ | ✅ live | Both front doors create/read/edit/delete the same masked row (API key → gateway, session → dashboard); RBAC + org-scope + credential-masking unit tests |
| **C2** web-crawl sync | ✅ | ✅ live | Multi-page BFS, same-origin filter, depth cap, unchanged-skip, changed-update, 404-tombstone, 500-preserve, per-doc ledger, webhooks |
| **C3** S3 sync | ✅ | ✅ live | Full round trip against a real S3 server (`s3rver`): 8 objects uploaded via the AWS SDK, listed, downloaded, extracted, embedded, queried. **Every supported file type** (`.pdf .docx .txt .md .html .htm .json`) indexed and answered a question; `.png` skipped without download. ETag no-op re-sync, single-object change, object delete → tombstone. Plus: bad credentials → customer-safe error, metadata-IP endpoint refused, and the pinned agent verified against **real AWS S3** |
| **C4** polish | ✅ | ✅ live | Per-doc drill-in, Edit dialog, signed webhooks + `sync_run_id`, 1h failure backoff, scheduler + watchdog crons |
| **C4+** review fixes | ✅ | ✅ live | CI image workflow, delete-while-syncing 409, config round-trip on edit, claim-guarded settle, per-kind PATCH validation, S3 DNS-pinning, honest failure counters, narrowed SELECT grant |

**Live E2E, last full run: 21/21 green** — secret masked on create · secret encrypted at rest ·
initial sync indexes all · **HMAC verified by an independent receiver** · `sync_run_id` present ·
unchanged re-sync embeds nothing · changed page re-embeds only itself · gone page tombstoned ·
transient 500 preserves rows · drill-in names the failed doc and reason · edit preserves API-set
config keys · edit keeps the stored secret · delete during a real in-flight sync → 409 · stolen
claim discarded + logged · wrong receiver secret → INVALID · cleared secret → unsigned · short
secret → 400 · scheduler enqueues a due connector · watchdog reaps a dead sync · cron rejects
unauthenticated calls · crawled content retrievable via hybrid search. Runner log: **0 errors**;
orphan scan across the whole DB: **0 orphaned rows**.

**Document types — all seven verified end to end.** Real files (a hand-built valid PDF with a text
stream, a real OOXML `.docx`, plus txt/md/html/htm/json) were uploaded to an S3 server, synced, and
then *questioned*: each type's distinct fact came back as the top hybrid-search hit. An unsupported
`.png` in the same prefix was skipped by `isSupportedKey` without ever being downloaded. Changing one
object re-embedded only that object and the KB then answered with the **new** text; deleting one
tombstoned its rows and its content became unretrievable while its neighbours still answered.

**Mid-sync spend cap — verified by simulation.** A local proxy in front of `/v1/embeddings`
returned 402 partway through a sync (the runner-side behaviour a real cap produces). Result: the
sync stopped cleanly instead of hammering the gateway per document, the connector went to `error`
with a customer-safe message, the `sync.failed` webhook reported **partial progress**
(`docs_total: 3, docs_added: 2` — not zeros), and documents embedded before the cap were **kept**,
not rolled back. Only the billing trigger itself is unproven, not the runner's response to it.

**OCR-in-ingestion fallback — built.** `data-runner` now sends image objects and text-less/scanned
PDFs through `/v1/ocr` with `X-Ahura-On-Behalf-Of-Org`, then chunks and embeds the returned markdown
like any other extracted text. Normal text PDFs never call OCR unless their extracted text is below
`OCR_MIN_CHARS`; image objects are skipped entirely when `OCR_ENABLED=false`.

**Not verifiable in this environment** (needs infrastructure, not more code): per-org fairness under
concurrent syncs (needs a second org), viewer-role RBAC (needs a viewer account), the dashboard UI
itself (no browser automation), and an S3 sync against a real bucket with working credentials.

**Open — decisions, not engineering:** the three dashboard ingest routes (`upsert`, `ingest-file`,
`ingest-url`) call `lib/inference/embeddings.ts` directly and are therefore **unbilled**, while
connector sync (through the gateway) *is* billed. Retro-fixing for consistency vs. keeping manual
ingest free as a tier is a pricing call, so it is deliberately left alone here.

**Deploy prerequisites** (before the first `kubectl apply`): create the `ahura-data-runner-secrets`
secret (template at the bottom of `k8s/deployment.yaml`), and push the branch so
`.github/workflows/data-runner-image.yml` publishes the image the manifest references.

**Deferred (own later slices):** Google Drive + Notion (OAuth-app lead time — start paperwork now, reuse MCP OAuth machinery), R2 raw-blob staging for re-chunk-without-re-fetch, multi-replica `data-runner` (only when a single replica's throughput is the bottleneck — the claim pattern makes it a config change).

**Critical path:** C0 → C1 → C2 (proves the whole loop + API + webhook with the simplest source) → C3 (adds the highest-value source + proves incremental scale). C2 is the first demoable milestone.

---

## 12. Risks & open questions

- **`data-runner` is genuinely the 4th k8s runner** (after ft/deploy → eval → agent). Unlike doc 01's video/music (which correctly avoided a new deployable via client-polling), sync *does* need a durable background worker — there's no client to poll, and a 10k-object bucket can't run in a request. This is the correct place to spend a deployable. It's tiny (100m CPU) and single-replica; the runner-core claim pattern makes multi-replica trivial later if sync volume demands it. *Reinforces the existing single-Redis / node-capacity watch item — one more small consumer, not a new class of load.*
- **Web-crawl quality vs. boilerplate.** The dependency-free HTML extractor (ported from `url-ingest.ts`) picks up nav/footer noise on heavy sites — acceptable for docs/FAQ pages (the target), documented as a known limitation. A readability-grade extractor is a later quality lever, not a v1 blocker.
- **Sub-document diffing not done (by choice).** A changed doc is re-embedded whole, not diffed to its changed paragraphs. Correct and simple; the only cost is re-embedding an unchanged 99% of a large edited doc. Revisit only if a customer's docs are huge-and-frequently-tiny-edited (rare). Don't build speculatively.
- **Deletion is per-sync reconcile, not real-time.** A doc deleted at the source disappears from the KB on the *next* sync, not instantly. For a daily schedule that's up to 24h of stale content. Acceptable for v1; a customer needing instant removal can "sync now" or delete the row manually. Real-time deletion needs source webhooks (S3 event notifications / Drive push) — a later slice.
- **Scheduler granularity.** `connector-scheduler` runs on the existing 5-min cron; `hourly`/`daily` schedules are satisfied within 5 min of their due time, which is fine. Sub-hour schedules aren't offered in v1 (no demand, and they'd pressure the embed pipeline).
- **OAuth-source lead time is the real gate on Drive/Notion**, not engineering — the connector interface is ready for them, but Google's sensitive-scope review (Drive) can take weeks. Start it in parallel the moment Drive/Notion is prioritized.

---

## 13. Verification discipline (every slice)

Per the repo standard: migration applied to a branch DB · runner atomic-claim + heartbeat reuse the eval-runner-tested path · one live end-to-end per source type (crawl in C2, S3 in C3) proving *incremental* correctness specifically (unchanged→skip, changed→re-embed, deleted→tombstone), not just "it ingested once" · brand-scrub grep over `connectors.last_error` / `connector_documents.error` · credential-never-returned assertion in the CRUD route tests · quota/cap interaction test (an over-quota sync fails fast before spending on embeds).

---

## Research basis

- **Incremental sync = content-hash (SHA-256) + ETag skip + tombstone deletion** is the current consensus pattern — [Unstructured: incremental & continuous ingestion](https://unstructured.io/insights/incremental-data-ingestion-strategies-for-continuous-pipelines), [RagFlow ETag-based S3 incremental ingestion (PR #14677)](https://github.com/infiniflow/ragflow/pull/14677), [Amestris: RAG deletion workflows & the right to be forgotten](https://amestris.com.au/blog/rag-deletion-workflows.html).
- **S3-as-source, sync-on-change** matches the Bedrock/Pinecone knowledge-base model — [Pinecone × Amazon Bedrock](https://docs.pinecone.io/integrations/amazon-bedrock).
- **Connectors own auth, pagination, delta detection, error recovery** as a discrete layer — [Unstructured: data connectors for multi-source ingestion](https://unstructured.io/insights/using-data-connectors-for-efficient-multi-source-ingestion).
