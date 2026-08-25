/**
 * Service-role client for admin routes that read the `inference` schema.
 *
 * `createWorkerClient()` is typed to the public|billing schemas only, so admin
 * routes touching `inference` use the same plain service client every
 * app/api/inference/* route already uses. Centralised here so the schema access
 * pattern exists in one place rather than being re-declared per route.
 *
 * Callers MUST still gate on requireAdmin() — this client bypasses RLS.
 *
 * Doc: nextstespsAI/21-admin-platform.md (§5).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Columns the pricing admin reads; kept in one place so route and type agree. */
export const MODEL_COLUMNS =
  "model_id, display_name, is_active, serving_type, upstream_provider, upstream_model_id, pricing, upstream_pricing";

export function inferenceAdminClient(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}
