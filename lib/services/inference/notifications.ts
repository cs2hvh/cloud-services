import { recordAudit } from "@/lib/inference/audit";
import { createServiceClient } from "@/lib/supabase/server";

type SR<T> = { success: true; data: T } | { success: false; error: string; status?: number };

const DEFAULT_SETTINGS = {
  events_subscribed: ["finetune.succeeded", "finetune.failed", "batch.completed"],
  email_recipients: [] as string[],
  in_app_enabled: true,
  webhook_enabled: false,
  webhook_url: null as string | null,
};

export interface NotificationSettingsPatch {
  events_subscribed?: string[];
  email_recipients?: string[];
  in_app_enabled?: boolean;
  webhook_enabled?: boolean;
  webhook_url?: string | null;
  webhook_secret?: string | null;
}

export const InferenceNotificationService = {
  async get(orgId: string): Promise<SR<unknown>> {
    const db = await createServiceClient();
    const { data } = await db
      .schema("inference")
      .from("notification_settings")
      .select("events_subscribed, email_recipients, in_app_enabled, webhook_url, webhook_enabled, updated_at")
      .eq("org_id", orgId)
      .maybeSingle();

    const row = (data ?? {}) as Record<string, unknown>;
    return {
      success: true,
      data: {
        events_subscribed: row.events_subscribed ?? DEFAULT_SETTINGS.events_subscribed,
        email_recipients: row.email_recipients ?? [],
        in_app_enabled: row.in_app_enabled ?? true,
        webhook_url: row.webhook_url ?? null,
        webhook_enabled: row.webhook_enabled ?? false,
        webhook_secret_set: !!row.webhook_url,
        updated_at: row.updated_at ?? null,
      },
    };
  },

  async update(orgId: string, userId: string, patch: NotificationSettingsPatch, audit: { ipAddress: string | null; userAgent: string | null }): Promise<SR<unknown>> {
    if (patch.webhook_enabled && !patch.webhook_url) {
      return { success: false, error: "webhook_url is required when webhook_enabled is true", status: 400 };
    }

    const db = await createServiceClient();
    const upsertData: Record<string, unknown> = {
      org_id: orgId,
      events_subscribed: patch.events_subscribed,
      email_recipients: patch.email_recipients,
      in_app_enabled: patch.in_app_enabled,
      webhook_enabled: patch.webhook_enabled,
      webhook_url: patch.webhook_url,
      updated_at: new Date().toISOString(),
    };
    if (patch.webhook_secret !== undefined) upsertData.webhook_secret = patch.webhook_secret;

    const { error } = await db
      .schema("inference")
      .from("notification_settings")
      .upsert(upsertData, { onConflict: "org_id" });

    if (error) return { success: false, error: "Failed to update notification settings" };

    void recordAudit({
      orgId,
      actorUserId: userId,
      action: "notifications.config_updated",
      targetType: "notification_settings",
      targetId: orgId,
      metadata: {
        events_subscribed: patch.events_subscribed,
        email_recipients_count: patch.email_recipients?.length ?? 0,
        webhook_enabled: patch.webhook_enabled,
        webhook_url_changed: patch.webhook_url !== undefined,
        webhook_secret_rotated: patch.webhook_secret !== undefined,
      },
      ...audit,
    });

    return { success: true, data: { success: true } };
  },
};
