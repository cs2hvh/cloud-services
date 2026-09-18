import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Media (video/image) generation jobs — inference.media_jobs.
 *
 * Unlike a chat completion, a job is long-running and bills ONCE on
 * completion through the usage queue, so the two states that matter to an
 * operator are: jobs stuck open (a customer is waiting, and we have not
 * billed), and jobs that failed (a customer got nothing).
 *
 * A job whose worker died mid-flight sits in 'running' forever and neither
 * finishes nor bills, so age of the oldest open job is reported explicitly
 * rather than left to be noticed.
 */

/** Past this, an open job is presumed stuck rather than merely slow. */
const STUCK_AFTER_MIN = 30;

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(request.url);
  const days = Math.min(
    30,
    Math.max(1, parseInt(searchParams.get("days") || "7", 10) || 7),
  );
  const status = searchParams.get("status") || "";
  const limit = Math.min(
    200,
    Math.max(10, parseInt(searchParams.get("limit") || "50", 10) || 50),
  );
  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();

  try {
    const supabase = await createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inference = (supabase as any).schema("inference");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const withFilters = (b: any) => {
      let q = b.gte("created_at", since);
      if (status === "open") q = q.in("status", ["queued", "running"]);
      else if (status) q = q.eq("status", status);
      return q;
    };

    const [rowsRes, allRes, orgsRes] = await Promise.all([
      withFilters(
        inference
          .from("media_jobs")
          .select(
            "id, org_id, api_key_id, modality, model_id, status, num_units, unit_label, cost_cents, request_params, error_code, error_message, upstream_job_id, output_url, created_at, updated_at, deadline_at",
          ),
      )
        .order("created_at", { ascending: false })
        .limit(limit),
      // Counts over the window, unfiltered by status, for the summary.
      inference
        .from("media_jobs")
        .select("status, num_units, cost_cents, created_at, modality")
        .gte("created_at", since)
        .limit(1000),
      inference.from("orgs").select("id, slug, name"),
    ]);

    if (rowsRes.error) {
      console.error("[Admin AI] media jobs read failed:", rowsRes.error.message);
      return NextResponse.json(
        { error: "Could not read media jobs" },
        { status: 502 },
      );
    }

    const orgOf = new Map<string, string>(
      ((orgsRes.data ?? []) as { id: string; slug: string; name: string }[]).map(
        (o) => [o.id, o.name || o.slug],
      ),
    );

    const all = (allRes.data ?? []) as {
      status: string;
      num_units: number | null;
      cost_cents: number | null;
      created_at: string;
      modality: string;
    }[];

    const byStatus: Record<string, number> = {};
    let unitsTotal = 0;
    let centsTotal = 0;
    for (const j of all) {
      byStatus[j.status] = (byStatus[j.status] ?? 0) + 1;
      if (j.status === "completed") {
        unitsTotal += Number(j.num_units ?? 0);
        centsTotal += Number(j.cost_cents ?? 0);
      }
    }
    const open = all.filter((j) => j.status === "queued" || j.status === "running");
    const oldestOpen = open.reduce<string | null>(
      (min, j) => (!min || j.created_at < min ? j.created_at : min),
      null,
    );
    const oldestOpenMin = oldestOpen
      ? Math.round((Date.now() - Date.parse(oldestOpen)) / 60000)
      : null;
    const completed = byStatus.completed ?? 0;
    const failed = byStatus.failed ?? 0;

    const rows = (rowsRes.data ?? []) as Record<string, unknown>[];

    return NextResponse.json({
      days,
      summary: {
        total: all.length,
        byStatus,
        open: open.length,
        oldestOpenMin,
        // An open job older than this is not "slow", it is stranded: the
        // customer is waiting and nothing has billed.
        stuck: oldestOpenMin !== null && oldestOpenMin > STUCK_AFTER_MIN,
        stuckAfterMin: STUCK_AFTER_MIN,
        failureRatePct:
          completed + failed > 0 ? (failed / (completed + failed)) * 100 : null,
        unitsBilled: unitsTotal,
        billedUsd: centsTotal / 100,
      },
      jobs: rows.map((j) => {
        const params = (j.request_params ?? {}) as Record<string, unknown>;
        const createdAt = j.created_at as string;
        const isOpen = j.status === "queued" || j.status === "running";
        return {
          id: j.id as string,
          modality: j.modality as string,
          modelId: (j.model_id as string | null) ?? null,
          status: j.status as string,
          org: j.org_id ? (orgOf.get(j.org_id as string) ?? "—") : "—",
          units: j.num_units === null ? null : Number(j.num_units),
          unitLabel: (j.unit_label as string | null) ?? null,
          costUsd: Number(j.cost_cents ?? 0) / 100,
          resolution: (params.resolution as string | null) ?? null,
          duration: (params.duration_seconds as number | null) ?? null,
          ratio: (params.ratio as string | null) ?? null,
          mode: (params.mode as string | null) ?? null,
          // The prompt is customer content: length only, never the text.
          promptChars:
            typeof params.prompt === "string" ? params.prompt.length : null,
          errorCode: (j.error_code as string | null) ?? null,
          errorMessage: (j.error_message as string | null) ?? null,
          upstreamJobId: (j.upstream_job_id as string | null) ?? null,
          hasOutput: Boolean(j.output_url),
          createdAt,
          ageMin: Math.round((Date.now() - Date.parse(createdAt)) / 60000),
          stuck:
            isOpen &&
            Date.now() - Date.parse(createdAt) > STUCK_AFTER_MIN * 60000,
        };
      }),
    });
  } catch (err) {
    console.error("[Admin AI] media jobs unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
