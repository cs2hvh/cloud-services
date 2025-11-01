import { Projects } from "@/lib/supabase/queries";
import { ProjectActivityTable } from "./table";
import { Suspense } from "react";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
// import { Tables } from "@/lib/supabase/types";

const ProjectActivitySuspense = async ({
  projectId,
}: {
  projectId: string;
}) => {
  const logs = await Projects.get_logs(projectId);

  return (
    <div className="p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Project Activity</h2>
        <p className="text-sm text-muted-foreground">
          Track all changes and events in your project
        </p>
      </div>
      {logs && logs.length > 0 ? (
        <ProjectActivityTable data={logs} />
      ) : (
        <div className="rounded-lg border bg-card p-12 text-center">
          <p className="text-muted-foreground">
            No activity logs yet. Activity will appear here when you create or modify resources in this project.
          </p>
        </div>
      )}
    </div>
  );
};

const ProjectActivityPage = ({ projectId }: { projectId: string }) => {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <ProjectActivitySuspense projectId={projectId} />
    </Suspense>
  );
};

export default ProjectActivityPage;
