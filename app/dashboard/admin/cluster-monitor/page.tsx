import { Suspense } from "react";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { requireAdmin } from "@/lib/supabase/auth";
import { notFound } from "next/navigation";
import AdminClusterMonitor from "@/components/admin/cluster-monitor/admin-cluster-monitor";

export const dynamic = "force-dynamic";

const AdminClusterMonitorSuspense = async () => {
  const checkAdmin = await requireAdmin();

  if (!checkAdmin.ok) {
    notFound();
  }

  return <AdminClusterMonitor />;
};

const AdminClusterMonitorPage = () => {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner />
        </div>
      }
    >
      <AdminClusterMonitorSuspense />
    </Suspense>
  );
};

export default AdminClusterMonitorPage;
