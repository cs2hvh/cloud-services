import { createServiceClient } from "@/lib/supabase/server";

// Platform-wide admin toggles, stored in the `platform_settings` key-value table
// and read/written only via the service-role client.

const GPU_DEPLOY_KEY = "gpu_deploy_enabled";
const GAME_DEPLOY_KEY = "game_deploy_enabled";
const LINODE_DEPLOY_KEY = "linode_deploy_enabled";
const COMPUTE_PROVIDER_KEY = "compute_provider";

// Tiny in-memory cache so the inventory poll (~6s) and create path don't hit the
// DB on every call. Short TTL keeps the admin toggle near-instant.
let gpuCache: { value: boolean; at: number } | null = null;
let gameCache: { value: boolean; at: number } | null = null;
let linodeCache: { value: boolean; at: number } | null = null;
let providerCache: { value: ComputeProvider; at: number } | null = null;
const TTL_MS = 10_000;

export type ComputeProvider = "proxmox" | "linode";

function now(): number {
  return Date.now();
}

/**
 * Whether customers may currently deploy GPU pods. Defaults to ENABLED if the
 * row/table is missing, so a setup hiccup never bricks deploys — admins disable
 * it explicitly via the admin panel.
 */
export async function getGpuDeployEnabled(): Promise<boolean> {
  if (gpuCache && now() - gpuCache.at < TTL_MS) return gpuCache.value;
  try {
    const supabase = await createServiceClient();
    const { data, error } = await (supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (
            k: string,
            v: string,
          ) => { maybeSingle: () => Promise<{ data: { value: unknown } | null; error: unknown }> };
        };
      };
    })
      .from("platform_settings")
      .select("value")
      .eq("key", GPU_DEPLOY_KEY)
      .maybeSingle();

    const enabled = error || data == null ? true : data.value !== false;
    gpuCache = { value: enabled, at: now() };
    return enabled;
  } catch {
    return true;
  }
}

/** Whether customers may currently order game servers. Fail-open like GPU. */
export async function getGameDeployEnabled(): Promise<boolean> {
  if (gameCache && now() - gameCache.at < TTL_MS) return gameCache.value;
  try {
    const supabase = await createServiceClient();
    const { data, error } = await (supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (
            k: string,
            v: string,
          ) => { maybeSingle: () => Promise<{ data: { value: unknown } | null; error: unknown }> };
        };
      };
    })
      .from("platform_settings")
      .select("value")
      .eq("key", GAME_DEPLOY_KEY)
      .maybeSingle();

    const enabled = error || data == null ? true : data.value !== false;
    gameCache = { value: enabled, at: now() };
    return enabled;
  } catch {
    return true;
  }
}

/** Set the game-server ordering availability switch (admin only). */
export async function setGameDeployEnabled(
  enabled: boolean,
  userId?: string | null,
): Promise<void> {
  const supabase = await createServiceClient();
  await (supabase as unknown as {
    from: (t: string) => {
      upsert: (row: Record<string, unknown>, opts: { onConflict: string }) => Promise<unknown>;
    };
  })
    .from("platform_settings")
    .upsert(
      {
        key: GAME_DEPLOY_KEY,
        value: enabled,
        updated_at: new Date().toISOString(),
        updated_by: userId ?? null,
      },
      { onConflict: "key" },
    );
  gameCache = { value: enabled, at: now() };
}

/**
 * Whether customers may currently deploy Linode compute instances. Fail-open
 * like GPU/game: a missing row or table never bricks deploys — admins disable
 * explicitly via the admin panel. Blocks CREATE only; day-2 ops always work.
 */
export async function getLinodeDeployEnabled(): Promise<boolean> {
  if (linodeCache && now() - linodeCache.at < TTL_MS) return linodeCache.value;
  try {
    const supabase = await createServiceClient();
    const { data, error } = await (supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (
            k: string,
            v: string,
          ) => { maybeSingle: () => Promise<{ data: { value: unknown } | null; error: unknown }> };
        };
      };
    })
      .from("platform_settings")
      .select("value")
      .eq("key", LINODE_DEPLOY_KEY)
      .maybeSingle();

    const enabled = error || data == null ? true : data.value !== false;
    linodeCache = { value: enabled, at: now() };
    return enabled;
  } catch {
    return true;
  }
}

/** Set the Linode compute deployment availability switch (admin only). */
export async function setLinodeDeployEnabled(
  enabled: boolean,
  userId?: string | null,
): Promise<void> {
  const supabase = await createServiceClient();
  await (supabase as unknown as {
    from: (t: string) => {
      upsert: (row: Record<string, unknown>, opts: { onConflict: string }) => Promise<unknown>;
    };
  })
    .from("platform_settings")
    .upsert(
      {
        key: LINODE_DEPLOY_KEY,
        value: enabled,
        updated_at: new Date().toISOString(),
        updated_by: userId ?? null,
      },
      { onConflict: "key" },
    );
  linodeCache = { value: enabled, at: now() };
}

/**
 * Which backend the compute service provisions NEW servers on. Existing rows
 * always dispatch on their own `servers.provider` column — this switch only
 * routes the create/options paths. Defaults to 'linode' (Proxmox is dormant
 * until owned hardware returns).
 */
export async function getComputeProvider(): Promise<ComputeProvider> {
  if (providerCache && now() - providerCache.at < TTL_MS) return providerCache.value;
  try {
    const supabase = await createServiceClient();
    const { data, error } = await (supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (
            k: string,
            v: string,
          ) => { maybeSingle: () => Promise<{ data: { value: unknown } | null; error: unknown }> };
        };
      };
    })
      .from("platform_settings")
      .select("value")
      .eq("key", COMPUTE_PROVIDER_KEY)
      .maybeSingle();

    const provider: ComputeProvider =
      !error && data != null && data.value === "proxmox" ? "proxmox" : "linode";
    providerCache = { value: provider, at: now() };
    return provider;
  } catch {
    return "linode";
  }
}

/** Set the compute provisioning backend (admin only). */
export async function setComputeProvider(
  provider: ComputeProvider,
  userId?: string | null,
): Promise<void> {
  const supabase = await createServiceClient();
  await (supabase as unknown as {
    from: (t: string) => {
      upsert: (row: Record<string, unknown>, opts: { onConflict: string }) => Promise<unknown>;
    };
  })
    .from("platform_settings")
    .upsert(
      {
        key: COMPUTE_PROVIDER_KEY,
        value: provider,
        updated_at: new Date().toISOString(),
        updated_by: userId ?? null,
      },
      { onConflict: "key" },
    );
  providerCache = { value: provider, at: now() };
}

/** Set the GPU deployment availability switch (admin only). */
export async function setGpuDeployEnabled(
  enabled: boolean,
  userId?: string | null,
): Promise<void> {
  const supabase = await createServiceClient();
  await (supabase as unknown as {
    from: (t: string) => {
      upsert: (row: Record<string, unknown>, opts: { onConflict: string }) => Promise<unknown>;
    };
  })
    .from("platform_settings")
    .upsert(
      {
        key: GPU_DEPLOY_KEY,
        value: enabled,
        updated_at: new Date().toISOString(),
        updated_by: userId ?? null,
      },
      { onConflict: "key" },
    );
  gpuCache = { value: enabled, at: now() };
}
