import { Suspense } from "react";
import { notFound } from "next/navigation";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { requireAdmin } from "@/lib/supabase/auth";
import AdminDatabases from "@admin/components/admin/databases/admin-databases";
import { Database_Clusters } from "@/lib/supabase/queries/database_clusters";
import { loadCatalogPlans } from "@admin/lib/catalog";
import { Callout } from "@admin/components/deploy/bits";

export const dynamic = "force-dynamic";

const AdminDatabasesSuspense = async () => {
  const checkAdmin = await requireAdmin();
  if (!checkAdmin.ok) {
    notFound();
  }

  // Plans come from service_plans + the live price book — the dropped
  // products table is not read anywhere in this panel anymore.
  const [databases, catalog] = await Promise.all([
    Database_Clusters.get_all_for_admin(),
    loadCatalogPlans("database"),
  ]);

  return (
    <>
      {catalog.error && (
        <Callout tone="critical">
          Plan catalog could not be read: {catalog.error}
        </Callout>
      )}
      <AdminDatabases
        all_databases={databases}
        all_products={catalog.plans}
        basePath="/databases"
      />
    </>
  );
};

export default function AdminDatabasesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner />
        </div>
      }
    >
      <AdminDatabasesSuspense />
    </Suspense>
  );
}
