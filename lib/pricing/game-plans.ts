// Game server plan + catalog types. The DB (game_server_plans / game_catalog)
// is the source of truth — these types and the DEFAULT_GAME_PLANS seed exist
// only as a code fallback so the storefront never goes blank on a transient
// DB error. Keep the seed in lockstep with the migration seed.
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

export const DEFAULT_GAME_PLANS: GamePlan[] = [
  { slug: "mc-2g", gameType: "minecraft", name: "Minecraft 2GB", tagline: "Small SMP / vanilla", cpuPct: 150, memoryMB: 2048, diskGB: 10, swapMB: 0, databases: 0, backups: 2, extraAllocations: 0, monthlyPrice: 4 },
  { slug: "mc-4g", gameType: "minecraft", name: "Minecraft 4GB", tagline: "Light plugins", cpuPct: 200, memoryMB: 4096, diskGB: 20, swapMB: 0, databases: 0, backups: 2, extraAllocations: 0, monthlyPrice: 8 },
  { slug: "mc-8g", gameType: "minecraft", name: "Minecraft 8GB", tagline: "Modpacks / big networks", cpuPct: 300, memoryMB: 8192, diskGB: 40, swapMB: 0, databases: 0, backups: 2, extraAllocations: 0, monthlyPrice: 15 },
  { slug: "mc-12g", gameType: "minecraft", name: "Minecraft 12GB", tagline: "Heavy modded", cpuPct: 400, memoryMB: 12288, diskGB: 60, swapMB: 0, databases: 0, backups: 3, extraAllocations: 0, monthlyPrice: 22 },
  { slug: "rust-6g", gameType: "rust", name: "Rust 6GB", tagline: "Up to ~80 pop", cpuPct: 300, memoryMB: 6144, diskGB: 30, swapMB: 0, databases: 0, backups: 2, extraAllocations: 3, monthlyPrice: 18 },
  { slug: "rust-8g", gameType: "rust", name: "Rust 8GB", tagline: "~100 pop", cpuPct: 400, memoryMB: 8192, diskGB: 40, swapMB: 0, databases: 0, backups: 2, extraAllocations: 3, monthlyPrice: 24 },
  { slug: "rust-12g", gameType: "rust", name: "Rust 12GB", tagline: "Large / modded", cpuPct: 500, memoryMB: 12288, diskGB: 60, swapMB: 0, databases: 0, backups: 3, extraAllocations: 3, monthlyPrice: 34 },
  { slug: "cs2-standard", gameType: "cs2", name: "CS2 Standard", tagline: "Competitive 5v5", cpuPct: 200, memoryMB: 3072, diskGB: 80, swapMB: 0, databases: 0, backups: 2, extraAllocations: 1, monthlyPrice: 9 },
  { slug: "cs2-plus", gameType: "cs2", name: "CS2 Plus", tagline: "128-tick / plugins", cpuPct: 300, memoryMB: 4096, diskGB: 90, swapMB: 0, databases: 0, backups: 2, extraAllocations: 1, monthlyPrice: 14 },
  { slug: "fivem-4g", gameType: "fivem", name: "FiveM 4GB", tagline: "Starter RP", cpuPct: 300, memoryMB: 4096, diskGB: 40, swapMB: 0, databases: 0, backups: 2, extraAllocations: 1, monthlyPrice: 12 },
  { slug: "fivem-8g", gameType: "fivem", name: "FiveM 8GB", tagline: "~64 players", cpuPct: 400, memoryMB: 8192, diskGB: 60, swapMB: 0, databases: 0, backups: 2, extraAllocations: 1, monthlyPrice: 22 },
  { slug: "fivem-16g", gameType: "fivem", name: "FiveM 16GB", tagline: "Script-heavy RP", cpuPct: 600, memoryMB: 16384, diskGB: 100, swapMB: 0, databases: 0, backups: 3, extraAllocations: 1, monthlyPrice: 44 },
];
