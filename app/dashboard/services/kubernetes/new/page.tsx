import NewClusterForm from "@/components/dashboard/kubernetes/new/kubernetesform";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { vmLocations } from "@/config/locations";
import { getCachedProducts } from "@/lib/cache/query-cache";
import { getUser } from "@/lib/supabase/auth";
import { Clusters } from "@/lib/supabase/queries/clusters";
import { Projects } from "@/lib/supabase/queries/projects";
import { notFound } from "next/navigation";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

const KubernetesNewSuspense = async () => {
  const user = await getUser();

  if (!user) {
    notFound();
  }

  const [projects, clusters, products] = await Promise.all([
    Projects.get_all_by_user(user.id),
    Clusters.get_by_user_id(user.id),
    getCachedProducts.byType("kubernetes"),
  ]);

  return (
    <NewClusterForm
      locations={vmLocations}
      projects={projects}
      userId={user.id}
      clusters={clusters}
      products={products}
    />
  );
};

const KubernetesNewPage = () => {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner />
        </div>
      }
    >
      <KubernetesNewSuspense />
    </Suspense>
  );
};

export default KubernetesNewPage;