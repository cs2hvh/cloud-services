// Game host placement — pick the best online machine in a region for a plan,
// then reserve a concrete Pterodactyl allocation under a short Redis lock so
// two concurrent orders can never grab the same ip:port.
//
// RAM and disk are hard walls (with the host's configured overallocate %);
// CPU degrades gracefully and is tracked via an oversubscription ratio.
// We do our own scheduling because Pterodactyl's auto-deploy ignores CPU.

import { createServiceClient } from "@/lib/supabase/server";
import { redis } from "@/lib/redis";
import { pterodactyl, type PteroAllocation } from "@/lib/pterodactyl/client";
import type { CatalogGamePlan } from "@/lib/pricing/game-plan-catalog";

export interface GameHostRow {
  id: string;
  name: string;
  region: string;
  display_region: string;
  fqdn: string;
  ip: string | null;
  ptero_location_id: number | null;
  ptero_node_id: number | null;
  total_cpu_cores: number;
  total_memory_mb: number;
  total_disk_gb: number;
  memory_overallocate_pct: number;
  cpu_oversubscription_ratio: number;
  allowed_games: string[] | null;
  status: string;
}

export interface HostCandidate {
  host: GameHostRow;
  freeMemoryMB: number;
  freeDiskGB: number;
  freeCpuPct: number;
  score: number;
}

export interface PlacementResult {
  host: GameHostRow;
  allocation: PteroAllocation;
  extraAllocations: PteroAllocation[];
  releaseLock: () => Promise<void>;
}

const ALLOC_LOCK_TTL_SEC = 300;

/** Usage per host aggregated from live (non-terminated) game servers. */
async function hostUsage(hostIds: string[]): Promise<Map<string, { memoryMB: number; diskGB: number; cpuPct: number }>> {
  const supabase = await createServiceClient();
  const usage = new Map<string, { memoryMB: number; diskGB: number; cpuPct: number }>();
  if (hostIds.length === 0) return usage;

  const { data, error } = await supabase
    .from("game_servers")
    .select("host_id, details, status")
    .in("host_id", hostIds)
    .not("status", "in", "(terminated,failed)");
  if (error) throw new Error(`Failed to aggregate host usage: ${error.message}`);

  for (const row of data ?? []) {
    if (!row.host_id) continue;
    const limits = (row.details as { limits?: { memory?: number; disk?: number; cpu?: number } } | null)?.limits ?? {};
    const cur = usage.get(row.host_id) ?? { memoryMB: 0, diskGB: 0, cpuPct: 0 };
    cur.memoryMB += Number(limits.memory ?? 0);
    cur.diskGB += Number(limits.disk ?? 0) / 1024;
    cur.cpuPct += Number(limits.cpu ?? 0);
    usage.set(row.host_id, cur);
  }
  return usage;
}

/** All fitting hosts in a region for a plan+game, best (most headroom) first. */
export async function listHostCandidates(params: {
  region: string;
  gameType: string;
  plan: CatalogGamePlan;
}): Promise<HostCandidate[]> {
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("game_hosts")
    .select(
      "id, name, region, display_region, fqdn, ip, ptero_location_id, ptero_node_id, total_cpu_cores, total_memory_mb, total_disk_gb, memory_overallocate_pct, cpu_oversubscription_ratio, allowed_games, status",
    )
    .eq("region", params.region)
    .eq("status", "online");
  if (error) throw new Error(`Failed to list game hosts: ${error.message}`);

  const hosts = ((data ?? []) as GameHostRow[]).filter((h) => {
    if (!h.ptero_node_id) return false;
    if (h.allowed_games && h.allowed_games.length > 0 && !h.allowed_games.includes(params.gameType)) return false;
    if (params.plan.allowedHostIds && params.plan.allowedHostIds.length > 0 && !params.plan.allowedHostIds.includes(h.id)) return false;
    return true;
  });
  if (hosts.length === 0) return [];

  const usage = await hostUsage(hosts.map((h) => h.id));
  const candidates: HostCandidate[] = [];

  for (const h of hosts) {
    const used = usage.get(h.id) ?? { memoryMB: 0, diskGB: 0, cpuPct: 0 };
    const memCap = h.total_memory_mb * (1 + h.memory_overallocate_pct / 100);
    const cpuCap = h.total_cpu_cores * 100 * Math.max(h.cpu_oversubscription_ratio, 1);
    const freeMemoryMB = memCap - used.memoryMB;
    const freeDiskGB = h.total_disk_gb - used.diskGB;
    const freeCpuPct = cpuCap - used.cpuPct;

    if (freeMemoryMB < params.plan.memoryMB) continue;
    if (freeDiskGB < params.plan.diskGB) continue;
    if (freeCpuPct < params.plan.cpuPct) continue;

    candidates.push({
      host: h,
      freeMemoryMB,
      freeDiskGB,
      freeCpuPct,
      score: freeMemoryMB / 1024 + freeDiskGB / 100 + freeCpuPct / 400,
    });
  }

  return candidates.sort((a, b) => b.score - a.score);
}

