/**
 * Connector sync lifecycle — the incremental-sync algorithm (doc 20 §6).
 *
 * Atomic claim (queued→syncing), then for the connector's source kind: stream
 * its documents, per-doc decide skip (etag/content-hash) vs (re)ingest (chunk →
 * batch-embed → upsert vector_rows), tombstone-delete documents that vanished
 * from the source, settle the counters, fire the webhook. One bad document
 * never aborts the sync; a mid-sync spend-cap (402) stops it cleanly.
 *
 * Doc: nextstespsAI/20-rag-connectors-and-data-runner.md.
 */
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RunnerEnv } from "./env.js";
import type { Logger } from "./logger.js";
import type { SyncJob } from "./scan.js";
import type { Source, SourceDoc } from "./sources/types.js";
import { createWebCrawlSource, type WebCrawlConfig } from "./sources/web-crawl.js";
import { createS3Source, type S3Config, type S3Credential } from "./sources/s3.js";
import { decryptCredential } from "./crypto.js";
import { sha256 } from "./ingest/chunk.js";
import { embedTexts } from "./embed.js";
import { makeOcrFn } from "./ingest/ocr.js";
import { sendSyncWebhook, type SyncWebhookEvent } from "./webhook.js";

export interface RunnerCtx {
  env: RunnerEnv;
  supabase: SupabaseClient;
  logger: Logger;
  podId: string;
}

interface ConnectorRow {
  id: string;
  org_id: string;
  collection_id: string;
  kind: "s3" | "web_crawl";
  config: Record<string, unknown>;
  credential_enc: string | null;
  webhook_url: string | null;
  webhook_secret_enc: string | null;
  sync_schedule: string;
}

interface CollectionRow {
  id: string;
  embedding_model_id: string | null;
  dimensions: number;
}

interface DocLedgerRow {
  id: string;
  content_sha256: string | null;
  source_etag: string | null;
  row_external_ids: string[];
  status: string;
}

const HEARTBEAT_THROTTLE_MS = 15_000;

interface DocOutcome {
  sourceUri: string;
  outcome: "added" | "updated" | "skipped" | "failed";
}

class FatalBatchError extends Error {
  readonly fatalCause: unknown;
  readonly counts: { added: number; updated: number; failed: number };

  constructor(cause: unknown, counts: { added: number; updated: number; failed: number }) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "FatalBatchError";
    this.fatalCause = cause;
    this.counts = counts;
  }
}

