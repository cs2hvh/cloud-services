// GET /api/admin/inference/rag — vector storage, connectors and documents per org.
//
// §3 of nextstespsAI/21-admin-platform.md lists vector collections as having no
// operator surface at all. This is the `see` half; the `limit` (quota) lever still
// requires a code change in three files — the response says so rather than
// implying an admin can raise a quota today.
//
// The quota figure is the SUM OF `vector_collections.row_count`, because that is
// what lib/inference/vector-quota.ts compares against. Counting vector_rows would
// give a different number from the one actually enforced.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { inferenceAdminClient } from "@/lib/admin/inference-client";
import {
  ENFORCED_VECTOR_QUOTA,
  rollupByOrg,
  sortByRisk,
  summarize,
  type ActualCounts,
  type CollectionRow,
  type ConnectorRow,
  type DocumentRow,
} from "@/lib/admin/rag-ops";

export const dynamic = "force-dynamic";

/**
 * Counting vector_rows is opt-in via ?verify=1.
 *
 * It is the only way to detect drift in the cached counter the quota trusts, but
 * it reads every row id in the table — fine at 166 rows, not something to do on
 * every page load once a customer has a real corpus.
 */
const VERIFY_PAGE = 1_000;
const VERIFY_MAX_PAGES = 50;

export async function GET(req: NextRequest) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const verify = req.nextUrl.searchParams.get("verify") === "1";
  const supabase = inferenceAdminClient();
  const inf = () => supabase.schema("inference");

  const [colRes, connRes, docRes, orgRes] = await Promise.all([
    inf()
      .from("vector_collections")
      .select(
        "id, name, org_id, row_count, size_bytes, dimensions, embedding_model_id, index_type, created_at, updated_at"
      )
      .returns<CollectionRow[]>(),
    inf()
      .from("connectors")
      .select(
        "id, org_id, collection_id, display_name, kind, status, sync_schedule, last_error, last_synced_at, next_sync_at, docs_total, docs_failed"
      )
      .returns<ConnectorRow[]>(),
    inf().from("connector_documents").select("connector_id, status, chunk_count").returns<DocumentRow[]>(),
    inf().from("orgs").select("id, name").is("deleted_at", null).returns<Array<{ id: string; name: string | null }>>(),
  ]);

  const firstError = colRes.error ?? connRes.error ?? docRes.error ?? orgRes.error;
  if (firstError) return NextResponse.json({ error: firstError.message }, { status: 500 });

  const collections = colRes.data ?? [];
  const connectors = connRes.data ?? [];
  const documents = docRes.data ?? [];
  const orgNames: Record<string, string> = {};
  for (const o of orgRes.data ?? []) orgNames[o.id] = o.name ?? "(unnamed)";

  // Drift check: page through vector_rows so a PostgREST cap cannot silently
  // under-count and invent drift that does not exist.
  let actual: ActualCounts | null = null;
  let verifyTruncated = false;
  if (verify) {
    actual = {};
    for (let page = 0; page < VERIFY_MAX_PAGES; page++) {
      const from = page * VERIFY_PAGE;
      const { data, error } = await inf()
        .from("vector_rows")
        .select("collection_id")
        .range(from, from + VERIFY_PAGE - 1)
        .returns<Array<{ collection_id: string }>>();
      if (error) {
        actual = null; // a partial count would fabricate drift — report none instead
        break;
      }
      const batch = data ?? [];
      for (const r of batch) actual[r.collection_id] = (actual[r.collection_id] ?? 0) + 1;
      if (batch.length < VERIFY_PAGE) break;
      if (page === VERIFY_MAX_PAGES - 1) verifyTruncated = true;
    }
    if (verifyTruncated) actual = null;
  }

  const orgs = sortByRisk(rollupByOrg(collections, connectors, documents, orgNames, actual));

  return NextResponse.json({
    quota: {
      per_org: ENFORCED_VECTOR_QUOTA,
      /** Where the number the gate reads comes from. */
      enforced_from: "sum of inference.vector_collections.row_count",
      /**
       * Stated plainly: the customer-facing error invites them to contact support,
       * and support cannot act. Raising the ceiling means editing three files and
       * redeploying, so no admin control is offered here rather than a fake one.
       */
      adjustable: false,
      adjustable_note:
        "The quota is hardcoded in lib/inference/vector-quota.ts, workers/data-runner/src/lifecycle.ts " +
        "and workers/inference/src/routes/vector-collections.ts. The error customers see says " +
        "'contact support to raise your limit', but there is no per-org override to set — raising it " +
        "requires a code change in all three files plus a redeploy.",
    },
    verify: {
      requested: verify,
      /** Null actual counts mean drift could not be established, not that it is zero. */
      counted: actual !== null,
      truncated: verifyTruncated,
      note: verify
        ? "Vector rows were counted to check the cached row_count the quota relies on."
        : "Add ?verify=1 to count vector_rows and detect drift in the cached counter.",
    },
    summary: summarize(orgs),
    orgs,
  });
}
