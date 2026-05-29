import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasValidCronBearerToken } from "@/lib/security/cron-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { PlatformAppBandwidthService } from "@/lib/services/platform-app-bandwidth";

const RequestSchema = z
  .object({
    limit: z.number().int().min(1).max(500).optional(),
    app_id: z.string().uuid().optional(),
    // When true, augment the DB app list with apps discovered from Kubernetes.
    // Useful when apps are deployed but not yet present in the bandwidth table.
    include_k8s_discovery: z.boolean().optional(),
  })
  .optional();

type PlatformAppRow = {
  id: string;
  name: string;
  user_id: string;
  size: string | null;
  status: string | null;
};

/**
 * POST /api/internal/platform-apps/bandwidth/sync
 *
 * Cron-only endpoint that:
 * 1. Loads running apps from Supabase (and optionally from Kubernetes discovery).
 * 2. Refreshes month-to-date network usage using delta-based counter accumulation.
 * 3. Enforces or lifts K8s Ingress restrictions based on the resulting lifecycle status.
 */
export async function POST(req: NextRequest) {
  if (!hasValidCronBearerToken(req)) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "Invalid or missing authorization" },
      { status: 401 }
    );
  }

  let body: z.infer<typeof RequestSchema> = undefined;
  try {
    body = RequestSchema.parse(await req.json().catch(() => undefined));
  } catch (error) {
    return NextResponse.json(
      {
        error: "INVALID_REQUEST",
        message: error instanceof Error ? error.message : "Invalid request",
      },
      { status: 400 }
    );
  }

  const supabase = await createServiceClient();

  // ── Step 1: Load apps from Supabase ─────────────────────────────────────────
  let query = supabase
    .from("platform_apps")
    .select("id, name, user_id, size, status")
    .in("status", ["running", "degraded", "building"])
    .order("created_at", { ascending: false })
    .limit(body?.limit ?? 100);

  if (body?.app_id) {
    query = query.eq("id", body.app_id);
  }

  const { data: dbApps, error: dbError } = await query;
  if (dbError) {
    return NextResponse.json(
      { error: "FETCH_FAILED", message: dbError.message },
      { status: 500 }
    );
  }

  // ── Step 2: Augment with K8s-discovered apps (if requested) ──────────────────
  let discoveredCount = 0;
  if (body?.include_k8s_discovery && !body?.app_id) {
    try {
      const k8sAppNames = await PlatformAppBandwidthService.discoverAppNamesFromKubernetes();
      const untracked = await PlatformAppBandwidthService.findAppsWithoutBandwidthRecord(k8sAppNames);

      // Merge: add untracked apps that are not already in the DB result set.
      const existingIds = new Set<string>((dbApps ?? []).map((a: PlatformAppRow) => a.id));
      for (const app of untracked) {
        if (!existingIds.has(app.id)) {
          (dbApps as PlatformAppRow[]).push({ ...app, status: "running" });
          existingIds.add(app.id);
          discoveredCount += 1;
        }
      }

      if (discoveredCount > 0) {
        console.log(
          `[BandwidthSync] K8s discovery found ${discoveredCount} additional app(s) without bandwidth records`
        );
      }
    } catch (err) {
      console.warn("[BandwidthSync] K8s discovery failed (continuing with DB list):", err);
    }
  }

  const apps = (dbApps ?? []) as PlatformAppRow[];
  const appIds = apps.map((a) => a.id);

  // ── Step 3: Pre-load which apps are currently restricted ──────────────────────
  // Queries both the current month AND the previous month so that apps restricted
  // at the end of last month have their K8s Ingress annotation removed on the first
  // sync of the new period (month-rollover correctness).
  const prevRestrictedSet = new Set<string>();
  if (appIds.length > 0) {
    const now = new Date();
    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
      .toISOString()
      .slice(0, 10);
    const prevMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const prevPeriodStart = prevMonthDate.toISOString().slice(0, 10);

    const { data: prevStates } = await supabase
      .from("platform_app_bandwidth_usage_monthly")
      .select("app_id")
      .in("app_id", appIds)
      .in("period_start", [periodStart, prevPeriodStart])
      .eq("lifecycle_status", "restricted");
    for (const r of prevStates ?? []) {
      prevRestrictedSet.add(r.app_id as string);
    }
  }

  // ── Step 4: Sync each app ─────────────────────────────────────────────────────
  const results: {
    app_id: string;
    app_name: string;
    status: string;
    usage_status?: string;
    lifecycle_status?: string;
    total_bytes?: number;
    restriction_applied?: boolean;
    error?: string;
  }[] = [];

  for (const app of apps) {
    try {
      const usage = await PlatformAppBandwidthService.refreshCurrentUsage({
        appId: app.id,
        appName: app.name,
        userId: app.user_id,
        size: app.size,
      });

      // Only touch the K8s Ingress when the app is restricted or was restricted
      // before this sync run (transition: restricted → ok needs removal).
      // Skipping healthy apps avoids N K8s readNamespacedIngress calls per cycle.
      let restrictionApplied: boolean | undefined;
      const needsEnforcement =
        usage.lifecycleStatus === "restricted" || prevRestrictedSet.has(app.id);
      if (needsEnforcement) {
        try {
          await PlatformAppBandwidthService.syncRestrictionState(app.name, usage.lifecycleStatus);
          restrictionApplied = usage.lifecycleStatus === "restricted";
        } catch (restrictErr) {
          console.warn(
            `[BandwidthSync] Restriction sync failed for ${app.name}:`,
            restrictErr instanceof Error ? restrictErr.message : restrictErr
          );
        }
      }

      results.push({
        app_id: app.id,
        app_name: app.name,
        status: "ok",
        usage_status: usage.status,
        lifecycle_status: usage.lifecycleStatus,
        total_bytes: usage.totalBytes,
        restriction_applied: restrictionApplied,
      });
    } catch (error) {
      results.push({
        app_id: app.id,
        app_name: app.name,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  const failed = results.filter((r) => r.status === "failed").length;
  const restricted = results.filter((r) => r.restriction_applied === true).length;

  return NextResponse.json({
    processed: results.length,
    failed,
    restricted,
    k8s_discovered: discoveredCount,
    results,
  });
}