// ── Entry point ────────────────────────────────────────────────────────────
export async function runSync(ctx: RunnerCtx, job: SyncJob): Promise<void> {
  const { supabase, logger } = ctx;

  // Atomic claim — only a still-queued connector matches.
  const { data: conn } = await supabase
    .schema("inference")
    .from("connectors")
    .update({ status: "syncing", claimed_by: ctx.podId, heartbeat_at: new Date().toISOString() })
    .eq("id", job.connectorId)
    .eq("status", "queued")
    .select(
      "id, org_id, collection_id, kind, config, credential_enc, webhook_url, webhook_secret_enc, sync_schedule"
    )
    .maybeSingle<ConnectorRow>();
  if (!conn) {
    logger.info({ connectorId: job.connectorId }, "connector already claimed/cancelled — skipping");
    return;
  }

  const syncRunId = randomUUID();
  let source: Source | undefined;
  // Hoisted so the catch can report what this run actually managed before it
  // died. A mid-sync failure (spend cap, source outage) still embedded — and
  // BILLED — everything up to that point; a webhook claiming 0/0/0/0 would
  // contradict the customer's own invoice.
  let seen = 0, added = 0, updated = 0, failed = 0;
  try {
    const collection = await loadCollection(ctx, conn.collection_id);
    if (!collection.embedding_model_id) {
      throw new Error("This is a bring-your-own-embeddings collection — connectors need server-side auto-embed.");
    }

    source = await buildSource(ctx, conn);

    let lastBeat = Date.now();
    let batch: SourceDoc[] = [];
    for await (const doc of source.list()) {
      seen++;
      if (Date.now() - lastBeat >= HEARTBEAT_THROTTLE_MS) {
        await touchHeartbeat(ctx, conn.id);
        lastBeat = Date.now();
      }
      batch.push(doc);
      if (batch.length >= ctx.env.fetchConcurrency) {
        try {
          const counts = await processDocBatch(ctx, conn, collection, batch, syncRunId);
          added += counts.added;
          updated += counts.updated;
          failed += counts.failed;
        } catch (err) {
          if (err instanceof FatalBatchError) {
            added += err.counts.added;
            updated += err.counts.updated;
            failed += err.counts.failed;
            throw err.fatalCause;
          }
          throw err;
        }
        batch = [];
        await touchHeartbeat(ctx, conn.id);
        lastBeat = Date.now();
      }
    }
    if (batch.length > 0) {
      try {
        const counts = await processDocBatch(ctx, conn, collection, batch, syncRunId);
        added += counts.added;
        updated += counts.updated;
        failed += counts.failed;
      } catch (err) {
        if (err instanceof FatalBatchError) {
          added += err.counts.added;
          updated += err.counts.updated;
          failed += err.counts.failed;
          throw err.fatalCause;
        }
        throw err;
      }
      await touchHeartbeat(ctx, conn.id);
    }

    const removed = await reconcileDeletions(ctx, conn, syncRunId);
    await settleConnector(ctx, conn, { docsTotal: seen, added, updated, removed, failed });
    logger.info({ connectorId: conn.id, seen, added, updated, removed, failed }, "connector sync complete");

    await emitSyncWebhook(ctx, conn, {
      event: "connector.sync.completed", connector_id: conn.id, collection_id: conn.collection_id,
      sync_run_id: syncRunId,
      docs_total: seen, docs_added: added, docs_updated: updated, docs_removed: removed, docs_failed: failed,
      occurred_at: new Date().toISOString(),
    });
  } catch (err) {
    const msg = customerSafe(err);
    await failConnector(ctx, conn, msg);
    logger.error({ connectorId: conn.id, err: msg }, "connector sync failed");
    // Partial progress, not zeros. docs_removed is genuinely 0: the tombstone
    // reconcile never ran, so nothing was deleted. The connector ROW keeps the
    // last *successful* sync's counters, so they stay consistent with
    // last_synced_at — this event is the record of what this run did.
    await emitSyncWebhook(ctx, conn, {
      event: "connector.sync.failed", connector_id: conn.id, collection_id: conn.collection_id,
      sync_run_id: syncRunId,
      docs_total: seen, docs_added: added, docs_updated: updated, docs_removed: 0, docs_failed: failed,
      error: msg, occurred_at: new Date().toISOString(),
    });
  } finally {
    await source?.close?.();
  }
}

async function processDocBatch(
  ctx: RunnerCtx,
  conn: ConnectorRow,
  collection: CollectionRow,
  docs: SourceDoc[],
  syncRunId: string
): Promise<{ added: number; updated: number; failed: number }> {
  const results = await Promise.allSettled(docs.map((doc) => processOneDoc(ctx, conn, collection, doc, syncRunId)));
  let added = 0, updated = 0, failed = 0;
  let fatal: unknown;

  for (const result of results) {
    if (result.status === "rejected") {
      if (isSpendBlocked(result.reason) && !fatal) fatal = result.reason;
      else {
        failed++;
        ctx.logger.warn({ connectorId: conn.id, err: customerSafe(result.reason) }, "connector: doc ingest failed unexpectedly");
      }
      continue;
    }
    if (result.value.outcome === "added") added++;
    else if (result.value.outcome === "updated") updated++;
    else if (result.value.outcome === "failed") failed++;
  }

  if (fatal) throw new FatalBatchError(fatal, { added, updated, failed });
  return { added, updated, failed };
}

