import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/auth/check-admin";
// checkAdminAuth returns { authorized, user } — no built-in NextResponse
import { createServiceClient } from "@/lib/supabase/server";
import { monthBounds, dateOnly } from "@/lib/services/platform-app-bandwidth/utils";
import { PlatformAppBandwidthService, removeBandwidthRestriction } from "@/lib/services/platform-app-bandwidth";
import { logError, sanitizeError } from "@/lib/api/error-sanitizer";

export type AdminBandwidthRow = {
  app_id: string;
  app_name: string;
  app_size: string | null;
  app_status: string | null;
  user_id: string;
  period_start: string;
  ingress_bytes: number;
  egress_bytes: number;
  total_bytes: number;
  quota_included_bytes: number;
  purchased_bytes: number;
  quota_total_bytes: number;
  remaining_bytes: number | null;
  percent_used: number | null;
  lifecycle_status: string;
  policy_action: string;
  last_sampled_at: string | null;
  restricted_at: string | null;
  restored_at: string | null;
};

/**
 * GET /api/admin/platform-apps/bandwidth
 * Returns current-month bandwidth usage for all apps, sorted by total_bytes desc.
 */
export async function GET(_req: NextRequest) {
  const auth = await checkAdminAuth();
  if (!auth.authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const supabase = await createServiceClient();
    const { start } = monthBounds();
    const periodStart = dateOnly(start);

    // Bandwidth rows for current month
    const { data: bwRows, error: bwError } = await supabase
      .from("platform_app_bandwidth_usage_monthly")
      .select("id, app_id, user_id, period_start, period_end, ingress_bytes, egress_bytes, total_bytes, purchased_bytes, lifecycle_status, source, last_sampled_at, restricted_at, restored_at, metadata, created_at, updated_at")
      .eq("period_start", periodStart)
      .order("total_bytes", { ascending: false });

    if (bwError) throw bwError;

    if (!bwRows || bwRows.length === 0) {
      return NextResponse.json({ rows: [], period_start: periodStart });
    }

    // Enrich with app metadata
    const appIds = bwRows.map((r) => r.app_id as string);
    const { data: apps } = await supabase
      .from("platform_apps")
      .select("id, name, size, status")
      .in("id", appIds);

    const appMap = new Map<string, { name: string; size: string | null; status: string | null }>();
    for (const app of apps ?? []) {
      appMap.set(app.id as string, { name: app.name, size: app.size, status: app.status });
    }

    const rows: AdminBandwidthRow[] = await Promise.all(bwRows.map(async (r) => {
      const app = appMap.get(r.app_id as string);
      const quota = await PlatformAppBandwidthService.getQuotaForSize(app?.size);
      const summary = PlatformAppBandwidthService.summarizeStoredUsage(r, quota, {
        appId: r.app_id,
        userId: r.user_id,
      });
      const includedQuotaBytes = quota.totalBytes ?? 0;

      return {
        app_id: r.app_id,
        app_name: app?.name ?? r.app_id,
        app_size: app?.size ?? null,
        app_status: app?.status ?? null,
        user_id: r.user_id,
        period_start: r.period_start,
        ingress_bytes: Number(r.ingress_bytes),
        egress_bytes: Number(r.egress_bytes),
        total_bytes: Number(r.total_bytes),
        quota_included_bytes: includedQuotaBytes,
        purchased_bytes: summary.purchasedBytes,
        quota_total_bytes: includedQuotaBytes + summary.purchasedBytes,
        remaining_bytes: summary.remainingBytes,
        percent_used: summary.percentUsed,
        lifecycle_status: summary.lifecycleStatus,
        policy_action: summary.policyAction,
        last_sampled_at: r.last_sampled_at,
        restricted_at: r.restricted_at,
        restored_at: r.restored_at,
      };
    }));

    return NextResponse.json({ rows, period_start: periodStart });
  } catch (err) {
    logError("admin/platform-apps/bandwidth GET", err);
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 });
  }
}

/**
 * POST /api/admin/platform-apps/bandwidth
 * Admin actions: lift_restriction, force_sync
 * Body: { action: "lift_restriction" | "force_sync", app_id: string, app_name: string }
 */
export async function POST(req: NextRequest) {
  const auth = await checkAdminAuth();
  if (!auth.authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { action, app_id, app_name } = body as {
      action: "lift_restriction" | "force_sync";
      app_id: string;
      app_name: string;
    };

    if (!action || !app_id || !app_name) {
      return NextResponse.json({ error: "Missing required fields: action, app_id, app_name" }, { status: 400 });
    }

    if (action === "lift_restriction") {
      // Remove the K8s Ingress restriction annotation
      const result = await removeBandwidthRestriction(app_name);

      // Update the DB row to mark as restored so the next sync doesn't immediately re-restrict
      const supabase = await createServiceClient();
      const { start } = monthBounds();
      await supabase
        .from("platform_app_bandwidth_usage_monthly")
        .update({
          lifecycle_status: "ok",
          restored_at: new Date().toISOString(),
          restricted_at: null,
        })
        .eq("app_id", app_id)
        .eq("period_start", dateOnly(start));

      return NextResponse.json({ ok: true, removed: result.removed, error: result.error });
    }

    if (action === "force_sync") {
      const supabase = await createServiceClient();
      const { data: app } = await supabase
        .from("platform_apps")
        .select("id, name, size, user_id")
        .eq("id", app_id)
        .single();

      if (!app) {
        return NextResponse.json({ error: "App not found" }, { status: 404 });
      }

      const usage = await PlatformAppBandwidthService.refreshCurrentUsage({
        appId: app.id,
        appName: app.name,
        userId: app.user_id,
        size: app.size,
      });
      await PlatformAppBandwidthService.syncRestrictionState(app.name, usage.lifecycleStatus);

      return NextResponse.json({ ok: true, sync: { usage } });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err) {
    logError("admin/platform-apps/bandwidth POST", err);
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 });
  }
}
