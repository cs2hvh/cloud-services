// Runtime game-plan + game-catalog readers with a ~60s in-memory cache.
// Mirrors lib/pricing/plan-catalog.ts (compute). DB is the source of truth,
// and the ONLY source: a catalog that cannot be read throws.
//
// It used to catch the plan query error and serve DEFAULT_GAME_PLANS with
// isActive forced true — hardcoded prices, every plan on sale, whatever the
// admin panel said and whether or not the table still existed. Nobody sees a
// broken page that way; they see prices that are wrong. plan-catalog.ts had
// the same fallback for compute and removed it for the same reason; the
// constant is deleted with it.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { GameCatalogEntry, GameEnvField, GamePlan } from "./game-plans";

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
  monthly_price: number | string | null;
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

  const { data, error } = await supabase
    .from("game_server_plans")
    .select(
      "slug, game_type, name, tagline, cpu_pct, memory_mb, disk_gb, swap_mb, databases, backups, extra_allocations, monthly_price, allowed_regions, allowed_host_ids, is_active, sort_order",
    )
    .order("sort_order", { ascending: true })
    .order("slug", { ascending: true });
  // No silent fallback — see the header. The route serving this returns an
  // error instead of a menu, which is the honest outcome.
  if (error) throw new Error(`game plan catalog unavailable: ${error.message}`);
  const plans = ((data ?? []) as PlanRow[]).map(rowToPlan);
  planCache = { value: plans, fetchedAt: now };
  return plans;
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
  // Same rule as the plans: no stale snapshot, no empty list. A storefront
  // with no games and a database that cannot be reached must not look alike.
  if (error) throw new Error(`game catalog unavailable: ${error.message}`);
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
  // Number(null) and Number("") are both 0: a plan whose price was never
  // written would be sold — and renewed — for nothing, and the picker would
  // show it that way. A NULL/NaN price is a broken row, named by slug so the
  // fix is one UPDATE away.
  const monthlyPrice =
    row.monthly_price === null || row.monthly_price === undefined || String(row.monthly_price).trim() === ""
      ? NaN
      : Number(row.monthly_price);
  if (!Number.isFinite(monthlyPrice)) {
    throw new Error(`game plan "${row.slug}" has no readable monthly_price (${JSON.stringify(row.monthly_price)})`);
  }
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
    monthlyPrice,
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
