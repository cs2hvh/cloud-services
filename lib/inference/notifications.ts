/**
 * Inference event notifications — fan out a single event to all the
 * channels an org has enabled in inference.notification_settings:
 *
 *   • In-app  — write a row into the existing notifications table
 *   • Email   — render the inferenceEvent template via Resend
 *   • Webhook — HMAC-signed POST to the customer's URL, logged to
 *               inference.webhook_deliveries for debugging
 *
 * Called from server routes (FT webhook receiver, batch processor,
 * serving-pod lifecycle) in a fire-and-forget pattern. Failures here
 * NEVER bubble up to the caller — a notification miss is much better
 * than a customer-visible 500 on the actual operation.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHmac } from "crypto";
import { emailService } from "@/lib/email/service";
import { NotificationService } from "@/lib/notifications/service";
import type { InferenceEventName } from "@/lib/email/types";
import { customerSafeErrorMessage } from "@/lib/inference/error-messages";

const DASHBOARD_BASE =
  process.env.NEXT_PUBLIC_DASHBOARD_URL ?? "https://ahurasense.com";
const WEBHOOK_USER_AGENT = "ahura-inference-webhook/1.0";
const WEBHOOK_TIMEOUT_MS = 8000;
const WEBHOOK_PAYLOAD_MAX_BYTES = 16 * 1024; // 16KB

export interface InferenceEventInput {
  /** Org receiving the notification. */
  orgId: string;
  /** Event name — must match inference.notification_event enum. */
  event: InferenceEventName;
  /** Object id this event is about (FT id, batch id, etc.). */
  resourceId: string;
  /** Short human-readable title, used as the in-app notification title
   *  AND the email card heading. */
  title: string;
  /** One-line summary for the in-app message + email body intro. */
  summary: string;
  /** Key/value pairs rendered in the email's details card. Keep <8. */
  details: Array<{ label: string; value: string }>;
  /** Error message — included in email + webhook payload when set. */
  errorMessage?: string;
  /** Dashboard path to link to (e.g. "/dashboard/services/inference/fine-tuning"). */
  dashboardPath?: string;
  /** Action button label. */
  actionLabel?: string;
  /** Optional user_id to attach the in-app notification to. If omitted,
   *  the in-app notification is sent to the org owner only. */
  userId?: string;
  /** When true, skip the events_subscribed filter — used by the
   *  /notifications/test endpoint so a user can verify their channels
   *  even before they've explicitly subscribed to the test event type. */
  bypassSubscriptionFilter?: boolean;
}

/**
 * Fan out one event. Awaited callers can ignore the returned promise;
 * we never throw. Safe to drop into `void emit(...)` or `c.executionCtx.
 * waitUntil(emit(...))` style.
 */
export async function emitInferenceEvent(input: InferenceEventInput): Promise<void> {
  // Scrub any leaky upstream/internal terms before the message ever
  // leaves our process boundary (email, in-app, outbound webhook).
  const sanitizedError = input.errorMessage
    ? customerSafeErrorMessage(input.errorMessage)
    : undefined;
  input = { ...input, errorMessage: sanitizedError || undefined };

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Load the org's notification settings + a row to know who to email.
  // If no row exists, fall back to defaults (everything enabled except
  // webhook + no email recipients).
  const { data: orgRow } = await supabase
    .schema("inference")
    .from("orgs")
    .select("id, name, owner_user_id")
    .eq("id", input.orgId)
    .maybeSingle<{ id: string; name: string; owner_user_id: string }>();
  if (!orgRow) {
    // Org gone? Skip silently.
    return;
  }

  const { data: settings } = await supabase
    .schema("inference")
    .from("notification_settings")
    .select("events_subscribed, email_recipients, in_app_enabled, webhook_url, webhook_secret, webhook_enabled")
    .eq("org_id", input.orgId)
    .maybeSingle<{
      events_subscribed: InferenceEventName[];
      email_recipients: string[];
      in_app_enabled: boolean;
      webhook_url: string | null;
      webhook_secret: string | null;
      webhook_enabled: boolean;
    }>();

  // Default = subscribe to everything FT+batch related, in-app on, no
  // email, no webhook. Mirrors the migration's column defaults so a
  // brand-new org gets in-app notifications out of the box.
  const eventsSubscribed = settings?.events_subscribed ?? [
    "finetune.succeeded",
    "finetune.failed",
    "batch.completed",
  ];
  if (!input.bypassSubscriptionFilter && !eventsSubscribed.includes(input.event)) {
    return;
  }

  const dashboardUrl = input.dashboardPath
    ? `${DASHBOARD_BASE.replace(/\/+$/, "")}${input.dashboardPath}`
    : undefined;

  // ─── Channel 1: in-app ────────────────────────────────────────
  if (settings?.in_app_enabled !== false) {
    try {
      const recipient = input.userId ?? orgRow.owner_user_id;
      // ActionType is a restricted enum; map our event suffix to the
      // closest allowed value and carry the FULL event name in metadata.
      const action: "deployed" | "failed" | "updated" =
        input.event.endsWith(".failed")
          ? "failed"
          : input.event.endsWith(".ready") || input.event.endsWith(".succeeded") || input.event.endsWith(".completed")
            ? "deployed"
            : "updated";
      await NotificationService.create({
        user_id: recipient,
        type: input.event.endsWith(".failed") ? "warning" : "info",
        title: input.title,
        message: input.summary,
        service_type: "inference",
        action,
        metadata: {
          event: input.event,
          resource_id: input.resourceId,
          dashboard_url: dashboardUrl ?? null,
          ...(input.errorMessage ? { error: input.errorMessage } : {}),
        },
      });
    } catch (err) {
      console.warn("[notifications] in-app failed:", err instanceof Error ? err.message : err);
    }
  }

  // ─── Channel 2: email ─────────────────────────────────────────
  if (settings?.email_recipients && settings.email_recipients.length > 0) {
    try {
      await emailService.sendTemplate({
        template: "inferenceEvent",
        to: settings.email_recipients,
        data: {
          recipientName: orgRow.name || "there",
          event: input.event,
          summary: input.summary,
          items: input.details,
          errorMessage: input.errorMessage,
          actionUrl: dashboardUrl,
          actionLabel: input.actionLabel ?? "Open dashboard",
          preview: input.summary,
        },
      });
    } catch (err) {
      console.warn("[notifications] email failed:", err instanceof Error ? err.message : err);
    }
  }

  // ─── Channel 3: outbound webhook ──────────────────────────────
  if (settings?.webhook_enabled && settings.webhook_url && settings.webhook_secret) {
    const payload = {
      event: input.event,
      occurred_at: new Date().toISOString(),
      org_id: input.orgId,
      resource_id: input.resourceId,
      title: input.title,
      summary: input.summary,
      details: Object.fromEntries(input.details.map((d) => [d.label, d.value])),
      error: input.errorMessage ?? null,
    };
    await deliverWebhook(supabase, {
      orgId: input.orgId,
      event: input.event,
      url: settings.webhook_url,
      secret: settings.webhook_secret,
      payload,
    });
  }
}

