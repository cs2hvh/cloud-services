/**
 * Best-effort sync-lifecycle webhook. On a connector settle, POST a
 * connector.sync.completed / .failed event to the customer's webhook_url.
 *
 * The URL is SSRF-guarded (assertPublicHttpUrl) before the POST — a customer
 * can't point webhook_url at an internal address to make the runner fetch it.
 * Fully best-effort: a webhook failure never affects the sync outcome.
 *
 * When the connector carries a webhook secret the body is HMAC-signed exactly
 * like the agent function-tool webhook (workers/agent-runner/src/tools/function.ts):
 * `sha256(secret, "{unix_ts}.{body}")` as `X-Ahura-Signature: sha256=<hex>` plus
 * `X-Ahura-Timestamp`. The timestamp is inside the signature, so a captured
 * request can't be replayed once the receiver rejects stale timestamps.
 *
 * Doc: nextstespsAI/20-rag-connectors-and-data-runner.md (§7, Slices C2 + C4).
 */
import { createHmac } from "node:crypto";
import { pinnedFetch } from "./ingest/fetch.js";
import type { Logger } from "./logger.js";

export interface SyncWebhookEvent {
  event: "connector.sync.completed" | "connector.sync.failed";
  connector_id: string;
  collection_id: string;
  /** Identifies this one sync attempt — lets a receiver dedupe retries and
   *  correlate the event with the per-document ledger (§7). */
  sync_run_id: string;
  docs_total: number;
  docs_added: number;
  docs_updated: number;
  docs_removed: number;
  docs_failed: number;
  error?: string;
  occurred_at: string;
}

/** Stripe-style signature headers, or {} when no secret is configured. */
function signHeaders(secret: string | null, body: string): Record<string, string> {
  if (!secret) return {};
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return { "X-Ahura-Timestamp": timestamp, "X-Ahura-Signature": `sha256=${signature}` };
}

export async function sendSyncWebhook(
  webhookUrl: string,
  event: SyncWebhookEvent,
  logger: Logger,
  allowPrivate = false,
  secret: string | null = null
): Promise<void> {
  try {
    const body = JSON.stringify(event);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await pinnedFetch(webhookUrl, allowPrivate, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "AhuraCloudConnectorWebhook/1.0",
          ...signHeaders(secret, body),
        },
        body,
        signal: controller.signal,
      });
      if (!res.ok) {
        logger.warn({ connectorId: event.connector_id, status: res.status }, "sync webhook non-2xx");
      }
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    logger.warn(
      { connectorId: event.connector_id, err: err instanceof Error ? err.message : String(err) },
      "sync webhook failed (best-effort)"
    );
  }
}
