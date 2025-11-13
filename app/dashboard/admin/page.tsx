import { Suspense } from "react";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { requireAdmin } from "@/lib/supabase/auth";
import { notFound } from "next/navigation";
import AdminDashboard from "@/components/admin/admin";

const AdminDashboardSuspense = async () => {
  const checkAdmin = await requireAdmin();

  //console.log(checkAdmin,"....................143")

  if (!checkAdmin.ok) {
    notFound();
  }

  return <AdminDashboard checkAdmin={checkAdmin.ok} />;
};

const AdminDashboardPage = () => {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner />
        </div>
      }
    >
      <AdminDashboardSuspense />
    </Suspense>
  );
};

export default AdminDashboardPage;
