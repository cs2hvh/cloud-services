import { Suspense } from "react";
import { notFound } from "next/navigation";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { requireAdmin } from "@/lib/supabase/auth";
import AdminKubernetes from "@admin/components/admin/kubernetes/admin-kubernetes";
import { Clusters } from "@/lib/supabase/queries/clusters";
import { getCachedProducts } from "@/lib/cache/query-cache";
import { planCatalogOffline } from "@admin/lib/catalog-status";
import { CatalogOfflineBanner } from "@admin/components/catalog-offline-banner";

export const dynamic = "force-dynamic";

const AdminKubernetesSuspense = async () => {
  const checkAdmin = await requireAdmin();
  if (!checkAdmin.ok) {
    notFound();
  }

  const [clusters, kubernetesProducts, catalogOffline] = await Promise.all([
    Clusters.get_all_for_admin(),
    getCachedProducts.byType("kubernetes"),
    planCatalogOffline(),
  ]);

  return (
    <>
      {catalogOffline && <CatalogOfflineBanner />}
      <AdminKubernetes
        all_clusters={clusters}
        all_products={kubernetesProducts}
        basePath="/kubernetes"
      />
    </>
  );
};

export default function AdminKubernetesPage() {
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
}