async function processOneDoc(
  ctx: RunnerCtx,
  conn: ConnectorRow,
  collection: CollectionRow,
  doc: SourceDoc,
  syncRunId: string
): Promise<DocOutcome> {
  try {
    const outcome = await ingestDoc(ctx, conn, collection, doc, syncRunId);
    return { sourceUri: doc.sourceUri, outcome };
  } catch (err) {
    // A spend-cap 402 mid-sync means the org is out of budget — stop the whole
    // sync cleanly rather than hammering the gateway per doc. Both embeddings
    // and OCR can raise it (EmbedError / OcrError), so match on the shared
    // isSpendBlocked shape rather than one concrete class.
    if (isSpendBlocked(err)) throw err;
    await recordDocFailure(ctx, conn, doc.sourceUri, customerSafe(err), syncRunId);
    ctx.logger.warn({ connectorId: conn.id, sourceUri: doc.sourceUri, err: customerSafe(err) }, "connector: doc ingest failed");
    return { sourceUri: doc.sourceUri, outcome: "failed" };
  }
}

/**
 * Emit the sync-lifecycle webhook, signed when the connector carries a secret.
 *
 * Fails CLOSED on a secret we can't decrypt: a receiver that configured a
 * secret verifies the signature, and quietly downgrading to an unsigned POST
 * would be indistinguishable from a forgery to any receiver that only checks
 * the header "if present". Better to send nothing and log — the customer can
 * still read the outcome from GET /v1/connectors/{id}.
 */
async function emitSyncWebhook(ctx: RunnerCtx, conn: ConnectorRow, event: SyncWebhookEvent): Promise<void> {
  if (!conn.webhook_url) return;

  let secret: string | null = null;
  if (conn.webhook_secret_enc) {
    if (!ctx.env.credentialDek) {
      ctx.logger.warn({ connectorId: conn.id }, "webhook secret set but no DEK — skipping webhook (cannot sign)");
      return;
    }
    try {
      secret = await decryptCredential(conn.webhook_secret_enc, ctx.env.credentialDek);
    } catch (err) {
      ctx.logger.warn(
        { connectorId: conn.id, err: err instanceof Error ? err.message : String(err) },
        "webhook secret failed to decrypt — skipping webhook (cannot sign)"
      );
      return;
    }
  }

  await sendSyncWebhook(conn.webhook_url, event, ctx.logger, ctx.env.crawlAllowPrivate, secret);
}

