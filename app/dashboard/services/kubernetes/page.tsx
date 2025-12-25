import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { getUser } from "@/lib/supabase/auth";
import { Clusters } from "@/lib/supabase/queries/clusters";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import KubernetesClustersMain from "@/components/dashboard/kubernetes/clusters-main";

const KubernetesSuspense = async () => {
  const user = await getUser();

  if (!user) {
    notFound();
  }

  const clusters = await Clusters.get_by_user_id(user.id);

  return <KubernetesClustersMain clusters={clusters} />;
};

const KubernetesPage = () => {
  return (
    <Suspense
      fallback={
        <div className="flex-1 bg-black min-h-screen flex items-center justify-center">
          <LoadingSpinner />
        </div>
      }
    >
      <KubernetesSuspense />
    </Suspense>
  );
};

export default KubernetesPage;

