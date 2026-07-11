// Runtime game-plan + game-catalog readers with a ~60s in-memory cache.
// Mirrors lib/pricing/plan-catalog.ts (compute). DB is the source of truth;
// DEFAULT_GAME_PLANS is only a fallback for transient DB errors.

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  DEFAULT_GAME_PLANS,
  type GameCatalogEntry,
  type GameEnvField,
  type GamePlan,
} from "./game-plans";

export type CatalogGamePlan = GamePlan & { isActive: boolean; sortOrder: number };

const CACHE_TTL_MS = 60_000;
let planCache: { value: CatalogGamePlan[]; fetchedAt: number } | null = null;
let catalogCache: { value: GameCatalogEntry[]; fetchedAt: number } | null = null;

type PlanRow = {
  slug: string;
  game_type: string;
  name: string;
  tagline: string | null;
  cpu_pct: number;
  memory_mb: number;
  disk_gb: number;
  swap_mb: number;
  databases: number;
  backups: number;
  extra_allocations: number;
  monthly_price: number | string;
  allowed_regions: string[] | null;
  allowed_host_ids: string[] | null;
  is_active: boolean;
  sort_order: number;
};

type CatalogRow = {
  id: string;
  display_name: string;
  description: string | null;
  nest_id: number;
  egg_id: number;
  docker_image: string;
  startup: string | null;
  default_environment: Record<string, string> | null;
  env_schema: GameEnvField[] | null;
  port_plan: Array<{ name: string; proto: "tcp" | "udp" }> | null;
  credential_field: string | null;
  min_memory_mb: number;
  min_disk_gb: number;
  requires_eula: boolean;
  is_active: boolean;
  sort_order: number;
};

export async function getAllGamePlans(supabase: SupabaseClient): Promise<CatalogGamePlan[]> {
  const now = Date.now();
  if (planCache && now - planCache.fetchedAt < CACHE_TTL_MS) return planCache.value;

  try {
    const { data, error } = await supabase
      .from("game_server_plans")
      .select(
        "slug, game_type, name, tagline, cpu_pct, memory_mb, disk_gb, swap_mb, databases, backups, extra_allocations, monthly_price, allowed_regions, allowed_host_ids, is_active, sort_order",
      )
      .order("sort_order", { ascending: true })
      .order("slug", { ascending: true });
    if (error) throw error;
    const plans = ((data ?? []) as PlanRow[]).map(rowToPlan);
    planCache = { value: plans, fetchedAt: now };
    return plans;
  } catch (e) {
    console.warn("[game-plan-catalog] DB query failed, using code defaults:", e);
    return DEFAULT_GAME_PLANS.map((p) => ({ ...p, isActive: true, sortOrder: 0 }));
  }
}

export async function getActiveGamePlans(supabase: SupabaseClient): Promise<CatalogGamePlan[]> {
  return (await getAllGamePlans(supabase)).filter((p) => p.isActive);
}

export async function findGamePlanBySlug(
  supabase: SupabaseClient,
  slug: string,
): Promise<CatalogGamePlan | null> {
  return (await getAllGamePlans(supabase)).find((p) => p.slug === slug) ?? null;
}

export async function getGameCatalog(supabase: SupabaseClient): Promise<GameCatalogEntry[]> {
  const now = Date.now();
  if (catalogCache && now - catalogCache.fetchedAt < CACHE_TTL_MS) return catalogCache.value;

  const { data, error } = await supabase
    .from("game_catalog")
    .select(
      "id, display_name, description, nest_id, egg_id, docker_image, startup, default_environment, env_schema, port_plan, credential_field, min_memory_mb, min_disk_gb, requires_eula, is_active, sort_order",
    )
    .order("sort_order", { ascending: true });
  if (error) {
    console.warn("[game-plan-catalog] catalog query failed:", error.message);
    return catalogCache?.value ?? [];
  }
  const entries = ((data ?? []) as CatalogRow[]).map(rowToCatalog);
  catalogCache = { value: entries, fetchedAt: now };
  return entries;
}

export async function findGameCatalogEntry(
  supabase: SupabaseClient,
  gameType: string,
): Promise<GameCatalogEntry | null> {
  return (await getGameCatalog(supabase)).find((g) => g.id === gameType) ?? null;
}

/** Drop cached snapshots — call after any admin write. */
export function invalidateGamePlanCache(): void {
  planCache = null;
  catalogCache = null;
}

function rowToPlan(row: PlanRow): CatalogGamePlan {
  return {
    slug: row.slug,
    gameType: row.game_type,
    name: row.name,
    tagline: row.tagline ?? undefined,
    cpuPct: row.cpu_pct,
    memoryMB: row.memory_mb,
    diskGB: row.disk_gb,
    swapMB: row.swap_mb,
    databases: row.databases,
    backups: row.backups,
    extraAllocations: row.extra_allocations,
    monthlyPrice: Number(row.monthly_price),
    allowedRegions: row.allowed_regions ?? undefined,
    allowedHostIds: row.allowed_host_ids ?? undefined,
    isActive: row.is_active,
    sortOrder: row.sort_order,
  };
}

function rowToCatalog(row: CatalogRow): GameCatalogEntry {
  return {
    id: row.id,
    displayName: row.display_name,
    description: row.description ?? undefined,
    nestId: row.nest_id,
    eggId: row.egg_id,
    dockerImage: row.docker_image,
    startup: row.startup ?? undefined,
    defaultEnvironment: row.default_environment ?? {},
    envSchema: row.env_schema ?? [],
    portPlan: row.port_plan ?? [],
    credentialField: row.credential_field ?? undefined,
    minMemoryMB: row.min_memory_mb,
    minDiskGB: row.min_disk_gb,
    requiresEula: row.requires_eula,
    isActive: row.is_active,
    sortOrder: row.sort_order,
  };
}
