/**
 * RAG connectors — create/list/edit/delete a connector on a knowledge base
 * (a vector collection), trigger a sync, and read sync status, by API key.
 * Counterpart to app/api/inference/connectors/* (dashboard-session-only) —
 * same table (inference.connectors), same validation, same AES-GCM encryption
 * of the stored S3 credential (lib/crypto.ts, mirrors lib/inference/crypto.ts).
 *
 * These are control-plane (management) routes — they don't spend money inline.
 * A sync trigger only flips the connector to 'queued'; the actual ingest work
 * (and its embedding spend) happens out of band in workers/data-runner, metered
 * per-token through the normal /v1/embeddings on-behalf-of pipeline. So all of
 * these are in the MANAGEMENT_ROUTES allowlist (spend-check skips them).
 *
 * Doc: nextstespsAI/20-rag-connectors-and-data-runner.md (§7, Slice C1).
 */
import type { Handler } from "hono";
import { z } from "zod";
import type { Env, HonoVariables } from "../types.ts";
import { gatewayError } from "../lib/gateway.ts";
import { encryptAesGcm, bytesToPostgresBytea } from "../lib/crypto.ts";
import { isValidUuid } from "../lib/on-behalf-of.ts";
import { makeSupabase, enqueueAudit, readJson } from "../lib/route-helpers.ts";
import { fetchCollection } from "./vector-collections.ts";

// ── Validation ────────────────────────────────────────────────────────────────

const httpUrlSchema = z
  .string()
  .url()
  .refine((u) => u.startsWith("http://") || u.startsWith("https://"), "must be an http(s) URL");

const s3ConfigSchema = z.object({
  bucket: z.string().min(1).max(255),
  region: z.string().min(1).max(64).optional(),
  endpoint: httpUrlSchema.optional(), // for R2/MinIO/etc.; SSRF-guarded at sync time (C3)
  prefix: z.string().max(1024).optional(),
  max_documents: z.number().int().positive().max(100_000).optional(),
});

const webCrawlConfigSchema = z.object({
  seed_url: httpUrlSchema,
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
    display_name: z.string().min(1).max(100),
    config: s3ConfigSchema,
    credential: s3CredentialSchema, // S3 requires a credential
    webhook_url: httpUrlSchema.optional(),
    webhook_secret: webhookSecretSchema.optional(),
    sync_schedule: scheduleSchema.optional().default("manual"),
  }),
  z.object({
    kind: z.literal("web_crawl"),
    display_name: z.string().min(1).max(100),
    config: webCrawlConfigSchema,
    webhook_url: httpUrlSchema.optional(),
    webhook_secret: webhookSecretSchema.optional(),
    sync_schedule: scheduleSchema.optional().default("manual"),
  }),
]);

// PATCH: every field optional; kind is immutable (a connector's source type
// can't change under it — delete + recreate instead). credential re-supplied
// = replace; omitted = keep the existing one (it's never returned to update
// against, same as mcp-servers' auth_token).
export const updateConnectorSchema = z
  .object({
    display_name: z.string().min(1).max(100).optional(),
    config: z.record(z.string(), z.unknown()).optional(), // re-validated per kind in the handler
    credential: s3CredentialSchema.optional(),
    webhook_url: httpUrlSchema.nullable().optional(),
    // null clears the secret (webhook goes back to unsigned); omitted keeps it.
    webhook_secret: webhookSecretSchema.nullable().optional(),
    sync_schedule: scheduleSchema.optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "No fields to update" });

/**
 * Re-validate a PATCHed `config` against the connector's (immutable) kind.
 *
 * updateConnectorSchema can only type `config` as a free-form object — the kind
 * lives on the stored row, not in the patch — so without this a caller could
 * PATCH `{"config":{}}`, get a 200, and only discover the damage when the next
 * sync died with "Not a valid URL: undefined". Validate at the edge instead,
 * and return the same 400 shape a bad create would.
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

// ── Shared plumbing ─────────────────────────────────────────────────────────

interface ConnectorDbRow {
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

const CONNECTOR_COLS =
  "id, org_id, collection_id, kind, display_name, config, credential_enc, webhook_url, webhook_secret_enc, sync_schedule, status, last_error, last_synced_at, next_sync_at, docs_total, docs_added, docs_updated, docs_removed, docs_failed, created_at, updated_at";

/** Mask for the wire — no ciphertext is EVER returned, only the derived
 *  `has_credential` / `has_webhook_secret` booleans. `config` holds only non-secret fields
 *  (bucket/region/endpoint/prefix, seed_url/…), safe to return. */
