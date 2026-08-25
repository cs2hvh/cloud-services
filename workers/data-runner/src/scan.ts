import type { SupabaseClient } from "@supabase/supabase-js";
import type { EnqueueRequest, Logger } from "@ahura/runner-core";

export type ConnectorKind = "s3" | "web_crawl";

export interface SyncJob {
  connectorId: string;
  collectionId: string;
  orgId: string;
  kind: ConnectorKind;
}

/**
 * Return up to `limit` queued connectors to enqueue via the BullMQ claimer.
 * The atomic queued→syncing transition happens in lifecycle, so two replicas
 * (or two concurrent workers) can never sync the same connector.
 *
 * Per-org fairness (doc 20 §4.3): a connector is skipped if its org already has
 * a sync in flight, and at most one connector per org is claimed per tick — so
 * one org's many/large connectors can't monopolize every concurrency slot while
 * another org's connector waits. Best-effort (a race can't cause a double-claim —
 * the atomic claim guarantees that; fairness just avoids obvious monopolization).
 */
export async function scanConnectors(
  supabase: SupabaseClient,
  logger: Logger,
  limit: number
): Promise<EnqueueRequest<SyncJob>[]> {
  // Orgs with a sync already running — skip their queued connectors this tick.
  const { data: inflight, error: inflightErr } = await supabase
    .schema("inference")
    .from("connectors")
    .select("org_id")
    .eq("status", "syncing")
    .returns<Array<{ org_id: string }>>();
  if (inflightErr) {
    logger.error({ err: inflightErr.message }, "connector scan (inflight) failed");
    return [];
  }
  const busyOrgs = new Set((inflight ?? []).map((r) => r.org_id));

  // Over-fetch queued rows so fairness filtering still fills the batch.
  const { data, error } = await supabase
    .schema("inference")
    .from("connectors")
    .select("id, collection_id, org_id, kind, next_sync_at")
    .eq("status", "queued")
    .order("next_sync_at", { ascending: true, nullsFirst: true })
    .limit(limit * 4)
    .returns<Array<{ id: string; collection_id: string; org_id: string; kind: ConnectorKind; next_sync_at: string | null }>>();
  if (error) {
    logger.error({ err: error.message }, "connector scan failed");
    return [];
  }

  const claimedOrgs = new Set<string>();
  const out: EnqueueRequest<SyncJob>[] = [];
  for (const c of data ?? []) {
    if (busyOrgs.has(c.org_id) || claimedOrgs.has(c.org_id)) continue; // one per org per tick
    claimedOrgs.add(c.org_id);
    out.push({
      name: "connector-sync",
      // jobId must be unique per SYNC, not per connector: a connector re-syncs
      // repeatedly under the same id, but BullMQ retains completed jobs (~24h)
      // and rejects re-adding a duplicate jobId — which would silently strand
      // every re-sync at 'queued' until the old job aged out (found live, C2).
      // next_sync_at changes on every queue-transition (sync-now sets now();
      // the scheduler advances it each cycle), so it's the natural per-sync key.
      // Still deterministic within one transition → restart re-scans dedupe.
      // Epoch-ms, not the ISO string — BullMQ jobIds cannot contain ':' (found
      // live, C2), which the ISO time has; the UUID + '-' + digits is safe.
      jobId: `${c.id}-${c.next_sync_at ? Date.parse(c.next_sync_at) : "initial"}`,
      data: { connectorId: c.id, collectionId: c.collection_id, orgId: c.org_id, kind: c.kind },
    });
    if (out.length >= limit) break;
  }
  return out;
}
