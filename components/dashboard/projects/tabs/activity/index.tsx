import { Projects } from "@/lib/supabase/queries"
import { ProjectActivityTable } from "./table";
import { Suspense } from "react";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";

const ProjectActivitySuspense = async ({ projectId }: { projectId: string }) => {
    const logs = await Projects.get_logs(projectId);

    if (!logs) {
        return (
            <div className="text-center py-10 text-muted-foreground">
                No activity found in the Project yet.
            </div>
        )
    }

    return <ProjectActivityTable data={logs} />
}

const ProjectActivityPage = ({ projectId }: { projectId: string }) => {

    return (
        <Suspense fallback={<LoadingSpinner />}>
            <ProjectActivitySuspense projectId={projectId} />
        </Suspense>
    )
}

export default ProjectActivityPage