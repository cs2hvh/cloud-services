import { Suspense } from "react";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { getUser } from "@/lib/supabase/auth";
import { notFound } from "next/navigation";
import Dashboard from "@/components/dashboard/main/dashboard";
import { Clusters } from "@/lib/supabase/queries/clusters";
import { Database_Clusters } from "@/lib/supabase/queries/database_clusters";
import { GameServers } from "@/lib/supabase/queries/gameservers";
import { ObjectSpaces } from "@/lib/supabase/queries/object_spaces";
import { Projects } from "@/lib/supabase/queries/projects";
import { Spectrum_Apps } from "@/lib/supabase/queries/spectrum_apps";
import { Platform_Apps } from "@/lib/supabase/queries/platform_apps";
import { RunPodService } from "@/lib/services/runpod-service";
import { createClient } from "@/lib/supabase/server";

/**
 * Compute VM count for the overview tile.
 *
 * The same statuses the compute page counts, so the tile and the page it links
 * to cannot disagree. A failed read returns null rather than 0, because a
 * zero here reads as "you have no servers" and would send someone looking for
 * a fleet that is actually there.
 */
async function getServerCount(userId: string): Promise<number | null> {
  try {
    const supabase = await createClient();
    const { count, error } = await supabase
      .from("servers")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", userId)
      .in("status", ["provisioning", "running", "stopped", "suspended"]);
    if (error) return null;
    return count ?? null;
  } catch {
    return null;
  }
}

const DashboardSuspense = async () => {
  const user = await getUser();
  if (!user) notFound();

  const [
    gameservers,
    database_clusters,
    kubernetes_clusters,
    spectrum_apps,
    object_storage,
    platform_apps,
    logsRaw,
    gpuResult,
    serverCount,
  ] = await Promise.all([
    GameServers.get_by_user(user.id),
    Database_Clusters.read_all_owner_id(user.id),
    Clusters.get_by_user_id(user.id),
    Spectrum_Apps.list_by_owner(user.id),
    ObjectSpaces.get_buckets(user.id),
    Platform_Apps.list_by_owner(user.id),
    Projects.get_logs_by_user(user.id),
    RunPodService.listUserPods(user.id),
    getServerCount(user.id),
  ]);

  // Don't fail the whole overview if one resource list comes back empty/null —
  // each section renders its own empty state. (Previously a null game_servers
  // result blanked the entire dashboard.)
  const gpu_pods = gpuResult.success ? (gpuResult.data ?? []) : [];
  const logs = logsRaw || [];

  return (
    <Dashboard
      data={{
        servers: serverCount ?? 0,
        game_servers: gameservers ?? [],
        database_clusters,
        kubernetes_clusters,
        spectrum_apps,
        object_storage,
        platform_apps,
        gpu_pods,
        project_logs: logs,
      }}
    />
  );
};

const DashboardPage = () => {
  return (
    <div className="relative min-h-full bg-[#08090b] text-white">
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div
          className="absolute -top-[300px] -right-[200px] h-[800px] w-[800px] blur-[60px]"
          style={{
            background:
              "radial-gradient(circle, rgba(0,149,255,0.07), transparent 60%)",
          }}
        />
        <div
          className="absolute -bottom-[400px] -left-[200px] h-[700px] w-[700px] blur-[70px]"
          style={{
            background:
              "radial-gradient(circle, rgba(0,149,255,0.04), transparent 60%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.018) 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
        />
      </div>

      <div className="relative z-10">
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-20">
              <LoadingSpinner />
            </div>
          }
        >
          <DashboardSuspense />
        </Suspense>
      </div>
    </div>
  );
};

export default DashboardPage;