// ── Per-document ingest (§6 step 3) ─────────────────────────────────────────
async function ingestDoc(
  ctx: RunnerCtx,
  conn: ConnectorRow,
  collection: CollectionRow,
  doc: SourceDoc,
  syncRunId: string
): Promise<"added" | "updated" | "skipped"> {
  const { supabase } = ctx;

  const { data: existing } = await supabase
    .schema("inference")
    .from("connector_documents")
    .select("id, content_sha256, source_etag, row_external_ids, status")
    .eq("connector_id", conn.id)
    .eq("source_uri", doc.sourceUri)
    .maybeSingle<DocLedgerRow>();

  // Cheap etag skip — no fetch, no embed (mainly an S3 win). Also covers the
  // text-less documents recorded by recordEmptyDoc below (chunk_count 0), which
  // is what stops them being re-downloaded and re-OCR'd every single sync.
  if (existing?.status === "indexed" && existing.source_etag && doc.etag && existing.source_etag === doc.etag) {
    await markSeen(ctx, existing.id, syncRunId);
    return "skipped";
  }

  const { chunks, contentSha256 } = await doc.load();
  if (chunks.length === 0) {
    // The document IS still in the source — it just yields no indexable text (a
    // logo that OCR'd to nothing, an empty file). Record it as seen, with its
    // etag, rather than leaving it unseen: an unseen doc gets tombstoned by the
    // reconcile, and because the etag skip only matches 'indexed' rows the NEXT
    // sync would download and OCR it all over again — a per-sync OCR bill, on an
    // hourly connector forever, for a document that can never produce a chunk
    // (found by review). Any rows it owned when it DID have content are purged.
    await recordEmptyDoc(ctx, conn, doc, contentSha256, existing, syncRunId);
    return "skipped";
  }

  // Content-hash skip — unchanged since last sync, skip the (expensive) embed.
  if (existing?.status === "indexed" && existing.content_sha256 === contentSha256) {
    await supabase.schema("inference").from("connector_documents")
      .update({ source_etag: doc.etag, last_seen_sync: syncRunId })
      .eq("id", existing.id);
    return "skipped";
  }

  // New or changed → embed + upsert.
  const embeddings = await embedTexts(ctx.env, collection.embedding_model_id!, chunks, conn.org_id);
  if (embeddings.some((e) => e.length !== collection.dimensions)) {
    throw new Error(`embedding dimension mismatch (expected ${collection.dimensions})`);
  }

  // Key rows by the SOURCE URI (stable per document), NOT the content hash.
  // A content-keyed id collides when two different source docs have identical
  // content — tombstoning one then deletes the other's rows (found live, C2).
  // URI-keyed: a doc's rows are stable across content changes (upsert in place),
  // and never collide with another doc's. contentSha256 stays the change key
  // (skip-embed-if-unchanged), just not the row identity.
  const uriHash = sha256(doc.sourceUri).slice(0, 16);
  const externalIds = chunks.map((_, i) => `conn-${conn.id}-${uriHash}-${i}`);

  // A changed doc with fewer chunks than before → delete the old rows no longer
  // produced (bounded to one doc's chunks, so a plain .in() is safe here).
  if (existing?.row_external_ids?.length) {
    const stale = existing.row_external_ids.filter((id) => !externalIds.includes(id));
    if (stale.length > 0) {
      await supabase.schema("inference").from("vector_rows").delete()
        .eq("collection_id", conn.collection_id).in("external_id", stale);
    }
  }

  const { error: upsertErr } = await supabase.schema("inference").from("vector_rows").upsert(
    chunks.map((content, i) => ({
      collection_id: conn.collection_id,
      external_id: externalIds[i],
      content,
      metadata: { connector_id: conn.id, source_uri: doc.sourceUri, chunk_index: i },
      embedding: JSON.stringify(embeddings[i]),
    })),
    { onConflict: "collection_id,external_id" }
  );
  if (upsertErr) throw new Error(`vector upsert: ${upsertErr.message}`);

  await supabase.schema("inference").from("connector_documents").upsert(
    {
      connector_id: conn.id,
      collection_id: conn.collection_id,
      org_id: conn.org_id,
      source_uri: doc.sourceUri,
      content_sha256: contentSha256,
      source_etag: doc.etag,
      row_external_ids: externalIds,
      chunk_count: chunks.length,
      status: "indexed",
      error: null,
      last_seen_sync: syncRunId,
    },
    { onConflict: "connector_id,source_uri" }
  );

  return existing ? "updated" : "added";
}

// ── Tombstone reconcile (§6 step 4) ─────────────────────────────────────────
async function reconcileDeletions(ctx: RunnerCtx, conn: ConnectorRow, syncRunId: string): Promise<number> {
  const { supabase } = ctx;
  // Any doc NOT seen this run (last_seen_sync != current) has vanished from the
  // source → tombstone it. Includes 'failed' docs (not just 'indexed'): a doc
  // that was indexed, later failed a sync (keeping its old rows), then
  // disappeared would otherwise leak its stale rows forever. A doc that fails
  // but is still PRESENT keeps last_seen_sync=current (recordDocFailure sets
  // it), so it's correctly NOT tombstoned — only genuinely-gone docs are.
  const { data: stale } = await supabase
    .schema("inference")
    .from("connector_documents")
    .select("id, row_external_ids")
    .eq("connector_id", conn.id)
    .in("status", ["indexed", "failed"])
    .neq("last_seen_sync", syncRunId)
    .returns<Array<{ id: string; row_external_ids: string[] }>>();

  let removed = 0;
  for (const d of stale ?? []) {
    if (d.row_external_ids?.length) {
      await supabase.schema("inference").from("vector_rows").delete()
        .eq("collection_id", conn.collection_id).in("external_id", d.row_external_ids);
    }
    await supabase.schema("inference").from("connector_documents")
      .update({ status: "removed", row_external_ids: [] }).eq("id", d.id);
    removed++;
  }
  return removed;
}

