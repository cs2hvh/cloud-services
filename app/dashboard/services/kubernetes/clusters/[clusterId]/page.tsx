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
      <div className="relative z-10 px-6 py-8 sm:px-8 xl:px-10">
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-20">
              <LoadingSpinner />
            </div>
          }
        >
          <ClusterNewSuspense clusterId={decodeURIComponent(clusterId)} />
        </Suspense>
      </div>
    </div>
  );
};

export default ClusterNewPage;