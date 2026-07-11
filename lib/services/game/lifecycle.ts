// Day-2 game server lifecycle: power, suspend/unsuspend, delete.
// Prepaid model — deleting mid-cycle forfeits the remainder (industry norm);
// admins can refund manually via billing tools when warranted.

import { createServiceClient } from "@/lib/supabase/server";
import { pterodactyl } from "@/lib/pterodactyl/client";
import { sendServiceEventEmail } from "@/lib/services/shared/service-event-email";

export interface GameServerRow {
  id: number;
  name: string;
  game_type: string;
  status: string | null;
  user_id: string | null;
  identifier: string | null;
  ptero_server_id: number | null;
  allocation: number | null;
  ip: string | null;
  port: number | null;
  plan_slug: string | null;
  region: string | null;
  host_id: string | null;
  monthly_price: number | null;
  auto_renew: boolean;
  ends_at: string | null;
  grace_until: string | null;
  suspended_at: string | null;
  details: unknown;
}

const SERVER_COLUMNS =
  "id, name, game_type, status, user_id, identifier, ptero_server_id, allocation, ip, port, plan_slug, region, host_id, monthly_price, auto_renew, ends_at, grace_until, suspended_at, details";

export async function getOwnedServer(serverId: number, userId: string): Promise<GameServerRow | null> {
  const supabase = await createServiceClient();
  const { data } = await supabase
    .from("game_servers")
    .select(SERVER_COLUMNS)
    .eq("id", serverId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as GameServerRow | null) ?? null;
}

async function logEvent(serverId: number, eventType: string, message: string, metadata: Record<string, unknown> = {}) {
  try {
    const supabase = await createServiceClient();
    await supabase.from("game_server_events").insert({ server_id: serverId, event_type: eventType, message, metadata });
  } catch {
    /* best-effort */
  }
}

export async function powerGameServer(
  server: GameServerRow,
  signal: "start" | "stop" | "restart" | "kill",
): Promise<{ ok: boolean; error?: string }> {
  if (server.status !== "active") return { ok: false, error: `Server is ${server.status ?? "not ready"}` };
  if (!server.identifier) return { ok: false, error: "Server has no panel identifier yet" };
  try {
    await pterodactyl.power(server.identifier, signal);
    await logEvent(server.id, "power", `Power action: ${signal}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Power action failed" };
  }
}

export async function suspendGameServer(server: GameServerRow, reason: string, graceUntil?: string): Promise<void> {
  const supabase = await createServiceClient();
  if (server.ptero_server_id) {
    await pterodactyl.suspendServer(server.ptero_server_id).catch((e) =>
      console.warn(`[game-lifecycle] panel suspend failed for ${server.id}:`, e instanceof Error ? e.message : e),
    );
  }
  await supabase
    .from("game_servers")
    .update({
      status: "suspended",
      suspended_at: new Date().toISOString(),
      ...(graceUntil ? { grace_until: graceUntil } : {}),
    })
    .eq("id", server.id);
  await logEvent(server.id, "suspended", reason);
}

export async function unsuspendGameServer(server: GameServerRow): Promise<void> {
  const supabase = await createServiceClient();
  if (server.ptero_server_id) {
    await pterodactyl.unsuspendServer(server.ptero_server_id).catch((e) =>
      console.warn(`[game-lifecycle] panel unsuspend failed for ${server.id}:`, e instanceof Error ? e.message : e),
    );
  }
  await supabase
    .from("game_servers")
    .update({ status: "active", suspended_at: null, grace_until: null })
    .eq("id", server.id);
  await logEvent(server.id, "resumed", "Service resumed");
}

export async function deleteGameServer(params: {
  server: GameServerRow;
  reason: string;
  notifyEmail?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const { server } = params;
  const supabase = await createServiceClient();

  if (server.ptero_server_id) {
    try {
      await pterodactyl.deleteServer(server.ptero_server_id, true);
    } catch (e) {
      // Panel 404 = already gone; anything else we log but still terminate our
      // side (the renewal sweep / admin can reconcile stragglers).
      console.warn(`[game-lifecycle] panel delete for ${server.id}:`, e instanceof Error ? e.message : e);
    }
  }

  const { error } = await supabase
    .from("game_servers")
    .update({ status: "terminated", suspended_at: null, grace_until: null })
    .eq("id", server.id);
  if (error) return { ok: false, error: error.message };

  await logEvent(server.id, "deleted", params.reason);
  if (params.notifyEmail) {
    await sendServiceEventEmail({
      userEmail: params.notifyEmail,
      serviceType: "Game Server",
      serviceName: server.name,
      event: "deleted",
      summary: params.reason,
      actionPath: "/dashboard/services/game",
    });
  }
  return { ok: true };
}