// ─── Webhook delivery ──────────────────────────────────────────────

interface WebhookDeliveryInput {
  orgId: string;
  event: InferenceEventName;
  url: string;
  secret: string;
  payload: Record<string, unknown>;
}

async function deliverWebhook(
  supabase: SupabaseClient,
  input: WebhookDeliveryInput
): Promise<void> {
  const body = JSON.stringify(input.payload);
  if (body.length > WEBHOOK_PAYLOAD_MAX_BYTES) {
    console.warn(
      `[notifications] webhook payload too large (${body.length} bytes), skipping`
    );
    return;
  }

  // HMAC-SHA256 over the request body with the customer's secret.
  // Receiver verifies: timingSafeEqual(hmac(body, secret), header).
  const signature = createHmac("sha256", input.secret).update(body).digest("hex");

  // Insert a pending delivery row up front so even if our process is
  // killed mid-POST the customer sees the attempt in their dashboard.
  const { data: row, error: insErr } = await supabase
    .schema("inference")
    .from("webhook_deliveries")
    .insert({
      org_id: input.orgId,
      event: input.event,
      payload: input.payload,
      webhook_url: input.url,
      attempt: 1,
      status: "pending",
    })
    .select("id")
    .single();
  if (insErr || !row) {
    console.warn("[notifications] webhook log insert failed:", insErr?.message);
    return;
  }
  const deliveryId = (row as { id: string }).id;

  // Fire the POST with a bounded timeout.
  const startedAt = Date.now();
  let httpStatus = 0;
  let responseExcerpt = "";
  let delivered = false;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), WEBHOOK_TIMEOUT_MS);
    const r = await fetch(input.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": WEBHOOK_USER_AGENT,
        "X-Ahura-Signature": `sha256=${signature}`,
        "X-Ahura-Event": input.event,
        "X-Ahura-Delivery-Id": deliveryId,
      },
      body,
      signal: ctrl.signal,
    });
    clearTimeout(t);
    httpStatus = r.status;
    const text = await r.text();
    responseExcerpt = text.slice(0, 500);
    // 2xx = delivered. Anything else = failed.
    delivered = r.status >= 200 && r.status < 300;
  } catch (err) {
    responseExcerpt = err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500);
  }

  await supabase
    .schema("inference")
    .from("webhook_deliveries")
    .update({
      status: delivered ? "delivered" : "failed",
      http_status: httpStatus || null,
      response_excerpt: responseExcerpt,
      delivered_at: delivered ? new Date().toISOString() : null,
      // We don't implement automatic retries in v1 — the customer can
      // re-fire from the dashboard if needed. Mark gave_up=null so the
      // future retry worker can pick this up if/when we add one.
    })
    .eq("id", deliveryId);

  void startedAt;
}