function toConnectorResponse(row: ConnectorDbRow) {
  return {
    id: row.id,
    object: "connector" as const,
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

// ── Handlers ─────────────────────────────────────────────────────────────────

// GET /v1/vector/collections/:id/connectors — the collection's connectors.
export const listConnectors: Handler<{ Bindings: Env; Variables: HonoVariables }> = async (c) => {
  const auth = c.get("auth");
  const requestId = c.get("requestId");
  const collectionId = c.req.param("id");
  if (!collectionId || !isValidUuid(collectionId)) {
    return c.json(gatewayError("Invalid collection id", "invalid_request_error", "invalid_request", requestId), 400);
  }
  const supabase = makeSupabase(c.env);

  // Ownership: the collection must belong to the caller's org (404 otherwise).
  const collection = await fetchCollection(supabase, auth.orgId, collectionId);
  if (!collection) {
    return c.json(gatewayError("Collection not found", "invalid_request_error", "collection_not_found", requestId), 404);
  }

  const { data, error } = await supabase
    .schema("inference")
    .from("connectors")
    .select(CONNECTOR_COLS)
    .eq("collection_id", collectionId)
    .eq("org_id", auth.orgId)
    .order("created_at", { ascending: false })
    .returns<ConnectorDbRow[]>();

  if (error) {
    return c.json(gatewayError("Failed to list connectors", "server_error", "connectors_list_failed", requestId), 500);
  }
  return c.json({ object: "list" as const, data: (data ?? []).map(toConnectorResponse) });
};

// POST /v1/vector/collections/:id/connectors — register a connector on a KB.
export const createConnector: Handler<{ Bindings: Env; Variables: HonoVariables }> = async (c) => {
  const auth = c.get("auth");
  const requestId = c.get("requestId");
  const collectionId = c.req.param("id");
  if (!collectionId || !isValidUuid(collectionId)) {
    return c.json(gatewayError("Invalid collection id", "invalid_request_error", "invalid_request", requestId), 400);
  }

  const raw = await readJson(c);
  if (raw === undefined) {
    return c.json(gatewayError("Invalid JSON body", "invalid_request_error", "invalid_json", requestId), 400);
  }
  const parsed = createConnectorSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      gatewayError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), "invalid_request_error", "invalid_request", requestId),
      400
    );
  }
  const d = parsed.data;

  const supabase = makeSupabase(c.env);
  const collection = await fetchCollection(supabase, auth.orgId, collectionId);
  if (!collection) {
    return c.json(gatewayError("Collection not found", "invalid_request_error", "collection_not_found", requestId), 404);
  }

  // Encrypt the S3 credential before it ever reaches the DB. web_crawl has none.
  let credentialEnc: string | null = null;
  if (d.kind === "s3") {
    if (!c.env.BYOK_DEK) {
      return c.json(gatewayError("Server is not configured to store source credentials", "server_error", "dek_missing", requestId), 500);
    }
    try {
      credentialEnc = bytesToPostgresBytea(await encryptAesGcm(JSON.stringify(d.credential), c.env.BYOK_DEK));
    } catch {
      return c.json(gatewayError("Failed to encrypt credentials", "server_error", "encryption_failed", requestId), 500);
    }
  }

  // Same treatment for the optional webhook signing secret (both source types).
  let webhookSecretEnc: string | null = null;
  if (d.webhook_secret) {
    if (!c.env.BYOK_DEK) {
      return c.json(gatewayError("Server is not configured to store secrets", "server_error", "dek_missing", requestId), 500);
    }
    try {
      webhookSecretEnc = bytesToPostgresBytea(await encryptAesGcm(d.webhook_secret, c.env.BYOK_DEK));
    } catch {
      return c.json(gatewayError("Failed to encrypt webhook secret", "server_error", "encryption_failed", requestId), 500);
    }
  }

  const { data, error } = await supabase
    .schema("inference")
    .from("connectors")
    .insert({
      org_id: auth.orgId,
      collection_id: collectionId,
      kind: d.kind,
      display_name: d.display_name,
      config: d.config,
      credential_enc: credentialEnc,
      webhook_url: d.webhook_url ?? null,
      webhook_secret_enc: webhookSecretEnc,
      sync_schedule: d.sync_schedule,
    })
    .select(CONNECTOR_COLS)
    .single<ConnectorDbRow>();

  if (error || !data) {
    if (error?.code === "23505") {
      return c.json(gatewayError(`A connector named "${d.display_name}" already exists on this collection`, "invalid_request_error", "duplicate_name", requestId), 409);
    }
    return c.json(gatewayError(error?.message ?? "Failed to create connector", "server_error", "connector_create_failed", requestId), 400);
  }

  enqueueAudit(c, {
    action: "connector.created",
    targetType: "connector",
    targetId: data.id,
    metadata: { kind: d.kind, display_name: d.display_name, collection_id: collectionId },
  });
  return c.json(toConnectorResponse(data), 201);
};

