/**
 * Per-org vector storage quota — shared by every route that adds rows to a
 * collection (upsert, ingest-url, ingest-file), so the cap and its error
 * shape can't drift between them.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const MAX_VECTORS_PER_ORG = 1_000_000;

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
  const { data: orgCollections, error: quotaErr } = await supabase
    .schema("inference")
    .from("vector_collections")
    .select("row_count")
    .eq("org_id", orgId);
  if (quotaErr) {
    return { ok: false, response: NextResponse.json({ error: "Could not verify storage quota" }, { status: 500 }) };
  }
  const currentVectors = (orgCollections ?? []).reduce(
    (sum, c) => sum + (Number((c as { row_count: number | null }).row_count) || 0),
    0
  );
  if (currentVectors + incomingRowCount > MAX_VECTORS_PER_ORG) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: `Vector storage limit reached (${MAX_VECTORS_PER_ORG.toLocaleString()} vectors per org). Delete unused vectors, or contact support to raise your limit.`,
          code: "vector_quota_exceeded",
        },
        { status: 403 }
      ),
    };
  }
  return { ok: true };
}
