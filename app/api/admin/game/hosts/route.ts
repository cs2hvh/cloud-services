import { after, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { onboardGameHost } from "@/lib/services/game/host-onboarding";
import { listRegionHeadrooms } from "@/lib/services/game/host-selection";

export const dynamic = "force-dynamic";

const HOST_ID_RE = /^[a-z0-9][a-z0-9-]{1,30}$/;

// GET — list all game hosts (admin) with per-region live headroom.
export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("game_hosts")
    .select(
      "id, name, region, display_region, fqdn, ip, ptero_node_id, total_cpu_cores, total_memory_mb, total_disk_gb, memory_overallocate_pct, cpu_oversubscription_ratio, allowed_games, status, provision, last_heartbeat_at, notes, created_at",
    )
    .order("region", { ascending: true })
    .order("id", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const headrooms = await listRegionHeadrooms().catch(() => []);
  return NextResponse.json({ ok: true, hosts: data ?? [], headrooms });
}

// POST — register a machine and kick off the onboarding pipeline (background).
// Body: { id, name, region, displayRegion, fqdn, ip, sshPassword|sshKey,
//         memoryMB, diskGB, memoryOverallocatePct?, cpuOversubscriptionRatio?,
//         allowedGames?, portRanges? }
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(body.id ?? "").trim().toLowerCase();
  const fqdn = String(body.fqdn ?? "").trim().toLowerCase();
  const ip = String(body.ip ?? "").trim();
  const region = String(body.region ?? "").trim().toLowerCase();

  if (!HOST_ID_RE.test(id)) return NextResponse.json({ error: "id must be lowercase letters/numbers/hyphens (2-31 chars)" }, { status: 400 });
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(fqdn)) return NextResponse.json({ error: "fqdn must be a valid hostname" }, { status: 400 });
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return NextResponse.json({ error: "ip must be an IPv4 address" }, { status: 400 });
  if (!region) return NextResponse.json({ error: "region is required" }, { status: 400 });
  if (!body.sshPassword && !body.sshKey) return NextResponse.json({ error: "sshPassword or sshKey is required" }, { status: 400 });

  const memoryMB = Number(body.memoryMB);
  const diskGB = Number(body.diskGB);
  if (!(memoryMB > 0) || !(diskGB > 0)) return NextResponse.json({ error: "memoryMB and diskGB must be positive" }, { status: 400 });

  const supabase = await createServiceClient();
  const displayRegion = String(body.displayRegion ?? region);

  // Upsert the row first (never store the root password).
  const { error: upsertError } = await supabase.from("game_hosts").upsert(
    {
      id,
      name: String(body.name ?? id),
      region,
      display_region: displayRegion,
      fqdn,
      ip,
      total_memory_mb: Math.round(memoryMB),
      total_disk_gb: Math.round(diskGB),
      total_cpu_cores: Number(body.totalCpuCores ?? 0) || 0,
      memory_overallocate_pct: Number(body.memoryOverallocatePct ?? 0) || 0,
      cpu_oversubscription_ratio: Number(body.cpuOversubscriptionRatio ?? 3) || 3,
      allowed_games: Array.isArray(body.allowedGames) && body.allowedGames.length ? body.allowedGames : null,
      status: "provisioning",
      notes: typeof body.notes === "string" ? body.notes : null,
      provision: { stage: "queued", progress: 5, message: "Onboarding queued", updated_at: new Date().toISOString() },
    },
    { onConflict: "id" },
  );
  if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });

  const onboardArgs = {
    id,
    name: String(body.name ?? id),
    region,
    displayRegion,
    fqdn,
    ip,
    sshPassword: typeof body.sshPassword === "string" ? body.sshPassword : undefined,
    sshKey: typeof body.sshKey === "string" ? body.sshKey : undefined,
    memoryMB: Math.round(memoryMB),
    diskGB: Math.round(diskGB),
    memoryOverallocatePct: Number(body.memoryOverallocatePct ?? 0) || 0,
    cpuOversubscriptionRatio: Number(body.cpuOversubscriptionRatio ?? 3) || 3,
    allowedGames: Array.isArray(body.allowedGames) && body.allowedGames.length ? (body.allowedGames as string[]) : null,
    adminEmail: admin.email ?? "admin@ahurasense.com",
    portRanges: Array.isArray(body.portRanges) ? (body.portRanges as string[]) : undefined,
  };

  after(async () => {
    await onboardGameHost(onboardArgs);
  });

  return NextResponse.json({ ok: true, id, status: "provisioning" }, { status: 202 });
}

// PATCH — update host status/capacity (e.g. maintenance toggle) or retry onboarding.
// Body: { id, action?: 'retry'|'maintenance'|'online', ...editable fields }
export async function PATCH(req: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const supabase = await createServiceClient();
  const action = body.action;

  if (action === "maintenance" || action === "online") {
    const { error } = await supabase.from("game_hosts").update({ status: action === "maintenance" ? "maintenance" : "online" }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, status: action === "maintenance" ? "maintenance" : "online" });
  }

  const patch: Record<string, unknown> = {};
  if (body.memoryOverallocatePct !== undefined) patch.memory_overallocate_pct = Number(body.memoryOverallocatePct) || 0;
  if (body.cpuOversubscriptionRatio !== undefined) patch.cpu_oversubscription_ratio = Number(body.cpuOversubscriptionRatio) || 3;
  if (body.allowedGames !== undefined) patch.allowed_games = Array.isArray(body.allowedGames) && body.allowedGames.length ? body.allowedGames : null;
  if (body.notes !== undefined) patch.notes = typeof body.notes === "string" ? body.notes : null;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const { error } = await supabase.from("game_hosts").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE ?id=X — deregister a host (refuses if it still has live servers).
export async function DELETE(req: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const supabase = await createServiceClient();
  const { count } = await supabase
    .from("game_servers")
    .select("id", { count: "exact", head: true })
    .eq("host_id", id)
    .neq("status", "terminated");
  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: `Host still has ${count} live server(s). Drain them first.` }, { status: 409 });
  }

  const { error } = await supabase.from("game_hosts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