// GET /v1/connectors/:id — status + last-sync counters.
export const getConnector: Handler<{ Bindings: Env; Variables: HonoVariables }> = async (c) => {
  const auth = c.get("auth");
  const requestId = c.get("requestId");
  const id = c.req.param("id");
  if (!id || !isValidUuid(id)) {
    return c.json(gatewayError("Invalid connector id", "invalid_request_error", "invalid_request", requestId), 400);
  }
  const supabase = makeSupabase(c.env);
  const { data, error } = await supabase
    .schema("inference")
    .from("connectors")
    .select(CONNECTOR_COLS)
    .eq("org_id", auth.orgId)
    .eq("id", id)
    .maybeSingle<ConnectorDbRow>();

  if (error) {
    return c.json(gatewayError("Failed to load connector", "server_error", "connector_load_failed", requestId), 500);
  }
  if (!data) {
    return c.json(gatewayError("Connector not found", "invalid_request_error", "connector_not_found", requestId), 404);
  }
  return c.json(toConnectorResponse(data));
};

// PATCH /v1/connectors/:id — edit config/schedule/credential/webhook. kind immutable.
export const updateConnector: Handler<{ Bindings: Env; Variables: HonoVariables }> = async (c) => {
  const auth = c.get("auth");
  const requestId = c.get("requestId");
  const id = c.req.param("id");
  if (!id || !isValidUuid(id)) {
    return c.json(gatewayError("Invalid connector id", "invalid_request_error", "invalid_request", requestId), 400);
  }

  const raw = await readJson(c);
  if (raw === undefined) {
    return c.json(gatewayError("Invalid JSON body", "invalid_request_error", "invalid_json", requestId), 400);
  }
  const parsed = updateConnectorSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      gatewayError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), "invalid_request_error", "invalid_request", requestId),
      400
    );
  }
  const d = parsed.data;

  const supabase = makeSupabase(c.env);

  // A config patch is validated against the connector's stored kind (kind is
  // immutable, so the row is the only place it lives).
  let existingKind: "s3" | "web_crawl" | undefined;
  if (d.config || d.credential) {
    const { data: existing } = await supabase
      .schema("inference")
      .from("connectors")
      .select("kind")
      .eq("org_id", auth.orgId)
      .eq("id", id)
      .maybeSingle<{ kind: "s3" | "web_crawl" }>();
    if (!existing) {
      return c.json(gatewayError("Connector not found", "invalid_request_error", "connector_not_found", requestId), 404);
    }
    existingKind = existing.kind;
  }

  let config: Record<string, unknown> | undefined;
  if (d.config) {
    const checked = validateConfigForKind(existingKind!, d.config);
    if (!checked.ok) {
      return c.json(gatewayError(checked.message, "invalid_request_error", "invalid_request", requestId), 400);
    }
    config = checked.config;
  }

  // Re-encrypt only if a NEW credential was supplied — omitted = keep existing.
  let credentialEnc: string | undefined;
  if (d.credential) {
    if (existingKind !== "s3") {
      return c.json(gatewayError("Only S3 connectors can store source credentials", "invalid_request_error", "invalid_request", requestId), 400);
    }
    if (!c.env.BYOK_DEK) {
      return c.json(gatewayError("Server is not configured to store source credentials", "server_error", "dek_missing", requestId), 500);
    }
    try {
      credentialEnc = bytesToPostgresBytea(await encryptAesGcm(JSON.stringify(d.credential), c.env.BYOK_DEK));
    } catch {
      return c.json(gatewayError("Failed to encrypt credentials", "server_error", "encryption_failed", requestId), 500);
    }
  }

  // null = explicitly clear the secret (back to unsigned); undefined = keep.
  let webhookSecretEnc: string | null | undefined;
  if (d.webhook_secret === null) {
    webhookSecretEnc = null;
  } else if (d.webhook_secret) {
    if (!c.env.BYOK_DEK) {
      return c.json(gatewayError("Server is not configured to store secrets", "server_error", "dek_missing", requestId), 500);
    }
    try {
      webhookSecretEnc = bytesToPostgresBytea(await encryptAesGcm(d.webhook_secret, c.env.BYOK_DEK));
    } catch {
      return c.json(gatewayError("Failed to encrypt webhook secret", "server_error", "encryption_failed", requestId), 500);
    }
  }

  const patch: Record<string, unknown> = {
    display_name: d.display_name,
    config,
    sync_schedule: d.sync_schedule,
    credential_enc: credentialEnc,
    webhook_url: d.webhook_url, // null clears it, undefined leaves it (stripped below)
    webhook_secret_enc: webhookSecretEnc,
  };
  for (const k of Object.keys(patch)) if (patch[k] === undefined) delete patch[k];

  const { data, error } = await supabase
    .schema("inference")
    .from("connectors")
    .update(patch)
    .eq("org_id", auth.orgId)
    .eq("id", id)
    .select(CONNECTOR_COLS)
    .maybeSingle<ConnectorDbRow>();

  if (error) {
    if (error.code === "23505") {
      return c.json(
        gatewayError("A connector with that name already exists on this collection", "invalid_request_error", "duplicate_name", requestId),
        409
      );
    }
    return c.json(gatewayError(error.message, "server_error", "connector_update_failed", requestId), 400);
  }
  if (!data) {
    return c.json(gatewayError("Connector not found", "invalid_request_error", "connector_not_found", requestId), 404);
  }

  enqueueAudit(c, { action: "connector.updated", targetType: "connector", targetId: id, metadata: { fields: Object.keys(d) } });
  return c.json(toConnectorResponse(data));
};

