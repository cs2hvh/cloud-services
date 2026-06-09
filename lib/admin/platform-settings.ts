import { createServiceClient } from "@/lib/supabase/server";

// Platform-wide admin toggles, stored in the `platform_settings` key-value table
// and read/written only via the service-role client.

const GPU_DEPLOY_KEY = "gpu_deploy_enabled";

// Tiny in-memory cache so the inventory poll (~6s) and create path don't hit the
// DB on every call. Short TTL keeps the admin toggle near-instant.
let gpuCache: { value: boolean; at: number } | null = null;
const TTL_MS = 10_000;

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
