/**
 * Service-role Supabase client. Bypasses RLS — only this runner and the
 * Next.js API talk to inference.finetunes with this key. The key is mounted
 * via k8s Secret, never embedded in the image.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { RunnerEnv } from "./env.js";

export function makeSupabase(env: RunnerEnv): SupabaseClient {
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
