/**
 * GET /api/inference/notifications  — current org's notification settings
 * PUT /api/inference/notifications  — replace settings (org admin/owner)
 *
 * Auto-creates a default row on first GET so callers don't have to deal
 * with a 404 / "settings not set" edge case.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getActiveOrgForUser } from "@/lib/inference/orgs";
import { auditContextFrom, recordAudit } from "@/lib/inference/audit";

const EVENTS = [
  "finetune.succeeded",
  "finetune.failed",
  "batch.completed",
  "batch.failed",
  "serving_pod.ready",
  "serving_pod.stopped",
  "org.spend_threshold_reached",
] as const;

const settingsSchema = z.object({
  events_subscribed: z.array(z.enum(EVENTS)).max(EVENTS.length),
  email_recipients: z.array(z.string().email()).max(5),
  in_app_enabled: z.boolean(),
  webhook_enabled: z.boolean(),
  webhook_url: z
    .string()
    .url()
    .refine((u) => u.startsWith("https://"), "Webhook URL must be https")
    .nullable()
    .optional(),
  /** Pass through to UPDATE only if explicitly provided. Omit to keep
   *  the current secret unchanged (rotation has a dedicated path). */
  webhook_secret: z.string().min(16).max(200).nullable().optional(),
});

const DEFAULT_SETTINGS = {
  events_subscribed: ["finetune.succeeded", "finetune.failed", "batch.completed"] as const,
  email_recipients: [] as string[],
  in_app_enabled: true,
  webhook_enabled: false,
  webhook_url: null as string | null,
  webhook_secret: null as string | null,
};

export async function GET() {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;
  const org = await getActiveOrgForUser(auth.user!.id);
  if (!org) return NextResponse.json({ error: "No inference org" }, { status: 404 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data } = await supabase
    .schema("inference")
    .from("notification_settings")
    .select("events_subscribed, email_recipients, in_app_enabled, webhook_url, webhook_enabled, updated_at")
    .eq("org_id", org.org_id)
    .maybeSingle();

  // Always shape the response so the dashboard's form has stable initial
  // state — never surface secrets, mask the webhook secret existence.
  const row = (data ?? {}) as Record<string, unknown>;
  return NextResponse.json({
    events_subscribed: row.events_subscribed ?? DEFAULT_SETTINGS.events_subscribed,
    email_recipients: row.email_recipients ?? [],
    in_app_enabled: row.in_app_enabled ?? true,
    webhook_url: row.webhook_url ?? null,
    webhook_enabled: row.webhook_enabled ?? false,
    webhook_secret_set: !!row.webhook_url, // existence only
    updated_at: row.updated_at ?? null,
  });
}

export async function PUT(request: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const rl = await limitByUser(auth.user!.id, {
    prefix: "rl:inf-notif-config",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const org = await getActiveOrgForUser(auth.user!.id);
  if (!org) return NextResponse.json({ error: "No inference org" }, { status: 404 });
  if (org.role !== "owner" && org.role !== "admin") {
    return NextResponse.json(
      { error: "Only owners and admins can change notification settings" },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation error", details: parsed.error.issues },
      { status: 400 }
    );
  }
  const p = parsed.data;
  if (p.webhook_enabled && !p.webhook_url) {
    return NextResponse.json(
      { error: "webhook_url is required when webhook_enabled is true" },
      { status: 400 }
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Build the upsert payload — only include webhook_secret if the caller
  // explicitly passed one (keeps existing secret on rotation-less saves).
  type SettingsUpsert = {
    org_id: string;
    events_subscribed: string[];
    email_recipients: string[];
    in_app_enabled: boolean;
    webhook_url: string | null;
    webhook_enabled: boolean;
    updated_at: string;
    webhook_secret?: string | null;
  };
  const payload: SettingsUpsert = {
    org_id: org.org_id,
    events_subscribed: p.events_subscribed,
    email_recipients: p.email_recipients,
    in_app_enabled: p.in_app_enabled,
    webhook_url: p.webhook_url ?? null,
    webhook_enabled: p.webhook_enabled,
    updated_at: new Date().toISOString(),
  };
  if (p.webhook_secret !== undefined) {
    payload.webhook_secret = p.webhook_secret;
  }

  const { error } = await supabase
    .schema("inference")
    .from("notification_settings")
    .upsert(payload, { onConflict: "org_id" });

  if (error) {
    console.error("[notifications PUT] upsert error:", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }

  const ctx = auditContextFrom(request);
  void recordAudit({
    orgId: org.org_id,
    actorUserId: auth.user!.id,
    action: "notifications.config_updated",
    targetType: "notification_settings",
    targetId: org.org_id,
    metadata: {
      events_subscribed: p.events_subscribed,
      email_recipients_count: p.email_recipients.length,
      webhook_enabled: p.webhook_enabled,
      webhook_url_changed: p.webhook_url !== undefined,
      webhook_secret_rotated: p.webhook_secret !== undefined,
    },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return NextResponse.json({ success: true });
}
