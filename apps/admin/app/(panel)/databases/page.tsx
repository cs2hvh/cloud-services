import { Suspense } from "react";
import { notFound } from "next/navigation";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { requireAdmin } from "@/lib/supabase/auth";
import AdminDatabases from "@/components/admin/databases/admin-databases";
import { Database_Clusters } from "@/lib/supabase/queries/database_clusters";
import { getCachedProducts } from "@/lib/cache/query-cache";

export const dynamic = "force-dynamic";

const AdminDatabasesSuspense = async () => {
  const checkAdmin = await requireAdmin();
  if (!checkAdmin.ok) {
    notFound();
  }

  const [databases, databaseProducts] = await Promise.all([
    Database_Clusters.get_all_for_admin(),
    getCachedProducts.byType("database"),
  ]);

  return (
    <AdminDatabases
      all_databases={databases}
      all_products={databaseProducts}
      basePath="/databases"
    />
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
