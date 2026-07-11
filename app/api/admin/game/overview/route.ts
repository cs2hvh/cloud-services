import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { listRegionHeadrooms } from "@/lib/services/game/host-selection";

export const dynamic = "force-dynamic";

// GET /api/admin/game/overview — headline stats for the admin console.
export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createServiceClient();

  // Pull all non-terminated servers once and aggregate in memory (fleet is small).
  const { data: servers, error } = await supabase
    .from("game_servers")
    .select("status, game_type, region, monthly_price, host_id, details")
    .neq("status", "terminated");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = servers ?? [];
  const byStatus: Record<string, number> = {};
  const byGame: Record<string, number> = {};
  const byRegion: Record<string, number> = {};
  let mrr = 0;

  for (const s of rows) {
    const st = s.status ?? "unknown";
    byStatus[st] = (byStatus[st] ?? 0) + 1;
    byGame[s.game_type] = (byGame[s.game_type] ?? 0) + 1;
    if (s.region) byRegion[s.region] = (byRegion[s.region] ?? 0) + 1;
    if (st === "active" || st === "installing" || st === "provisioning") mrr += Number(s.monthly_price ?? 0);
  }

  // Host counts + per-region live capacity headroom.
  const [{ data: hosts }, headrooms] = await Promise.all([
    supabase.from("game_hosts").select("id, region, display_region, status, total_memory_mb, total_disk_gb"),
    listRegionHeadrooms().catch(() => []),
  ]);

  const hostRows = (hosts ?? []) as Array<{
    id: string;
    region: string;
    display_region: string;
    status: string;
    total_memory_mb: number;
    total_disk_gb: number;
  }>;

  // Used RAM per host from server details.limits (same source host-selection uses).
  const usedMemByRegion: Record<string, number> = {};
  const totalMemByRegion: Record<string, { used: number; total: number; display: string; hosts: number; online: number }> = {};
  for (const h of hostRows) {
    const r = (totalMemByRegion[h.region] ??= { used: 0, total: 0, display: h.display_region, hosts: 0, online: 0 });
    r.total += h.total_memory_mb;
    r.hosts += 1;
    if (h.status === "online") r.online += 1;
  }
  for (const s of rows) {
    if (!s.region) continue;
    const mem = (s.details as { limits?: { memory?: number } } | null)?.limits?.memory ?? 0;
    usedMemByRegion[s.region] = (usedMemByRegion[s.region] ?? 0) + Number(mem);
  }
  for (const region of Object.keys(totalMemByRegion)) {
    totalMemByRegion[region].used = usedMemByRegion[region] ?? 0;
  }

  return NextResponse.json({
    ok: true,
    totals: {
      servers: rows.length,
      active: byStatus["active"] ?? 0,
      suspended: byStatus["suspended"] ?? 0,
      failed: byStatus["failed"] ?? 0,
      provisioning: (byStatus["provisioning"] ?? 0) + (byStatus["installing"] ?? 0),
      hosts: hostRows.length,
      hostsOnline: hostRows.filter((h) => h.status === "online").length,
      mrr: Math.round(mrr * 100) / 100,
    },
    byGame,
    byRegion,
    regions: Object.entries(totalMemByRegion).map(([region, v]) => ({
      region,
      displayRegion: v.display,
      hosts: v.hosts,
      online: v.online,
      usedMemoryMB: v.used,
      totalMemoryMB: v.total,
      utilization: v.total > 0 ? Math.min(100, Math.round((v.used / v.total) * 100)) : 0,
    })),
    headrooms,
  });
}
