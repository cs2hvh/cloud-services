/**
 * Per-org vector storage quota — shared by every route that adds rows to a
 * collection (upsert, ingest-url, ingest-file), so the cap and its error
 * shape can't drift between them.
 *
 * PER-ORG SINCE 2026-08-04. The ceiling used to be a module constant, which
 * meant the Vector Storage admin could SEE a customer sitting at their limit and
 * had no way to raise it — doc 21 §5.5 ("quotas belong in data, not constants")
 * and the RAG admin route's own header both said so. `inference.orgs.vector_quota`
 * (migration 20260804000001) now carries a deliberate per-customer override;
 * NULL means "use the platform default", so the default itself still lives in
 * one place and raising it stays a one-line change rather than a data migration.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

/** Ceiling for an org with no explicit override. */
export const DEFAULT_VECTOR_QUOTA = 1_000_000;

/**
 * @deprecated Prefer `resolveVectorQuota()` — an org may have its own ceiling.
 * Retained as the name of the DEFAULT so existing imports stay truthful.
 */
export const MAX_VECTORS_PER_ORG = DEFAULT_VECTOR_QUOTA;

/**
 * This org's ceiling.
 *
 * Falls back to the default on ANY doubt — missing row, unreadable column,
 * negative or non-numeric value. Refusing a customer's writes because the quota
 * lookup itself failed would turn a database hiccup into a data-loss-shaped
 * incident, which is strictly worse than briefly allowing an over-quota write.
 */
export async function resolveVectorQuota(supabase: SupabaseClient, orgId: string): Promise<number> {
  const { data, error } = await supabase
    .schema("inference")
    .from("orgs")
    .select("vector_quota")
    .eq("id", orgId)
    .maybeSingle<{ vector_quota: number | string | null }>();
  if (error || !data || data.vector_quota === null || data.vector_quota === undefined) {
    return DEFAULT_VECTOR_QUOTA;
  }
  const quota = Number(data.vector_quota);
  return Number.isFinite(quota) && quota >= 0 ? quota : DEFAULT_VECTOR_QUOTA;
}

/**
 * Checked before embedding so a batch that would blow the quota fails fast
 * without spending on embed calls. Conservative: treats the whole incoming
 * batch as new rows (an upsert that only updates existing rows undercounts
 * slightly, which is the safe direction to be wrong in).
 */
export async function checkVectorQuota(
  supabase: SupabaseClient,
  orgId: string,
  incomingRowCount: number
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const [quota, collections] = await Promise.all([
    resolveVectorQuota(supabase, orgId),
    supabase.schema("inference").from("vector_collections").select("row_count").eq("org_id", orgId),
  ]);
  if (collections.error) {
    return { ok: false, response: NextResponse.json({ error: "Could not verify storage quota" }, { status: 500 }) };
  }
  const currentVectors = (collections.data ?? []).reduce(
    (sum, c) => sum + (Number((c as { row_count: number | null }).row_count) || 0),
    0
  );
  if (currentVectors + incomingRowCount > quota) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: `Vector storage limit reached (${quota.toLocaleString()} vectors per org). Delete unused vectors, or contact support to raise your limit.`,
          code: "vector_quota_exceeded",
        },
        { status: 403 }
      ),
    };
  }
  return { ok: true };
}
