"use server";
import SingleCluster from "@/components/dashboard/kubernetes/clusters/singlecluster/singlecluster";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { authenticateUser } from "@/lib/auth/server-auth";
import { Projects } from "@/lib/supabase/queries/projects";
import { Suspense } from "react";

type Params = { clusterId: string };

interface Project {
  id: string;
  name: string;
  owner: string;
}

export const dynamic = "force-dynamic";

const ClusterNewSuspense = async ({ clusterId }: { clusterId: string }) => {
  const auth = await authenticateUser();
  let userProjects: Project[] = [];

  if (auth.authenticated && auth.user?.id) {
    const projects = await Projects.get_all_by_user(auth.user.id);
    userProjects = projects as Project[];
  }

  return <SingleCluster clusterId={clusterId} userProjects={userProjects} />;
};

const ClusterNewPage = async ({ params }: { params: Promise<Params> }) => {
  const { clusterId } = await params;

  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner />
        </div>
      }
    >
      <ClusterNewSuspense clusterId={decodeURIComponent(clusterId)} />
    </Suspense>
  );
};

export default ClusterNewPage;