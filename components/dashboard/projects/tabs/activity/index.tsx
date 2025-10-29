import { Projects } from "@/lib/supabase/queries";
import { ProjectActivityTable } from "./table";
import { Suspense } from "react";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { Tables } from "@/lib/supabase/types";

// Dummy data for demonstration
const dummyActivityData: Array<Tables<"project_logs">> = [
  {
    id: 1,
    project_id: null,
    event: "Database",
    text: "Database cluster 'prod-db-01' created successfully",
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
  },
  {
    id: 2,
    project_id: null,
    event: "Settings",
    text: "Project settings updated",
    created_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), // 5 hours ago
  },
  {
    id: 3,
    project_id: null,
    event: "Box",
    text: "Kubernetes cluster 'k8s-prod' deployed",
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
  },
  {
    id: 4,
    project_id: null,
    event: "Gamepad2",
    text: "Game server 'minecraft-01' created",
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
  },
  {
    id: 5,
    project_id: null,
    event: "Settings",
    text: "Network rules updated for database cluster",
    created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
  },
  {
    id: 6,
    project_id: null,
    event: "Trash2",
    text: "Old game server 'test-server-01' deleted",
    created_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(), // 4 days ago
  },
  {
    id: 7,
    project_id: null,
    event: "Database",
    text: "Database backup completed successfully",
    created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
  },
];

const ProjectActivitySuspense = async ({
  projectId,
}: {
  projectId: string;
}) => {
  const logs = await Projects.get_logs(projectId);

  // If no logs exist, use dummy data for demonstration
  const displayData = logs && logs.length > 0 ? logs : dummyActivityData.map(item => ({
    ...item,
    project_id: projectId,
  }));

  return (
    <div className="p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Project Activity</h2>
        <p className="text-sm text-muted-foreground">
          Track all changes and events in your project
        </p>
      </div>
      <ProjectActivityTable data={displayData} />
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
