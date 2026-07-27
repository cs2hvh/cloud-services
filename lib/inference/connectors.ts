/**
 * RAG connector shared bits for the dashboard-session API routes
 * (app/api/inference/connectors/*). The Next.js-side copy of the same contract
 * the CF Worker gateway serves in workers/inference/src/routes/connectors.ts —
 * they can't share one module across the deployable boundary (the Worker can't
 * import from lib/), so this mirrors the gateway's Zod schemas, row shape, and
 * credential-masking exactly. One contract, two front doors.
 *
 * Doc: nextstespsAI/20-rag-connectors-and-data-runner.md (§7, Slice C1).
 */
import { z } from "zod";

const s3ConfigSchema = z.object({
  bucket: z.string().min(1).max(255),
  region: z.string().min(1).max(64).optional(),
  endpoint: z.string().url().optional(),
  prefix: z.string().max(1024).optional(),
  max_documents: z.number().int().positive().max(100_000).optional(),
});

const webCrawlConfigSchema = z.object({
  seed_url: z.string().url().refine((u) => u.startsWith("http://") || u.startsWith("https://"), "must be an http(s) URL"),
  max_pages: z.number().int().positive().max(1000).optional().default(50),
  max_depth: z.number().int().nonnegative().max(5).optional().default(2),
  max_documents: z.number().int().positive().max(100_000).optional(),
});

const s3CredentialSchema = z.object({
  access_key_id: z.string().min(1).max(256),
  secret_access_key: z.string().min(1).max(256),
});

const scheduleSchema = z.enum(["manual", "hourly", "daily"]);

// Shared secret used to HMAC-sign the sync webhook (X-Ahura-Signature). 16 char
// minimum — anything shorter isn't a meaningful signing key. Stored encrypted,
// never returned (has_webhook_secret).
const webhookSecretSchema = z.string().min(16, "webhook_secret must be at least 16 characters").max(256);

export const createConnectorSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("s3"),
    collection_id: z.string().uuid(),
    display_name: z.string().min(1).max(100),
    config: s3ConfigSchema,
    credential: s3CredentialSchema,
    webhook_url: z.string().url().optional(),
    webhook_secret: webhookSecretSchema.optional(),
    sync_schedule: scheduleSchema.optional().default("manual"),
  }),
  z.object({
    kind: z.literal("web_crawl"),
    collection_id: z.string().uuid(),
    display_name: z.string().min(1).max(100),
    config: webCrawlConfigSchema,
    webhook_url: z.string().url().optional(),
    webhook_secret: webhookSecretSchema.optional(),
    sync_schedule: scheduleSchema.optional().default("manual"),
  }),
]);

export const updateConnectorSchema = z
  .object({
    display_name: z.string().min(1).max(100).optional(),
    config: z.record(z.string(), z.unknown()).optional(), // re-validated per kind in the handler
    credential: s3CredentialSchema.optional(),
    webhook_url: z.string().url().nullable().optional(),
    // null clears the secret (webhook goes back to unsigned); omitted keeps it.
    webhook_secret: webhookSecretSchema.nullable().optional(),
    sync_schedule: scheduleSchema.optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "No fields to update" });

/**
 * Re-validate a PATCHed `config` against the connector's (immutable) kind.
 * The patch schema can only type `config` as a free-form object — the kind
 * lives on the stored row — so without this a `{"config":{}}` patch would 200
 * and then fail cryptically at sync time. Mirrors the gateway's copy.
 */
export function validateConfigForKind(
  kind: "s3" | "web_crawl",
  config: Record<string, unknown>
): { ok: true; config: Record<string, unknown> } | { ok: false; message: string } {
  const schema = kind === "s3" ? s3ConfigSchema : webCrawlConfigSchema;
  const r = schema.safeParse(config);
  if (!r.success) {
    return { ok: false, message: r.error.issues.map((i) => `config.${i.path.join(".")}: ${i.message}`).join("; ") };
  }
  return { ok: true, config: r.data as Record<string, unknown> };
}

export interface ConnectorRow {
  id: string;
  org_id: string;
  collection_id: string;
  kind: "s3" | "web_crawl";
  display_name: string;
  config: Record<string, unknown>;
  credential_enc: string | null;
  webhook_url: string | null;
  webhook_secret_enc: string | null;
  sync_schedule: "manual" | "hourly" | "daily";
  status: "idle" | "queued" | "syncing" | "error" | "disabled";
  last_error: string | null;
  last_synced_at: string | null;
  next_sync_at: string | null;
  docs_total: number;
  docs_added: number;
  docs_updated: number;
  docs_removed: number;
  docs_failed: number;
  created_at: string;
  updated_at: string;
}

export const CONNECTOR_COLS =
  "id, org_id, collection_id, kind, display_name, config, credential_enc, webhook_url, webhook_secret_enc, sync_schedule, status, last_error, last_synced_at, next_sync_at, docs_total, docs_added, docs_updated, docs_removed, docs_failed, created_at, updated_at";

/** Mask for the wire — no ciphertext is ever returned, only has_* booleans. */
export function toConnectorResponse(row: ConnectorRow) {
  return {
    id: row.id,
    collection_id: row.collection_id,
    kind: row.kind,
    display_name: row.display_name,
    config: row.config ?? {},
    has_credential: row.credential_enc != null,
    webhook_url: row.webhook_url,
    has_webhook_secret: row.webhook_secret_enc != null,
    sync_schedule: row.sync_schedule,
    status: row.status,
    last_error: row.last_error,
    last_synced_at: row.last_synced_at,
    next_sync_at: row.next_sync_at,
    last_sync: {
      docs_total: row.docs_total,
      docs_added: row.docs_added,
      docs_updated: row.docs_updated,
      docs_removed: row.docs_removed,
      docs_failed: row.docs_failed,
    },
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
