import { createServiceClient } from "@/lib/supabase/server";
import type { AppWritePort } from "@/lib/domain-service/core/ports";

/**
 * Writes app-level domain denormalisation fields:
 *  - has_custom_domains  (boolean flag used by deployment pipeline)
 *  - custom_domain       (stores the primary/last domain for quick reference)
 *
 * These fields live on platform_apps and are updated as a side-effect of
 * domain activation and removal — they are NOT the source of truth.
 * The source of truth is always platform_app_domains.
 */
export class SupabaseAppWriteAdapter implements AppWritePort {
  async setHasCustomDomains(appId: string, hasCustomDomains: boolean): Promise<void> {
    const supabase = await createServiceClient();
    await supabase
      .from("platform_apps")
      .update({
        has_custom_domains: hasCustomDomains,
        updated_at: new Date().toISOString(),
      })
      .eq("id", appId);
    // Non-throwing: app flag is denormalised; failure is logged but not fatal.
  }

  async clearCustomDomain(appId: string, clearedDomain: string): Promise<void> {
    const supabase = await createServiceClient();

    // Fetch both pieces of state in parallel to avoid sequential round-trips.
    const [{ data: nextDomain }, { data: app }] = await Promise.all([
      // Find the next active domain to promote as primary, if any.
      supabase
        .from("platform_app_domains")
        .select("id, domain")
        .eq("app_id", appId)
        .eq("status", "active")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      // Read the current custom_domain so we only update it when necessary.
      supabase
        .from("platform_apps")
        .select("custom_domain")
        .eq("id", appId)
        .maybeSingle(),
    ]);

    const hasRemaining = Boolean(nextDomain);

    // Build the app update. Always keep has_custom_domains in sync.
    const appUpdate: Record<string, unknown> = {
      has_custom_domains: hasRemaining,
      updated_at: new Date().toISOString(),
    };

    // Only overwrite custom_domain when the field still points to the removed domain.
    if (app?.custom_domain === clearedDomain) {
      appUpdate.custom_domain = nextDomain?.domain ?? null;
    }

    // If another active domain exists, promote it to primary.
    if (nextDomain) {
      await supabase
        .from("platform_app_domains")
        .update({ is_primary: true, updated_at: new Date().toISOString() })
        .eq("id", nextDomain.id);
    }

    await supabase.from("platform_apps").update(appUpdate).eq("id", appId);
  }
}
