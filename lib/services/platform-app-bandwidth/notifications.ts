import { createServiceClient } from "@/lib/supabase/server";
import { NotificationService } from "@/lib/notifications/service";
import { bytesToDisplay } from "./utils";
import type {
  BandwidthEventType,
  BandwidthLifecycleStatus,
  BandwidthUsageSummary,
} from "./types";

// ── Transition detection ──────────────────────────────────────────────────────

/**
 * Return which lifecycle events should fire given the previous and current status.
 *
 * Events are intentional-edge-triggered: they fire once on the upward transition
 * (80% threshold, 90% threshold, etc.). The DB unique constraint on
 * (app_id, period_start, event_type) provides the final deduplication guarantee,
 * so the logic here is a pre-filter that avoids unnecessary insert attempts.
 */
export function lifecycleEventsForTransition(
  previousStatus: BandwidthLifecycleStatus,
  summary: BandwidthUsageSummary
): BandwidthEventType[] {
  const events: BandwidthEventType[] = [];
  const prev = previousStatus;
  const curr = summary.lifecycleStatus;
  const percent = summary.percentUsed ?? 0;

  if (percent >= 80 && prev === "ok") events.push("warning_80");
  if (percent >= 90 && (prev === "ok" || prev === "warning")) events.push("critical_90");
  if (percent >= 100 && prev !== "overage" && prev !== "restricted" && prev !== "critical")
    events.push("limit_reached");

  if (curr === "overage" && prev !== "overage") events.push("overage_started");
  if (curr === "restricted" && prev !== "restricted") events.push("traffic_restricted");
  if (curr === "ok" && prev !== "ok") events.push("traffic_restored");

  return events;
}

// ── Notification copy ─────────────────────────────────────────────────────────

type NotificationCopy = {
  type: "info" | "warning" | "error" | "success";
  title: string;
  message: string;
};

export function notificationCopy(
  eventType: BandwidthEventType,
  appName: string,
  summary: BandwidthUsageSummary
): NotificationCopy {
  const used = bytesToDisplay(summary.totalBytes);
  const limit = bytesToDisplay(summary.quota.totalBytes);
  const pct = summary.percentUsed !== null ? `${summary.percentUsed}%` : "";
  const suffix = pct ? `${used} of ${limit} (${pct})` : used;

  switch (eventType) {
    case "warning_80":
      return {
        type: "warning",
        title: "Bandwidth usage at 80%",
        message: `"${appName}" has used ${suffix} this month. Consider upgrading or reducing proxied traffic before limits apply.`,
      };
    case "critical_90":
      return {
        type: "warning",
        title: "Bandwidth usage at 90%",
        message: `"${appName}" has used ${suffix} this month. Traffic is approaching the monthly limit.`,
      };
    case "limit_reached":
      return {
        type: "error",
        title: "Bandwidth limit reached",
        message: `"${appName}" has reached its monthly limit (${suffix}). Buy a bandwidth pack now to avoid traffic being blocked.`,
      };
    case "overage_started":
      return {
        type: "warning",
        title: "Bandwidth overage billing started",
        message: `"${appName}" exceeded included bandwidth. Overage billing now applies for additional transfer.`,
      };
    case "traffic_restricted":
      return {
        type: "error",
        title: "Application traffic restricted",
        message: `"${appName}" exceeded its monthly bandwidth limit. Traffic is blocked. Buy a bandwidth pack to restore access immediately, or wait for the next billing period.`,
      };
    case "traffic_restored":
      return {
        type: "success",
        title: "Application bandwidth restored",
        message: `"${appName}" is back within its bandwidth allowance. Traffic restrictions have been removed.`,
      };
  }
}

// ── Event emission ────────────────────────────────────────────────────────────

type EmitArgs = {
  appId: string;
  appName: string;
  userId: string;
  periodStart: string;
  previousStatus: BandwidthLifecycleStatus;
  summary: BandwidthUsageSummary;
};

export async function emitLifecycleEvents(args: EmitArgs): Promise<void> {
  const events = lifecycleEventsForTransition(args.previousStatus, args.summary);
  if (events.length === 0) return;

  const supabase = await createServiceClient();

  for (const eventType of events) {
    // Insert the event record. The unique constraint (app_id, period_start, event_type)
    // guarantees each event is recorded at most once per billing month.
    const { data: event, error } = await (supabase as any)
      .from("platform_app_bandwidth_events")
      .insert({
        app_id: args.appId,
        user_id: args.userId,
        period_start: args.periodStart,
        event_type: eventType,
        usage_bytes: args.summary.totalBytes,
        quota_bytes: args.summary.quota.totalBytes,
        percent_used: args.summary.percentUsed,
        metadata: {
          app_name: args.appName,
          lifecycle_status: args.summary.lifecycleStatus,
          policy_action: args.summary.policyAction,
        },
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") continue; // already emitted this event this month
      console.warn(`[notifications] Failed to record ${eventType}:`, error.message);
      continue;
    }

    const copy = notificationCopy(eventType, args.appName, args.summary);
    const notification = await NotificationService.create({
      user_id: args.userId,
      type: copy.type,
      title: copy.title,
      message: copy.message,
      service_type: "platform_app",
      service_id: args.appId,
      action: eventType === "traffic_restored" ? "updated" : "failed",
      metadata: {
        bandwidth_event_id: event?.id,
        bandwidth_event_type: eventType,
        appName: args.appName,
        usage: args.summary,
      },
    });

    if (notification.success && notification.id && event?.id) {
      await (supabase as any)
        .from("platform_app_bandwidth_events")
        .update({ notification_id: notification.id })
        .eq("id", event.id);
    }
  }
}
