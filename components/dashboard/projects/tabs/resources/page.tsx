import { Clusters} from "@/lib/supabase/queries/clusters";
import { ObjectSpaces } from "@/lib/supabase/queries/object_spaces";
import {Spectrum_Apps} from "@/lib/supabase/queries/spectrum_apps";
import { GameServers } from "@/lib/supabase/queries/gameservers";
import { Database_Clusters } from "@/lib/supabase/queries/database_clusters";
import { Platform_Apps } from "@/lib/supabase/queries/platform_apps";
import GameServerGrid from "./grid";
import KubernetesGrid from "./kubernetesgrid";
import { Suspense } from "react";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import DbClusterGrid from "./db_cluster_grid";
import SpectrumAppGrid from "./spectrum_app_grid";
import ObjectSpaceGrid from "./object_space_grid";
import PlatformAppGrid from "./platform_app_grid";

interface PageProps {
  projectId: string;
}

const ProjectResourcesSuspense = async ({ projectId }: PageProps) => {
  const gameservers = await GameServers.get_by_project(projectId);
  const clusters = (await Clusters.get_by_project_id(projectId)).filter(item=>item.status==='ready');
  const db_clusters = (await Database_Clusters.get_by_project_id(projectId));
  const spectrum_apps = await Spectrum_Apps.get_by_project_id(projectId);
  const object_spaces = await ObjectSpaces.get_by_project_id(projectId);
  const platform_apps = await Platform_Apps.get_by_project_id(projectId);

  return (
    <div className="space-y-8 p-6">
      <GameServerGrid data={gameservers}  />
      <KubernetesGrid data={clusters}  />
      <DbClusterGrid data={db_clusters}  />
      <SpectrumAppGrid data={spectrum_apps}  />
      <ObjectSpaceGrid data={object_spaces}  />
      <PlatformAppGrid data={platform_apps}  />
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
