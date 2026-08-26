import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const WEEKS = 12;

/**
 * Fleet-level aggregates for the Servers overview: status/provider/region
 * breakdowns, weekly growth, revenue run-rate and Linode margin. One row
 * scan, aggregated in memory (fleet-sized data).
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

    const [{ data: servers, error }, { data: types }] = await Promise.all([
      supabase
        .from("servers")
        .select(
          "id, provider, status, location, plan_slug, hourly_cost, monthly_cost, created_at, linode_id",
        )
        .limit(10000),
      supabase.from("linode_types").select("id, hourly_usd"),
    ]);

    if (error) {
      console.error("[Admin Servers] overview failed:", error.message);
      return NextResponse.json(
        { error: "Failed to load overview" },
        { status: 500 },
      );
    }

    const rows = servers ?? [];
    const listPrice = new Map(
      (types ?? []).map((t) => [`linode:${t.id}`, Number(t.hourly_usd) || 0]),
    );

    const byStatus: Record<string, number> = {};
    const byProvider: Record<string, number> = {};
    const byRegion: Record<string, number> = {};
    let mrr = 0;
    let linodeCustomerHourly = 0;
    let linodeListHourly = 0;

    for (const s of rows) {
      const status = s.status || "unknown";
      byStatus[status] = (byStatus[status] || 0) + 1;
      const provider = s.provider || "proxmox";
      byProvider[provider] = (byProvider[provider] || 0) + 1;
      const region = s.location || "unknown";
      byRegion[region] = (byRegion[region] || 0) + 1;

      const billable = status !== "failed" && status !== "error";
      if (billable) {
        mrr += Number(s.monthly_cost) || 0;
        if (provider === "linode") {
          const customer = Number(s.hourly_cost) || 0;
          const list = listPrice.get(s.plan_slug || "") ?? 0;
          if (customer > 0 && list > 0) {
            linodeCustomerHourly += customer;
            linodeListHourly += list;
          }
        }
      }
    }

    // Weekly creation counts for the last WEEKS weeks (weeks start Monday, UTC).
    const now = new Date();
    const day = now.getUTCDay();
    const monday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    monday.setUTCDate(monday.getUTCDate() - ((day + 6) % 7));

    const weekStarts: Date[] = [];
    for (let i = WEEKS - 1; i >= 0; i--) {
      const d = new Date(monday);
      d.setUTCDate(d.getUTCDate() - i * 7);
      weekStarts.push(d);
    }
    const createdSeries = weekStarts.map((start) => {
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 7);
      const count = rows.filter((s) => {
        const t = new Date(s.created_at).getTime();
        return t >= start.getTime() && t < end.getTime();
      }).length;
      return {
        week: `${start.getUTCMonth() + 1}/${start.getUTCDate()}`,
        count,
      };
    });

    // Top regions; fold the tail into "Other" so charts stay readable.
    const regionEntries = Object.entries(byRegion).sort((a, b) => b[1] - a[1]);
    const topRegions = regionEntries.slice(0, 8);
    const otherCount = regionEntries
      .slice(8)
      .reduce((acc, [, n]) => acc + n, 0);
    if (otherCount > 0) topRegions.push(["Other", otherCount]);

    const marginPct =
      linodeListHourly > 0
        ? ((linodeCustomerHourly - linodeListHourly) / linodeListHourly) * 100
        : null;

    return NextResponse.json({
      totals: {
        servers: rows.length,
        running: byStatus["running"] || 0,
        stopped: byStatus["stopped"] || 0,
        provisioning: byStatus["provisioning"] || 0,
        suspended: byStatus["suspended"] || 0,
        issues: (byStatus["failed"] || 0) + (byStatus["error"] || 0),
        mrr: Math.round(mrr * 100) / 100,
        linode: byProvider["linode"] || 0,
        proxmox: byProvider["proxmox"] || 0,
      },
      margin: {
        customerHourly: Math.round(linodeCustomerHourly * 10000) / 10000,
        listHourly: Math.round(linodeListHourly * 10000) / 10000,
        marginPct: marginPct === null ? null : Math.round(marginPct * 10) / 10,
      },
      byStatus: Object.entries(byStatus).map(([status, count]) => ({
        status,
        count,
      })),
      byRegion: topRegions.map(([region, count]) => ({ region, count })),
      createdSeries,
    });
  } catch (err) {
    console.error("[Admin Servers] overview unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
