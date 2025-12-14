import { Clusters, Database_Clusters, GameServers } from "@/lib/supabase/queries";
import GameServerGrid from "./grid";
import KubernetesGrid from "./kubernetesgrid";
import { Suspense } from "react";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import DbClusterGrid from "./db_cluster_grid";

interface PageProps {
  projectId: string;
}

const ProjectResourcesSuspense = async ({ projectId }: PageProps) => {
  const gameservers = await GameServers.get_by_project(projectId);
  const clusters = (await Clusters.get_by_project_id(projectId)).filter(item=>item.status==='ready');
  const db_clusters = (await Database_Clusters.get_by_project_id(projectId));

  return (
    <div className="space-y-8 p-6">
      <GameServerGrid data={gameservers}  />
      <KubernetesGrid data={clusters}  />
      <DbClusterGrid data={db_clusters}  />
    </div>
  );
};

const ProjectResourcesPage = ({ projectId }: PageProps) => {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <ProjectResourcesSuspense projectId={projectId} />
    </Suspense>
  );
};

export default ProjectResourcesPage;