/** True if at least one host in the region can fit the plan (for availability maps). */
export async function regionHasCapacity(params: {
  region: string;
  gameType: string;
  plan: CatalogGamePlan;
}): Promise<boolean> {
  return (await listHostCandidates(params)).length > 0;
}

export interface RegionHeadroom {
  region: string;
  displayRegion: string;
  hosts: number;
  /** Best single-host headroom — a plan fits the region iff it fits these. */
  maxFreeMemoryMB: number;
  maxFreeDiskGB: number;
  maxFreeCpuPct: number;
  /** Union of allowed_games across hosts (null = all games). */
  games: string[] | null;
}

/**
 * Per-region best-host headroom in two queries — the options endpoint checks
 * every plan against these maxima instead of running placement per plan.
 */
export async function listRegionHeadrooms(): Promise<RegionHeadroom[]> {
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("game_hosts")
    .select(
      "id, region, display_region, total_cpu_cores, total_memory_mb, total_disk_gb, memory_overallocate_pct, cpu_oversubscription_ratio, allowed_games, status",
    )
    .eq("status", "online");
  if (error) throw new Error(`Failed to list game hosts: ${error.message}`);

  const hosts = (data ?? []) as Array<
    Pick<
      GameHostRow,
      | "id"
      | "region"
      | "display_region"
      | "total_cpu_cores"
      | "total_memory_mb"
      | "total_disk_gb"
      | "memory_overallocate_pct"
      | "cpu_oversubscription_ratio"
      | "allowed_games"
      | "status"
    >
  >;
  if (hosts.length === 0) return [];

  const usage = await hostUsage(hosts.map((h) => h.id));
  const byRegion = new Map<string, RegionHeadroom>();

  for (const h of hosts) {
    const used = usage.get(h.id) ?? { memoryMB: 0, diskGB: 0, cpuPct: 0 };
    const freeMem = h.total_memory_mb * (1 + h.memory_overallocate_pct / 100) - used.memoryMB;
    const freeDisk = h.total_disk_gb - used.diskGB;
    const freeCpu = h.total_cpu_cores * 100 * Math.max(h.cpu_oversubscription_ratio, 1) - used.cpuPct;

    const cur = byRegion.get(h.region) ?? {
      region: h.region,
      displayRegion: h.display_region,
      hosts: 0,
      maxFreeMemoryMB: 0,
      maxFreeDiskGB: 0,
      maxFreeCpuPct: 0,
      games: [] as string[] | null,
    };
    cur.hosts++;
    cur.maxFreeMemoryMB = Math.max(cur.maxFreeMemoryMB, freeMem);
    cur.maxFreeDiskGB = Math.max(cur.maxFreeDiskGB, freeDisk);
    cur.maxFreeCpuPct = Math.max(cur.maxFreeCpuPct, freeCpu);
    if (h.allowed_games === null || h.allowed_games.length === 0) {
      cur.games = null; // at least one host takes all games
    } else if (cur.games !== null) {
      cur.games = Array.from(new Set([...cur.games, ...h.allowed_games]));
    }
    byRegion.set(h.region, cur);
  }

  return Array.from(byRegion.values()).sort((a, b) => a.displayRegion.localeCompare(b.displayRegion));
}

/**
 * Pick a host + reserve allocations (1 primary + N extra) under Redis locks.
 * Caller MUST invoke releaseLock() after the panel server is created (or on
 * failure) — locks self-expire after 5 minutes as a crash backstop.
 */
export async function placeServer(params: {
  region: string;
  gameType: string;
  plan: CatalogGamePlan;
}): Promise<PlacementResult | null> {
  const candidates = await listHostCandidates(params);
  const need = 1 + Math.max(params.plan.extraAllocations, 0);

  for (const cand of candidates) {
    const nodeId = cand.host.ptero_node_id;
    if (!nodeId) continue;

    let free: PteroAllocation[];
    try {
      free = await pterodactyl.listFreeAllocations(nodeId, 200);
    } catch (e) {
      console.warn(`[game-placement] failed to list allocations on ${cand.host.id}:`, e instanceof Error ? e.message : e);
      continue;
    }
    if (free.length < need) continue;

    const locked: number[] = [];
    const lockKeys: string[] = [];
    for (const alloc of free) {
      const key = `game-alloc:${nodeId}:${alloc.id}`;
      try {
        const ok = await redis.set(key, "1", { nx: true, ex: ALLOC_LOCK_TTL_SEC });
        if (ok) {
          locked.push(alloc.id);
          lockKeys.push(key);
          if (locked.length === need) break;
        }
      } catch {
        // Redis down → fail open on locking (allocation conflicts surface as
        // panel 422s and the order retries), do not block ordering entirely.
        locked.push(alloc.id);
        if (locked.length === need) break;
      }
    }
    if (locked.length < need) {
      await Promise.allSettled(lockKeys.map((k) => redis.del(k)));
      continue;
    }

    const byId = new Map(free.map((a) => [a.id, a]));
    const [primary, ...extras] = locked.map((id) => byId.get(id)!) ;
    return {
      host: cand.host,
      allocation: primary,
      extraAllocations: extras,
      releaseLock: async () => {
        await Promise.allSettled(lockKeys.map((k) => redis.del(k)));
      },
    };
  }

  return null;
}
