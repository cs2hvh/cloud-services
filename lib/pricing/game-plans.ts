// Game server plan + catalog types. The DB (game_server_plans / game_catalog)
// is the source of truth, read through lib/pricing/game-plan-catalog.ts.
//
// There is deliberately no code fallback here. DEFAULT_GAME_PLANS used to be
// the seed the catalog served whenever the DB read failed — hardcoded prices,
// every plan marked active — and it was deleted with that fallback. The
// migration seed is the only copy of those numbers now.
//
// Billing model: PREPAID MONTHLY — monthlyPrice is charged once at purchase
// and again at each renewal. There is no hourly rate.

export type GameType = "minecraft" | "rust" | "cs2" | "fivem" | string;

export interface GamePlan {
  slug: string;
  gameType: GameType;
  name: string;
  tagline?: string;
  cpuPct: number; // pterodactyl cpu units (100 = 1 thread)
  memoryMB: number;
  diskGB: number; // stored as MB in pterodactyl limits; GB here for display
  swapMB: number;
  databases: number;
  backups: number;
  extraAllocations: number;
  monthlyPrice: number;
  allowedRegions?: string[];
  allowedHostIds?: string[];
}

export interface GameEnvField {
  key: string;
  label: string;
  required: boolean;
  secret: boolean;
  customer_editable: boolean;
  default: string;
  help?: string;
}

export interface GameCatalogEntry {
  id: GameType;
  displayName: string;
  description?: string;
  nestId: number;
  eggId: number;
  dockerImage: string;
  startup?: string;
  defaultEnvironment: Record<string, string>;
  envSchema: GameEnvField[];
  portPlan: Array<{ name: string; proto: "tcp" | "udp" }>;
  credentialField?: string;
  minMemoryMB: number;
  minDiskGB: number;
  requiresEula: boolean;
  isActive: boolean;
  sortOrder: number;
}