// ── Source construction ─────────────────────────────────────────────────────
async function buildSource(ctx: RunnerCtx, conn: ConnectorRow): Promise<Source> {
  if (conn.kind === "web_crawl") {
    return createWebCrawlSource(conn.config as unknown as WebCrawlConfig, ctx.env.maxDocumentsPerSync, ctx.logger, ctx.env.crawlAllowPrivate);
  }
  if (conn.kind === "s3") {
    if (!conn.credential_enc) throw new Error("This S3 connector has no stored credential.");
    if (!ctx.env.credentialDek) throw new Error("Server is not configured to decrypt source credentials.");
    let credential: S3Credential;
    try {
      credential = JSON.parse(await decryptCredential(conn.credential_enc, ctx.env.credentialDek)) as S3Credential;
    } catch {
      // A wrong DEK / corrupt ciphertext must not leak details — fail closed.
      throw new Error("Could not read this connector's stored S3 credential.");
    }
    // OCR fallback for scanned PDFs / images, billed to this org on-behalf-of.
    const ocr = ctx.env.ocrEnabled
      ? { fn: makeOcrFn(ctx.env, conn.org_id), minChars: ctx.env.ocrMinChars }
      : undefined;
    return createS3Source(
      conn.config as unknown as S3Config,
      credential,
      ctx.env.maxDocumentsPerSync,
      ctx.logger,
      ctx.env.s3EndpointAllowPrivate,
      ocr
    );
  }
  throw new Error(`Connector source "${conn.kind}" is not available yet.`);
}

// ── Small helpers ────────────────────────────────────────────────────────────
async function loadCollection(ctx: RunnerCtx, collectionId: string): Promise<CollectionRow> {
  const { data, error } = await ctx.supabase
    .schema("inference")
    .from("vector_collections")
    .select("id, embedding_model_id, dimensions")
    .eq("id", collectionId)
    .maybeSingle<CollectionRow>();
  if (error || !data) throw new Error("Knowledge base not found for this connector.");
  return data;
}

/**
 * Ledger entry for a document that is present in the source but produced no
 * text. Kept as 'indexed' with chunk_count 0 — not 'removed' (it hasn't gone
 * anywhere, and 'removed' rows are outside the etag skip, which is the whole
 * point) and not 'failed' (nothing went wrong; re-trying can't help). The
 * `error` note is what the dashboard shows the customer. If it ever gains real
 * content its etag changes, so the skip misses and it ingests normally.
 */
async function recordEmptyDoc(
  ctx: RunnerCtx,
  conn: ConnectorRow,
  doc: SourceDoc,
  contentSha256: string,
  existing: DocLedgerRow | null | undefined,
  syncRunId: string
): Promise<void> {
  if (existing?.row_external_ids?.length) {
    await ctx.supabase.schema("inference").from("vector_rows").delete()
      .eq("collection_id", conn.collection_id).in("external_id", existing.row_external_ids);
  }
  await ctx.supabase.schema("inference").from("connector_documents").upsert(
    {
      connector_id: conn.id, collection_id: conn.collection_id, org_id: conn.org_id,
      source_uri: doc.sourceUri, content_sha256: contentSha256, source_etag: doc.etag,
      row_external_ids: [], chunk_count: 0, status: "indexed",
      error: "No indexable text found in this document.", last_seen_sync: syncRunId,
    },
    { onConflict: "connector_id,source_uri" }
  );
}

async function markSeen(ctx: RunnerCtx, docId: string, syncRunId: string): Promise<void> {
  await ctx.supabase.schema("inference").from("connector_documents")
    .update({ last_seen_sync: syncRunId }).eq("id", docId);
}

async function recordDocFailure(ctx: RunnerCtx, conn: ConnectorRow, sourceUri: string, error: string, syncRunId: string): Promise<void> {
  await ctx.supabase.schema("inference").from("connector_documents").upsert(
    {
      connector_id: conn.id, collection_id: conn.collection_id, org_id: conn.org_id,
      source_uri: sourceUri, status: "failed", error, last_seen_sync: syncRunId,
    },
    { onConflict: "connector_id,source_uri" }
  );
}

