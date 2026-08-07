// GET /api/admin/inference/overview — one row per AI capability: used? broken?
//
// The admin had a page per subsystem and nothing answering the two questions an
// operator asks first. See lib/admin/feature-health.ts for why this is a registry.
//
// EVERY FIGURE IS AN EXACT DATABASE COUNT (`head: true, count: "exact"`), not a
// fetched array measured client side. PostgREST caps a response at 1,000 rows
// without erroring, so counting rows we fetched would plateau silently — exactly
// how an earlier draft of the billing route reported $8.63 as a total when it was
// a floor.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { inferenceAdminClient } from "@/lib/admin/inference-client";
import {
  CAPABILITIES,
  judge,
  shouldMeasureFailures,
  sortByConcern,
  sortByUsage,
  summarize,
  type CapabilityCounts,
  type CapabilitySpec,
} from "@/lib/admin/feature-health";

export const dynamic = "force-dynamic";

const DEFAULT_DAYS = 30;
const MAX_DAYS = 365;
/**
 * Rows sampled purely to count DISTINCT customers, which PostgREST cannot do.
 * Bounded and reported: an adoption number derived from a capped sample is a
 * floor, and the response says so rather than implying precision.
 */
const ORG_SAMPLE = 1_000;

export async function GET(req: NextRequest) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const days = Math.min(Math.max(Number(req.nextUrl.searchParams.get("days")) || DEFAULT_DAYS, 1), MAX_DAYS);
  const sinceIso = new Date(Date.now() - days * 86_400_000).toISOString();
  const sortMode = req.nextUrl.searchParams.get("sort") === "concern" ? "concern" : "usage";

  const supabase = inferenceAdminClient();
  const now = Date.now();
  let orgSampleCapped = false;

  const measure = async (spec: CapabilitySpec): Promise<CapabilityCounts> => {
    const tbl = () => supabase.schema(spec.schema).from(spec.table);
    const base: CapabilityCounts = {
      key: spec.key,
      total: null,
      recent: null,
      failures: null,
      failure_error: null,
      orgs: null,
      last_activity: null,
      error: null,
    };

    // Total ever — head request, so no rows cross the wire.
    const totalRes = await tbl().select("*", { count: "exact", head: true });
    if (totalRes.error) return { ...base, error: totalRes.error.message };
    const total = totalRes.count ?? 0;

    // Rows in the window.
    const recentRes = await tbl()
      .select("*", { count: "exact", head: true })
      .gte(spec.time_column, sinceIso);
    if (recentRes.error) return { ...base, total, error: recentRes.error.message };
    const recent = recentRes.count ?? 0;

    // Failures in the window — only when the table actually has a status concept.
    // Otherwise null, so the UI can say "cannot be counted" instead of "zero".
    let failures: number | null = null;
    let failureError: string | null = null;
    if (shouldMeasureFailures(spec)) {
      const failRes = await tbl()
        .select("*", { count: "exact", head: true })
        .gte(spec.time_column, sinceIso)
        .in(spec.status_column!, spec.failure_statuses);
      // A rejected filter (e.g. a status value the enum does not define) must be
      // reported, not folded into "this table has no status".
      if (failRes.error) failureError = failRes.error.message;
      else failures = failRes.count ?? 0;
    }

    // Newest row, for "last activity" — one row, ordered on an indexed column.
    let lastActivity: string | null = null;
    if (total > 0) {
      const { data } = await tbl()
        .select(spec.time_column)
        .order(spec.time_column, { ascending: false })
        .limit(1)
        .returns<Array<Record<string, unknown>>>();
      const v = data?.[0]?.[spec.time_column];
      if (typeof v === "string") lastActivity = v;
    }

    // Distinct customers in the window. PostgREST has no COUNT(DISTINCT), so this
    // samples ids — bounded, and flagged when the bound is hit.
    let orgs: number | null = null;
    if (spec.org_column && recent > 0) {
      const { data, error } = await tbl()
        .select(spec.org_column)
        .gte(spec.time_column, sinceIso)
        .limit(ORG_SAMPLE)
        .returns<Array<Record<string, unknown>>>();
      if (!error && data) {
        orgs = new Set(data.map((r) => r[spec.org_column!]).filter(Boolean)).size;
        if (data.length >= ORG_SAMPLE) orgSampleCapped = true;
      }
    }

    return { ...base, total, recent, failures, failure_error: failureError, orgs, last_activity: lastActivity };
  };

  const counts = await Promise.all(CAPABILITIES.map(measure));
  const judged = CAPABILITIES.map((spec, i) => judge(spec, counts[i], now));
  const rows = sortMode === "concern" ? sortByConcern(judged) : sortByUsage(judged);

  return NextResponse.json({
    window: { days, since: sinceIso, sort: sortMode },
    /** Honest about the one figure that is a sample rather than a count. */
    sampling: {
      org_counts_are_sampled: true,
      org_sample_limit: ORG_SAMPLE,
      org_sample_capped: orgSampleCapped,
      note:
        "Customer counts sample up to " +
        ORG_SAMPLE +
        " rows per capability because PostgREST cannot COUNT(DISTINCT). Row and " +
        "failure counts are exact database counts. If a sample is capped it is a floor.",
    },
    summary: summarize(judged),
    capabilities: rows,
  });
}
