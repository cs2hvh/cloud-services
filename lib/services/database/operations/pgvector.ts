/**
 * Enable the pgvector extension on a customer's managed PostgreSQL cluster.
 *
 * DigitalOcean has no API to manage extensions, so we connect to the cluster
 * (once it's online) with the stored connection URI and run a fixed, idempotent
 * `CREATE EXTENSION IF NOT EXISTS vector;`. Called from the status-check path
 * when a PG cluster the customer opted into is online and not yet applied — it
 * retries on each status check until it succeeds, then stamps
 * pgvector_applied_at so it never runs again.
 *
 * Best-effort: failures are logged and swallowed (the read path is never broken
 * by a DB-connection hiccup); the next status check retries.
 */
// `pg` is a direct runtime dependency but ships no bundled types and
// @types/pg isn't installed, so the import has no declaration. Suppress it;
// we use only Client(config) / connect / query / end.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - no type declarations for "pg"
import { Client } from "pg";

import { Database_Clusters } from "@/lib/supabase/queries/database_clusters";

const CREATE_EXTENSION_SQL = "CREATE EXTENSION IF NOT EXISTS vector";
const CONNECT_TIMEOUT_MS = 8000;

export async function applyPgvectorIfPending(args: {
  /** Our database_cluster row id (used to stamp pgvector_applied_at). */
  clusterId: string;
  engine: string | null | undefined;
  enabled: boolean;
  alreadyApplied: boolean;
  /** Decrypted connection URI (includes user/password/host/db). */
  uri: string | null | undefined;
  /** Decrypted CA certificate for TLS verification (DO requires SSL). */
  caCertificate?: string | null;
}): Promise<void> {
  // Cheap no-op for the common case: not opted in, already done, not PG, or no
  // connection string yet. Only a pending PG cluster actually connects.
  if (!args.enabled || args.alreadyApplied || args.engine !== "pg" || !args.uri) {
    return;
  }

  const client = new Client({
    connectionString: args.uri,
    // Verify against DO's CA when we have it; otherwise still use TLS but skip
    // verification (DO mandates SSL — a plaintext connection would be refused).
    ssl: args.caCertificate
      ? { ca: args.caCertificate, rejectUnauthorized: true }
      : { rejectUnauthorized: false },
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    statement_timeout: CONNECT_TIMEOUT_MS,
    query_timeout: CONNECT_TIMEOUT_MS,
  });

  try {
    await client.connect();
    await client.query(CREATE_EXTENSION_SQL);
    await Database_Clusters.update_pgvector_applied(args.clusterId);
    console.log(
      JSON.stringify({
        level: "info",
        scope: "db-pgvector",
        message: "pgvector extension enabled",
        clusterId: args.clusterId,
      })
    );
  } catch (err) {
    console.warn(
      JSON.stringify({
        level: "warn",
        scope: "db-pgvector",
        message: "Failed to enable pgvector; will retry on next status check",
        clusterId: args.clusterId,
        err: err instanceof Error ? err.message : String(err),
      })
    );
  } finally {
    await client.end().catch(() => {});
  }
}