async function touchHeartbeat(ctx: RunnerCtx, connectorId: string): Promise<void> {
  await ctx.supabase.schema("inference").from("connectors")
    .update({ heartbeat_at: new Date().toISOString() })
    .eq("id", connectorId).eq("status", "syncing");
}

function nextSyncAt(schedule: string, from = Date.now()): string | null {
  if (schedule === "hourly") return new Date(from + 60 * 60_000).toISOString();
  if (schedule === "daily") return new Date(from + 24 * 60 * 60_000).toISOString();
  return null;
}

/**
 * Both settle paths are guarded by `claimed_by = our pod`: if the watchdog
 * decided this sync was dead (heartbeat only ticks BETWEEN documents, so one
 * very slow document can outlast the stale threshold) it already flipped the
 * row to 'error' and cleared the claim, and the scheduler may have re-queued
 * it. Writing our outcome then would resurrect a row another runner owns —
 * clobbering 'queued' back to 'idle' and silently skipping that sync cycle.
 * Losing the race means our result is stale: drop it and say so.
 */
async function settleConnector(
  ctx: RunnerCtx,
  conn: ConnectorRow,
  counts: { docsTotal: number; added: number; updated: number; removed: number; failed: number }
): Promise<void> {
  const { data } = await ctx.supabase.schema("inference").from("connectors").update({
    status: "idle", claimed_by: null, heartbeat_at: null, last_error: null,
    last_synced_at: new Date().toISOString(), next_sync_at: nextSyncAt(conn.sync_schedule),
    docs_total: counts.docsTotal, docs_added: counts.added, docs_updated: counts.updated,
    docs_removed: counts.removed, docs_failed: counts.failed,
  }).eq("id", conn.id).eq("claimed_by", ctx.podId).select("id");
  if (!data?.length) {
    ctx.logger.warn({ connectorId: conn.id }, "claim lost mid-sync (reaped?) — discarding this run's result");
  }
}

async function failConnector(ctx: RunnerCtx, conn: ConnectorRow, message: string): Promise<void> {
  // Back off the next scheduled attempt so a persistently-broken connector
  // (bad seed, dead host) doesn't retry every cron tick.
  const backoff = conn.sync_schedule === "manual" ? null : new Date(Date.now() + 60 * 60_000).toISOString();
  const { data } = await ctx.supabase.schema("inference").from("connectors").update({
    status: "error", claimed_by: null, heartbeat_at: null, last_error: message, next_sync_at: backoff,
  }).eq("id", conn.id).eq("claimed_by", ctx.podId).select("id");
  if (!data?.length) {
    ctx.logger.warn({ connectorId: conn.id }, "claim lost mid-sync (reaped?) — discarding this failure");
  }
}

/** True for an error that means "org is out of budget" — a 402 from either the
 *  embed or the OCR client. Duck-typed so it doesn't couple to either class. */
function isSpendBlocked(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { isSpendBlocked?: unknown }).isSpendBlocked === true
  );
}

/** Truncate + strip known internal identifiers from an error before it's
 *  persisted to a customer-visible field (last_error / doc error). */
function customerSafe(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw
    .replace(/openrouter|runpod|supabase|cloudflare/gi, "upstream")
    .replace(/https?:\/\/[^\s]*\.(workers\.dev|supabase\.co|runpod\.[a-z]+)[^\s]*/gi, "[internal]")
    .replace(/\b(?:10|127)\.(?:\d{1,3}\.){2}\d{1,3}\b/g, "[internal-ip]")
    .replace(/\b169\.254\.\d{1,3}\.\d{1,3}\b/g, "[internal-ip]")
    .replace(/\b172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}\b/g, "[internal-ip]")
    .replace(/\b192\.168\.\d{1,3}\.\d{1,3}\b/g, "[internal-ip]")
    .slice(0, 300);
}
