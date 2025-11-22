import {
  Clusters,
  Database_Clusters,
  GameServers,
  ObjectSpaces,
  Projects,
  Spectrum_Apps,
} from "@/lib/supabase/queries";
import { Suspense } from "react";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
// import { Separator } from "@/components/ui/separator";
import { getUser } from "@/lib/supabase/auth";
import { notFound } from "next/navigation";
import { ErrorMessage } from "@/components/dashboard/utils/error";
import Dashboard from "@/components/dashboard/main/dashboard";

const DashboardSuspense = async () => {
  const user = await getUser();

  if (!user) {
    notFound();
  }

  const gameservers = await GameServers.get_by_user(user.id);
  const database_clusters = await Database_Clusters.read_all_owner_id(user.id);
  const kubernetes_clusters = await Clusters.get_by_user_id(user.id);
  const spectrum_apps = await Spectrum_Apps.list_by_owner(user.id);
  const object_storage=await ObjectSpaces.get_buckets(user.id);
  const logs=await Projects.get_logs_by_user(user.id)||[]
  //spectrum apps , object storage ,
   

  if (!gameservers) {
    return (
      <ErrorMessage message="Unable to load game servers. Please try again later." />
    );
  }

  return (
    <Dashboard
      data={{
        game_servers: gameservers,
        database_clusters: database_clusters,
        kubernetes_clusters: kubernetes_clusters,
        spectrum_apps:spectrum_apps,
        object_storage:object_storage,
        project_logs:logs
      }}
    />
  );
};

const DashboardPage = () => {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner />
        </div>
      }
    >
      <DashboardSuspense />
    </Suspense>
  );
};

export default DashboardPage;