// DELETE /v1/connectors/:id — remove the connector. ?purge=true also deletes
// the vector_rows it produced (otherwise those rows are left in place — the
// customer may want the already-ingested content to persist).
export const deleteConnector: Handler<{ Bindings: Env; Variables: HonoVariables }> = async (c) => {
  const auth = c.get("auth");
  const requestId = c.get("requestId");
  const id = c.req.param("id");
  if (!id || !isValidUuid(id)) {
    return c.json(gatewayError("Invalid connector id", "invalid_request_error", "invalid_request", requestId), 400);
  }
  const purge = c.req.query("purge") === "true";
  const supabase = makeSupabase(c.env);

  // Load first so we can purge rows before the cascade removes the ledger.
  const { data: conn } = await supabase
    .schema("inference")
    .from("connectors")
    .select("id, collection_id, status")
    .eq("org_id", auth.orgId)
    .eq("id", id)
    .maybeSingle<{ id: string; collection_id: string; status: string }>();
  if (!conn) {
    return c.json(gatewayError("Connector not found", "invalid_request_error", "connector_not_found", requestId), 404);
  }
  // Deleting mid-sync orphans rows: the ledger cascades away, but vector_rows
  // has no FK to connectors, so anything the running sync writes AFTER the
  // purge survives as conn-{dead-id}-* rows that nothing can ever clean up
  // (invisible to the UI, still counted against the collection's quota).
  // Make the caller stop the sync first — the watchdog frees a stuck one.
  if (conn.status === "syncing") {
    return c.json(
      gatewayError(
        "This connector is syncing right now — wait for it to finish, then delete it.",
        "invalid_request_error",
        "connector_syncing",
        requestId
      ),
      409
    );
  }

  if (purge) {
    // Delete every vector_row this connector produced. Rows are keyed
    // external_id = "conn-{connectorId}-...", so a prefix match removes them in
    // ONE query that scales to any doc count — unlike an IN-list of thousands
    // of external_ids, which would overflow PostgREST's URL length (414) and
    // silently fail to purge. A purge failure ABORTS the delete: dropping the
    // connector row anyway would orphan its vector rows with no id left to find
    // them by. (id is a validated UUID — no LIKE metacharacters.)
    const { error: purgeError } = await supabase
      .schema("inference")
      .from("vector_rows")
      .delete()
      .eq("collection_id", conn.collection_id)
      .like("external_id", `conn-${id}-%`);
    if (purgeError) {
      return c.json(gatewayError("Failed to purge connector rows", "server_error", "connector_purge_failed", requestId), 500);
    }
  }

  const { error } = await supabase
    .schema("inference")
    .from("connectors")
    .delete()
    .eq("org_id", auth.orgId)
    .eq("id", id);

  if (error) {
    return c.json(gatewayError(error.message, "server_error", "connector_delete_failed", requestId), 500);
  }

  enqueueAudit(c, { action: "connector.deleted", targetType: "connector", targetId: id, metadata: { purged: purge } });
  return c.json({ id, object: "connector" as const, deleted: true, purged: purge });
};

