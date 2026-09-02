import { Suspense } from "react";
import { notFound } from "next/navigation";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { requireAdmin } from "@/lib/supabase/auth";
import AdminKubernetes from "@admin/components/admin/kubernetes/admin-kubernetes";
import { Clusters } from "@/lib/supabase/queries/clusters";
import { loadCatalogPlans } from "@admin/lib/catalog";
import { Callout } from "@admin/components/deploy/bits";

export const dynamic = "force-dynamic";

const AdminKubernetesSuspense = async () => {
  const checkAdmin = await requireAdmin();
  if (!checkAdmin.ok) {
    notFound();
  }

  const [clusters, catalog] = await Promise.all([
    Clusters.get_all_for_admin(),
    loadCatalogPlans("kubernetes"),
  ]);

  return (
    <>
      {catalog.error && (
        <Callout tone="critical">
          Plan catalog could not be read: {catalog.error}
        </Callout>
      )}
      <AdminKubernetes
        all_clusters={clusters}
        all_products={catalog.plans}
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
