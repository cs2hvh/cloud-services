import { Suspense } from "react";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { requireAdmin } from "@/lib/supabase/auth";
import { notFound } from "next/navigation";
import AdminDatabases from "@/components/admin/databases/admin-databases";
import { Database_Clusters } from "@/lib/supabase/queries";

const AdminDatabasesSuspense = async () => {
  const checkAdmin = await requireAdmin();

  if (!checkAdmin.ok) {
    notFound();
  }

  const databases = await Database_Clusters.get_all_for_admin();

  return <AdminDatabases all_databases={databases} />;
};

const AdminDatabasesPage = async () => {
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
};

export default AdminDatabasesPage;
