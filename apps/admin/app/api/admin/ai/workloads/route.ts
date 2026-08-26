import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** A deployment counts as metering-stale after this long without a heartbeat. */
const METER_STALE_MS = 2 * 60 * 60 * 1000;

/**
 * Platform-wide GPU workloads: fine-tune jobs, always-on deployments and
 * batch runs, with the two failure modes an operator must see — batches
 * stuck past their completion window, and active deployments whose
 * metering heartbeat (last_metered_at) has gone quiet.
 */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 403 },
    );
  }

  try {
    const supabase = await createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inference = (supabase as any).schema("inference");

    const [ftRes, depRes, batchRes, orgsRes] = await Promise.all([
      inference
        .from("finetunes")
        .select(
          "id, org_id, name, base_model_id, method, status, gpu_sku, training_seconds, cost_cents, error_message, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(100),
      inference
        .from("deployments")
        .select(
          "id, org_id, name, source, source_ref, gpu_sku, autoscale, status, last_metered_at, created_at",
        )
        .neq("status", "deleted")
        .order("created_at", { ascending: false })
        .limit(100),
      inference
        .from("batches")
        .select(
          "id, org_id, endpoint, status, request_counts, created_at, expires_at",
        )
        .order("created_at", { ascending: false })
        .limit(100),
      inference.from("orgs").select("id, slug, name"),
    ]);

    const firstError = ftRes.error || depRes.error || batchRes.error;
    if (firstError) {
      console.error("[Admin AI] workloads query failed:", firstError.message);
      return NextResponse.json(
        { error: "Failed to load workloads" },
        { status: 500 },
      );
    }

    const orgName = new Map<string, string>(
      (orgsRes.data ?? []).map(
        (o: { id: string; slug: string; name: string | null }): [string, string] => [
          o.id,
          o.name || o.slug,
        ],
      ),
    );
    const now = Date.now();

    // The return annotation keeps the index signature: without it the object
    // spread narrows to { org_id, org_label } and every column access below
    // stops type-checking.
    type Row = Record<string, unknown> & { org_id: string };
    const withOrg = (rows: Row[]): (Row & { org_label: string })[] =>
      rows.map((r) => ({ ...r, org_label: orgName.get(r.org_id) ?? r.org_id }));

    const finetunes = withOrg(ftRes.data ?? []);
    const deployments = withOrg(depRes.data ?? []).map((d) => ({
      ...d,
      metering_stale:
        d.status === "active" &&
        (!d.last_metered_at ||
          now - new Date(d.last_metered_at as string).getTime() >
            METER_STALE_MS),
    }));
    const batches = withOrg(batchRes.data ?? []).map((b) => ({
      ...b,
      stuck:
        ["validating", "in_progress", "finalizing", "cancelling"].includes(
          b.status as string,
        ) &&
        !!b.expires_at &&
        new Date(b.expires_at as string).getTime() < now,
    }));

    const count = (rows: Array<Record<string, unknown>>, statuses: string[]) =>
      rows.filter((r) => statuses.includes(String(r.status))).length;

    return NextResponse.json({
      summary: {
        ftActive: count(finetunes, ["queued", "preparing", "running"]),
        ftFailed: count(finetunes, ["failed"]),
        ftSpend:
          Math.round(
            finetunes.reduce(
              (acc, f) => acc + (Number(f.cost_cents) || 0),
              0,
            ),
          ) / 100,
        depActive: count(deployments, ["active"]),
        depBuilding: count(deployments, ["building", "deploying"]),
        depFailed: count(deployments, ["failed"]),
        depStale: deployments.filter((d) => d.metering_stale).length,
        batchInFlight: count(batches, [
          "validating",
          "in_progress",
          "finalizing",
        ]),
        batchStuck: batches.filter((b) => b.stuck).length,
        batchFailed: count(batches, ["failed", "expired"]),
      },
      finetunes,
      deployments,
      batches,
    });
  } catch (err) {
    console.error("[Admin AI] workloads unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
