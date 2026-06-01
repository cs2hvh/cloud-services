import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { RunnerEnv } from "./env.js";

export function makeSupabase(env: RunnerEnv): SupabaseClient {
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
