import { createClient } from "@/lib/supabase/server";

/**
 * public.products was DROPPED on 2026-08-31 (archived in
 * pricing_archive_20260831) as part of the billing/pricing rebuild — see
 * docs/BILLING-HANDOFF.md. The shared queries (Products.get_by_type and
 * friends) swallow the resulting error and return [], which renders as
 * "0 plans" and looks like an empty-but-working catalog. This probe exists so
 * panel pages can say plainly that the catalog is offline instead of
 * degrading silently — the exact failure mode the pricing rebuild is about.
 */
export async function planCatalogOffline(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("products").select("id").limit(1);
    // 42P01 undefined_table once dropped; any error means "do not trust []".
    return Boolean(error);
  } catch {
    return true;
  }
}
