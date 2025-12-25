import NewClusterForm from "@/components/dashboard/kubernetes/new/kubernetesform";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { vmLocations } from "@/config/locations";
import { getUser } from "@/lib/supabase/auth";
import { Clusters } from "@/lib/supabase/queries/clusters";
import { Projects } from "@/lib/supabase/queries/projects";
import { getCachedProducts } from "@/lib/cache/query-cache";
import { notFound } from "next/navigation";
import { Suspense } from "react";

const KubernetesNewSuspense = async () => {
  const user = await getUser();
 
  if (!user) {
    notFound();
  }

  // Parallel data fetching with caching for products
  const [projects, clusters, products] = await Promise.all([
    Projects.get_all_by_user(user.id),
    Clusters.get_by_user_id(user.id),
    getCachedProducts.byType("kubernetes"),
  ]);

  return <NewClusterForm locations={vmLocations} projects={projects} userId={user.id} clusters={clusters} products={products} />;
};

const KubernetesNewPage = () => {
  return (
    <div className="flex-1 bg-black min-h-screen p-6 sm:p-8 text-white">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">New Kubernetes Cluster</h1>
        <p className="text-white/60">Deploy a managed kubernetes with automated backups and high availability.</p>
      </div>
      
      <div className="border-t border-white/10 pt-8">
        <Suspense fallback={
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner />
          </div>
        }>
          <KubernetesNewSuspense />
        </Suspense>
      </div>
    </div>
  );
};

export default KubernetesNewPage;