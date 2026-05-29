import { AppsV1Api } from "@kubernetes/client-node";
import kubeConfig from "@/lib/kubernetes";
import { createServiceClient } from "@/lib/supabase/server";
import { APP_NAMESPACE } from "./constants";
import { monthBounds, dateOnly } from "./utils";
import { k8sErrorMessage } from "./k8s-ingress";

// ── K8s deployment scan ───────────────────────────────────────────────────────

/**
 * Return bare app names (without the "-app" suffix) for all platform app
 * Deployments currently running in the cluster.
 *
 * The Jenkins pipeline names every Deployment `{appName}-app` and sets
 * the label `app: {appName}-app`. We filter by that label suffix and then
 * cross-reference with the platform_apps DB table so only known platform apps
 * are returned — this prevents non-platform Deployments that happen to end
 * in "-app" (e.g. redis-app, worker-app) from being included.
 *
 * The DB cross-reference happens in findAppsWithoutBandwidthRecord, so here
 * we return all candidate names and let the caller decide.
 */
export async function discoverAppNamesFromKubernetes(): Promise<string[]> {
  try {
    const appsApi = kubeConfig.makeApiClient(AppsV1Api);
    const response = await appsApi.listNamespacedDeployment({ namespace: APP_NAMESPACE });
    const deployments = response.items ?? [];

    return deployments
      .map((d) => d.metadata?.name ?? "")
      .filter((name) => name.endsWith("-app"))
      .map((name) => name.slice(0, -4)); // strip "-app" suffix → bare app name
  } catch (error) {
    console.error("[k8s-discovery] Deployment scan failed:", k8sErrorMessage(error));
    return [];
  }
}

// ── DB cross-reference ────────────────────────────────────────────────────────

export type DiscoveredApp = {
  id: string;
  name: string;
  user_id: string;
  size: string | null;
};

/**
 * Find platform apps that are running in K8s but have no bandwidth record yet
 * for the current billing month.
 *
 * This is used by the sync cron to create baseline rows for apps that were
 * deployed before the bandwidth system was introduced, or that missed the last
 * sync cycle.
 *
 * Two-step: first narrow to names that exist in platform_apps (this filters out
 * non-platform Deployments), then subtract those already covered by a bandwidth row.
 */
export async function findAppsWithoutBandwidthRecord(
  k8sAppNames: string[]
): Promise<DiscoveredApp[]> {
  if (k8sAppNames.length === 0) return [];

  const { start } = monthBounds();
  const periodStart = dateOnly(start);
  const supabase = await createServiceClient();

  // 1. Resolve K8s names → DB rows (this rejects non-platform Deployments).
  const { data: platformApps, error: appsError } = await (supabase as any)
    .from("platform_apps")
    .select("id, name, user_id, size")
    .in("name", k8sAppNames)
    .in("status", ["running", "degraded"]);

  if (appsError) {
    console.error("[k8s-discovery] Failed to query platform_apps:", appsError.message);
    return [];
  }

  if (!platformApps || platformApps.length === 0) return [];

  // 2. Check which of those already have a bandwidth record this month.
  const appIds = (platformApps as DiscoveredApp[]).map((a) => a.id);
  const { data: existingRecords, error: recordError } = await (supabase as any)
    .from("platform_app_bandwidth_usage_monthly")
    .select("app_id")
    .in("app_id", appIds)
    .eq("period_start", periodStart);

  if (recordError) {
    console.error("[k8s-discovery] Failed to query bandwidth records:", recordError.message);
    return [];
  }

  const coveredIds = new Set<string>(
    (existingRecords ?? []).map((r: { app_id: string }) => r.app_id)
  );

  return (platformApps as DiscoveredApp[]).filter((app) => !coveredIds.has(app.id));
}