// POST /v1/connectors/:id/sync — trigger a sync now. Flips an idle/error
// connector to 'queued' (+ next_sync_at=now()); the data-runner claims it. A
// connector already 'queued'/'syncing' is a no-op (returns its current state).
export const syncConnector: Handler<{ Bindings: Env; Variables: HonoVariables }> = async (c) => {
  const auth = c.get("auth");
  const requestId = c.get("requestId");
  const id = c.req.param("id");
  if (!id || !isValidUuid(id)) {
    return c.json(gatewayError("Invalid connector id", "invalid_request_error", "invalid_request", requestId), 400);
  }
  const supabase = makeSupabase(c.env);

  // Only an idle/error connector can be queued — win the transition atomically
  // so two "sync now" clicks don't double-queue.
  const { data, error } = await supabase
    .schema("inference")
    .from("connectors")
    .update({ status: "queued", next_sync_at: new Date().toISOString(), last_error: null })
    .eq("org_id", auth.orgId)
    .eq("id", id)
    .in("status", ["idle", "error"])
    .select(CONNECTOR_COLS)
    .maybeSingle<ConnectorDbRow>();

  if (error) {
    return c.json(gatewayError("Failed to trigger sync", "server_error", "connector_sync_failed", requestId), 500);
  }
  if (!data) {
    // Either it doesn't exist in this org, or it's already queued/syncing.
    const { data: existing } = await supabase
      .schema("inference")
      .from("connectors")
      .select(CONNECTOR_COLS)
      .eq("org_id", auth.orgId)
      .eq("id", id)
      .maybeSingle<ConnectorDbRow>();
    if (!existing) {
      return c.json(gatewayError("Connector not found", "invalid_request_error", "connector_not_found", requestId), 404);
    }
    if (existing.status === "disabled") {
      return c.json(gatewayError("Connector is disabled", "invalid_request_error", "connector_disabled", requestId), 409);
    }
    return c.json(toConnectorResponse(existing), 202); // already in flight — idempotent
  }

  return c.json(toConnectorResponse(data), 202);
};

// GET /v1/connectors/:id/documents — per-document sync status (paginated).
export const listConnectorDocuments: Handler<{ Bindings: Env; Variables: HonoVariables }> = async (c) => {
  const auth = c.get("auth");
  const requestId = c.get("requestId");
  const id = c.req.param("id");
  if (!id || !isValidUuid(id)) {
    return c.json(gatewayError("Invalid connector id", "invalid_request_error", "invalid_request", requestId), 400);
  }
  const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 50) || 50, 1), 200);
  const offset = Math.max(Number(c.req.query("offset") ?? 0) || 0, 0);
  const supabase = makeSupabase(c.env);

  const { data: connector, error: connectorError } = await supabase
    .schema("inference")
    .from("connectors")
    .select("id")
    .eq("id", id)
    .eq("org_id", auth.orgId)
    .maybeSingle<{ id: string }>();
  if (connectorError) {
    return c.json(gatewayError("Failed to load connector", "server_error", "connector_load_failed", requestId), 500);
  }
  if (!connector) {
    return c.json(gatewayError("Connector not found", "invalid_request_error", "connector_not_found", requestId), 404);
  }

  // org-scope via the denormalized org_id column (RLS-equivalent app-side check).
  const { data, error } = await supabase
    .schema("inference")
    .from("connector_documents")
    .select("id, source_uri, status, chunk_count, error, updated_at")
    .eq("connector_id", id)
    .eq("org_id", auth.orgId)
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1)
    .returns<Array<{ id: string; source_uri: string; status: string; chunk_count: number; error: string | null; updated_at: string }>>();

  if (error) {
    return c.json(gatewayError("Failed to list connector documents", "server_error", "connector_documents_failed", requestId), 500);
  }
  return c.json({ object: "list" as const, data: data ?? [] });
};
