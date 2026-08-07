// GET /api/admin/inference/rag — vector storage, connectors and documents per org.
//
// §3 of nextstespsAI/21-admin-platform.md lists vector collections as having no
// operator surface at all. This is the `see` half; the `limit` (quota) lever
// landed on 2026-08-04 — `inference.orgs.vector_quota` (migration
// 20260804000001) is set via PUT /api/admin/inference/orgs, and all three
// enforcement points read it. Each org's row now reports ITS ceiling, not the
// platform default.
//
// The quota figure is the SUM OF `vector_collections.row_count`, because that is
// what lib/inference/vector-quota.ts compares against. Counting vector_rows would
// give a different number from the one actually enforced.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { inferenceAdminClient } from "@/lib/admin/inference-client";
import { actorContext, billingMeterClosedEntry, recordAdminAudit } from "@/lib/admin/audit";
import {
  DEFAULT_VECTOR_QUOTA,
  rollupByOrg,
  sortByRisk,
  summarize,
  type ActualCounts,
  type CollectionRow,
  type ConnectorRow,
  type DocumentRow,
  summarizeBillingIntegrity,
  type RagQuotaInfo,
  type VectorBillingRow,
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
    inf()
      .from("orgs")
      .select("id, name, vector_quota")
      .is("deleted_at", null)
      .returns<Array<{ id: string; name: string | null; vector_quota: number | null }>>(),
  ]);

  // The billing meters, read beside the collections they are supposed to track.
  // A failure here must NOT fail the page — the rest of the RAG view is still
  // useful — but it must also never be reported as "no issues found".
  const meterRes = await supabase
    .schema("billing")
    .from("active_inference_vector")
    .select("service_id, user_id, hourly_rate, status")
    .returns<VectorBillingRow[]>();

  const firstError = colRes.error ?? connRes.error ?? docRes.error ?? orgRes.error;
  if (firstError) return NextResponse.json({ error: firstError.message }, { status: 500 });

  const collections = colRes.data ?? [];
  const connectors = connRes.data ?? [];
  const documents = docRes.data ?? [];
  const orgNames: Record<string, string> = {};
  // Each org's OWN ceiling, so the page reports the number that will actually
  // refuse this customer rather than the platform default.
  const quotaByOrg: Record<string, number | null> = {};
  for (const o of orgRes.data ?? []) {
    orgNames[o.id] = o.name ?? "(unnamed)";
    quotaByOrg[o.id] = o.vector_quota;
  }

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

  const orgs = sortByRisk(rollupByOrg(collections, connectors, documents, orgNames, actual, quotaByOrg));

  // Typed, so a field rename here breaks the component's build rather than its
  // render. See RagQuotaInfo in lib/admin/rag-ops.ts.
  const quota: RagQuotaInfo = {
    default_per_org: DEFAULT_VECTOR_QUOTA,
    /** Where the number the gate reads comes from. */
    enforced_from: "sum of inference.vector_collections.row_count",
    /**
     * True since migration 20260804000001. The customer-facing error has always
     * said "contact support to raise your limit"; support can now actually do it.
     */
    adjustable: true,
    adjustable_note:
      "Set an org's ceiling with PUT /api/admin/inference/orgs { org_id, vector_quota }. " +
      "Null clears the override and returns the org to the platform default. All three " +
      "enforcement points (lib/inference/vector-quota.ts, workers/data-runner, the gateway) " +
      "read the per-org value and fall back to the default.",
    adjust_endpoint: "/api/admin/inference/orgs",
  };

  return NextResponse.json({
    /**
     * Are the meters and the collections in step? Creating a collection inserts
     * a billing row; deleting one is supposed to close it, but that close is
     * best-effort and its failure only reaches a console.warn. This is the check
     * that makes the resulting drift visible — in both directions.
     */
    billing_integrity: summarizeBillingIntegrity(
      collections,
      meterRes.error ? null : (meterRes.data ?? []),
      orgNames,
      meterRes.error?.message ?? null
    ),
    quota,
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


/**
 * POST /api/admin/inference/rag — close an orphaned billing meter.
 *
 * The one mutation this page owns, and it stops a live customer charge: a
 * `billing.active_inference_vector` row still `status='active'` for a collection
 * that no longer exists. See migration 20260806000001 for how they arise.
 *
 * REFUSES TO CLOSE A METER WHOSE COLLECTION IS ALIVE. That is the whole safety
 * property: an operator clicking the wrong row must not silently stop billing a
 * customer we should be charging. The check is re-run here against the database
 * rather than trusted from the page, because the page may be minutes stale.
 */
export async function POST(req: NextRequest) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const serviceId = body?.service_id;
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (!serviceId || typeof serviceId !== "string") {
    return NextResponse.json({ error: "service_id is required" }, { status: 400 });
  }
  if (reason.length < 3) {
    return NextResponse.json({ error: "A reason is required — this stops a customer charge" }, { status: 400 });
  }

  const supabase = inferenceAdminClient();

  // Re-verify against the database. The page's view is a snapshot; a collection
  // could have been recreated with the same id since it rendered.
  const { data: liveCollection } = await supabase
    .schema("inference")
    .from("vector_collections")
    .select("id")
    .eq("id", serviceId)
    .maybeSingle<{ id: string }>();
  if (liveCollection) {
    return NextResponse.json(
      {
        error:
          "That collection still exists, so its meter is correct. Closing it would give the customer free storage.",
        code: "collection_alive",
      },
      { status: 409 }
    );
  }

  const { data: meter } = await supabase
    .schema("billing")
    .from("active_inference_vector")
    .select("service_id, user_id, hourly_rate, status")
    .eq("service_id", serviceId)
    .maybeSingle<{ service_id: string; user_id: string | null; hourly_rate: number | string | null; status: string | null }>();
  if (!meter) return NextResponse.json({ error: "No billing meter with that id" }, { status: 404 });
  if ((meter.status ?? "active") !== "active") {
    return NextResponse.json({ error: "That meter is already closed", code: "already_closed" }, { status: 409 });
  }

  const { error: delErr } = await supabase
    .schema("billing")
    .from("active_inference_vector")
    .delete()
    .eq("service_id", serviceId);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  const monthlyCents =
    meter.hourly_rate === null || !Number.isFinite(Number(meter.hourly_rate))
      ? null
      : Math.round(Number(meter.hourly_rate) * 720 * 100);

  void recordAdminAudit(
    billingMeterClosedEntry(serviceId, null, monthlyCents, reason),
    { userId: adminCheck.userId, email: adminCheck.email },
    actorContext(req)
  );

  return NextResponse.json({
    service_id: serviceId,
    closed: true,
    stopped_monthly_cents: monthlyCents,
    note:
      monthlyCents === null
        ? "Meter closed."
        : `Meter closed — this stops a $${(monthlyCents / 100).toFixed(2)}/month charge. Any amount already billed is not refunded automatically.`,
  });
}
