// Client-side types for the game servers dashboard — mirrors the JSON returned
// by app/api/services/game/* routes.

export interface GameOptionClient {
  id: string;
  displayName: string;
  description: string | null;
  available: boolean;
  requiresEula: boolean;
  credentialField: string | null;
  envSchema: Array<{
    key: string;
    label: string;
    required: boolean;
    secret: boolean;
    customer_editable: boolean;
    default: string;
    help?: string;
  }>;
  minMemoryMB: number;
}

export interface GamePlanClient {
  slug: string;
  gameType: string;
  name: string;
  tagline: string | null;
  cpuPct: number;
  memoryMB: number;
  diskGB: number;
  backups: number;
  monthlyPrice: number;
}

export interface GameRegionClient {
  region: string;
  displayRegion: string;
  hosts: number;
}

export interface GameOptionsResponse {
  ok: boolean;
  deployEnabled: boolean;
  games: GameOptionClient[];
  plans: GamePlanClient[];
  regions: GameRegionClient[];
  planAvailability: Record<string, Record<string, boolean>>;
}

export interface GameServerSummaryClient {
  id: number;
  name: string;
  game_type: string;
  status: string | null;
  plan_slug: string | null;
  region: string | null;
  ip: string | null;
  port: number | null;
  monthly_price: number | null;
  auto_renew: boolean;
  ends_at: string | null;
  grace_until: string | null;
  suspended_at: string | null;
  details: {
    provisioning?: { stage: string; progress: number; message: string };
    ports?: Record<string, { ip: string; port: number }>;
  } | null;
  created_at: string | null;
}

export interface GameServerDetailClient {
  id: number;
  name: string;
  gameType: string;
  status: string | null;
  planSlug: string | null;
  region: string | null;
  ip: string | null;
  port: number | null;
  identifier: string | null;
  monthlyPrice: number | null;
  autoRenew: boolean;
  endsAt: string | null;
  graceUntil: string | null;
  suspendedAt: string | null;
  details: {
    provisioning?: { stage: string; progress: number; message: string };
    ports?: Record<string, { ip: string; port: number }>;
  } | null;
}

export interface GameServerEventClient {
  event_type: string;
  message: string | null;
  created_at: string;
}

export interface PanelAccessClient {
  panelUrl: string;
  username: string;
  email: string;
  password: string | null;
}

export const GAME_LABELS: Record<string, string> = {
  minecraft: "Minecraft",
  rust: "Rust",
  cs2: "Counter-Strike 2",
  fivem: "FiveM",
};

export const GAME_ICONS: Record<string, string> = {
  minecraft: "🧱",
  rust: "🔧",
  cs2: "🔫",
  fivem: "🏎️",
};
