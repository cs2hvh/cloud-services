import { GameServers } from "@/lib/supabase/queries";
import GameServerGrid from "./grid";
import { Suspense } from "react";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";

interface PageProps {
  projectId: string;
}

const ProjectResourcesSuspense = async ({ projectId }: PageProps) => {
  const gameservers = await GameServers.get_by_project(projectId);

  return (
    <div className="space-y-4">
      <h1 className="text-xs font-semibold mb-2 uppercase">
        Game Servers ({gameservers.length})
      </h1>
      <GameServerGrid data={gameservers} />
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
