import { createClient } from "@supabase/supabase-js";

import { requireAuthProfile } from "@/lib/supabase/auth";
import { getOrBootstrapOrgForUser } from "@/lib/inference/orgs";
import {
  NotificationsSettings,
  type NotificationsConfig,
  type DeliveryRow,
} from "@/components/dashboard/inference/notifications";

export const dynamic = "force-dynamic";

async function loadConfig(orgId: string): Promise<NotificationsConfig> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const { data } = await supabase
    .schema("inference")
    .from("notification_settings")
    .select(
      "events_subscribed, email_recipients, in_app_enabled, webhook_url, webhook_enabled, updated_at"
    )
    .eq("org_id", orgId)
    .maybeSingle();

  const row = (data as Record<string, unknown> | null) ?? {};
  return {
    events_subscribed: (row.events_subscribed as NotificationsConfig["events_subscribed"]) ?? [
      "finetune.succeeded",
      "finetune.failed",
      "batch.completed",
    ],
    email_recipients: (row.email_recipients as string[]) ?? [],
    in_app_enabled: (row.in_app_enabled as boolean) ?? true,
    webhook_url: (row.webhook_url as string | null) ?? null,
    webhook_enabled: (row.webhook_enabled as boolean) ?? false,
    webhook_secret_set: !!row.webhook_url,
    updated_at: (row.updated_at as string | null) ?? null,
  };
}

async function loadDeliveries(orgId: string): Promise<DeliveryRow[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const { data } = await supabase
    .schema("inference")
    .from("webhook_deliveries")
    .select(
      "id, event, webhook_url, attempt, status, http_status, response_excerpt, created_at, delivered_at"
    )
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<DeliveryRow[]>();
  return data ?? [];
}

export default async function NotificationsPage() {
  const user = await requireAuthProfile();
  const org = await getOrBootstrapOrgForUser(user.id, user.email ?? "");
  const [config, deliveries] = await Promise.all([
    loadConfig(org.org_id),
    loadDeliveries(org.org_id),
  ]);

  return (
    <NotificationsSettings
      initialConfig={config}
      initialDeliveries={deliveries}
      orgName={org.org_name}
      canMutate={org.role === "owner" || org.role === "admin"}
    />
  );
}
