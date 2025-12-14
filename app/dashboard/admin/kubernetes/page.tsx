import { Suspense } from "react";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { requireAdmin } from "@/lib/supabase/auth";
import { notFound } from "next/navigation";
import AdminKubernetes from "@/components/admin/kubernetes/admin-kubernetes";
import { Clusters } from "@/lib/supabase/queries";
import { getCachedProducts } from "@/lib/cache/query-cache";


export const dynamic = "force-dynamic";

const AdminKubernetesSuspense = async () => {
  const checkAdmin = await requireAdmin();

  if (!checkAdmin.ok) {
    notFound();
  }

  // Fetch clusters and kubernetes products in parallel with caching
  const [clusters, kubernetesProducts] = await Promise.all([
    Clusters.get_all_for_admin(),
    getCachedProducts.byType("kubernetes"),
  ]);

  return <AdminKubernetes all_clusters={clusters} all_products={kubernetesProducts} />;
};

const AdminKubernetesPage = async () => {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner />
        </div>
      }
    >
      <AdminKubernetesSuspense />
    </Suspense>
  );
};

export default AdminKubernetesPage;