// Admin-side game-server operations — operate on ANY server (not owner-scoped).
// Thin layer over the lifecycle helpers + Pterodactyl client for the admin console.

import { createServiceClient } from "@/lib/supabase/server";
import { pterodactyl } from "@/lib/pterodactyl/client";
import { findGamePlanBySlug } from "@/lib/pricing/game-plan-catalog";
import type { GameServerRow } from "@/lib/services/game/lifecycle";

const SERVER_COLUMNS =
  "id, name, game_type, status, user_id, identifier, ptero_server_id, ptero_uuid, allocation, ip, port, plan_slug, region, host_id, monthly_price, auto_renew, ends_at, grace_until, suspended_at, last_error, details, created_at";

export interface AdminServerListParams {
  search?: string;
  game?: string;
  region?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface AdminServerRow {
  id: number;
  name: string;
  game_type: string;
  status: string | null;
  user_id: string | null;
  owner_email: string | null;
  identifier: string | null;
  ip: string | null;
  port: number | null;
  plan_slug: string | null;
  region: string | null;
  host_id: string | null;
  monthly_price: number | null;
  auto_renew: boolean;
  ends_at: string | null;
  created_at: string | null;
}

async function emailsFor(userIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return map;
  const supabase = await createServiceClient();
  const { data } = await supabase.schema("auth").from("users").select("id, email").in("id", ids);
  for (const u of (data ?? []) as Array<{ id: string; email: string | null }>) {
    if (u.email) map.set(u.id, u.email);
  }
  return map;
}

export async function listGameServersAdmin(
  params: AdminServerListParams,
): Promise<{ servers: AdminServerRow[]; total: number; page: number; pageSize: number }> {
  const supabase = await createServiceClient();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, params.pageSize ?? 25));
  const from = (page - 1) * pageSize;

  let query = supabase
    .from("game_servers")
    .select(
      "id, name, game_type, status, user_id, identifier, ip, port, plan_slug, region, host_id, monthly_price, auto_renew, ends_at, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);

  if (params.game) query = query.eq("game_type", params.game);
  if (params.region) query = query.eq("region", params.region);
  if (params.status) query = query.eq("status", params.status);
  else query = query.neq("status", "terminated");
  if (params.search && params.search.trim()) {
    const s = params.search.trim().replace(/[%,]/g, "");
    query = query.or(`name.ilike.%${s}%,ip.ilike.%${s}%,identifier.ilike.%${s}%`);
  }

  const { data, error, count } = await query;
  if (error) throw new Error(`Failed to list servers: ${error.message}`);

  const rows = (data ?? []) as Array<Omit<AdminServerRow, "owner_email">>;
  const emails = await emailsFor(rows.map((r) => r.user_id ?? ""));

  return {
    servers: rows.map((r) => ({ ...r, owner_email: r.user_id ? emails.get(r.user_id) ?? null : null })),
    total: count ?? 0,
    page,
    pageSize,
  };
}

export async function getGameServerAdmin(id: number): Promise<{ server: GameServerRow & { owner_email: string | null; ptero_uuid: string | null }; events: Array<{ event_type: string; message: string | null; created_at: string }> } | null> {
  const supabase = await createServiceClient();
  const { data } = await supabase.from("game_servers").select(SERVER_COLUMNS).eq("id", id).maybeSingle();
  if (!data) return null;
  const row = data as GameServerRow & { ptero_uuid: string | null; user_id: string | null };
  const emails = await emailsFor([row.user_id ?? ""]);
  const { data: events } = await supabase
    .from("game_server_events")
    .select("event_type, message, created_at")
    .eq("server_id", id)
    .order("created_at", { ascending: false })
    .limit(30);
  return {
    server: { ...row, owner_email: row.user_id ? emails.get(row.user_id) ?? null : null },
    events: (events ?? []) as Array<{ event_type: string; message: string | null; created_at: string }>,
  };
}

export async function getServerRowById(id: number): Promise<GameServerRow | null> {
  const supabase = await createServiceClient();
  const { data } = await supabase.from("game_servers").select(SERVER_COLUMNS).eq("id", id).maybeSingle();
  return (data as GameServerRow | null) ?? null;
}

async function logEvent(serverId: number, eventType: string, message: string) {
  try {
    const supabase = await createServiceClient();
    await supabase.from("game_server_events").insert({ server_id: serverId, event_type: eventType, message });
  } catch {
    /* best-effort */
  }
}

/** Extend the prepaid expiry by N days (admin comp / support). */
export async function extendExpiryAdmin(id: number, days: number): Promise<void> {
  const supabase = await createServiceClient();
  const { data } = await supabase.from("game_servers").select("ends_at").eq("id", id).maybeSingle();
  const base = data?.ends_at ? Math.max(new Date(data.ends_at).getTime(), Date.now()) : Date.now();
  const newEnd = new Date(base + days * 86_400_000).toISOString();
  await supabase.from("game_servers").update({ ends_at: newEnd }).eq("id", id);
  await logEvent(id, "admin_extend", `Admin extended expiry by ${days} day(s) → ${newEnd}`);
}

export async function reinstallServerAdmin(row: GameServerRow): Promise<void> {
  if (!row.ptero_server_id) throw new Error("Server has no panel id");
  await pterodactyl.reinstallServer(row.ptero_server_id);
  const supabase = await createServiceClient();
  await supabase.from("game_servers").update({ status: "installing" }).eq("id", row.id);
  await logEvent(row.id, "admin_reinstall", "Admin triggered reinstall");
}

/**
 * Change a server's plan (upgrade/downgrade): update panel build limits and the
 * DB plan/price. New price applies to the next renewal (no mid-cycle proration).
 */
export async function changePlanAdmin(row: GameServerRow, newPlanSlug: string): Promise<void> {
  if (!row.ptero_server_id || !row.allocation) throw new Error("Server not fully provisioned");
  const supabase = await createServiceClient();
  const plan = await findGamePlanBySlug(supabase, newPlanSlug);
  if (!plan) throw new Error("Unknown plan");
  if (plan.gameType !== row.game_type) throw new Error("Plan is for a different game");

  await pterodactyl.updateServerBuild(row.ptero_server_id, {
    allocation: row.allocation,
    memory: plan.memoryMB,
    swap: plan.swapMB,
    disk: plan.diskGB * 1024,
    io: 500,
    cpu: plan.cpuPct,
    feature_limits: { databases: plan.databases, allocations: 1 + plan.extraAllocations, backups: plan.backups },
  });

  await supabase
    .from("game_servers")
    .update({
      plan_slug: plan.slug,
      monthly_price: plan.monthlyPrice,
      resources: { ram: plan.memoryMB, storage: plan.diskGB, cpu: plan.cpuPct },
      details: {
        ...(typeof row.details === "object" && row.details ? row.details : {}),
        limits: { memory: plan.memoryMB, disk: plan.diskGB * 1024, cpu: plan.cpuPct },
      },
    })
    .eq("id", row.id);
  await logEvent(row.id, "admin_change_plan", `Admin changed plan → ${plan.name} ($${plan.monthlyPrice}/mo)`);
}
