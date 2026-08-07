/**
 * Service-role Supabase client. Bypasses RLS — only the runners and the
 * Next.js API use this key, mounted via k8s Secret, never baked into the image.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface SupabaseConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
}

export function makeSupabase(cfg: SupabaseConfig): SupabaseClient {
  return createClient(cfg.supabaseUrl, cfg.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
