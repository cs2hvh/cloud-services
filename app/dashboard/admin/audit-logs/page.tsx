import { Suspense } from "react";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { requireAdmin } from "@/lib/supabase/auth";
import { notFound } from "next/navigation";
import AuditLogsClient from "@/components/admin/audit-logs-client";
import { AuditLogs } from "@/lib/supabase/queries/audit_logs";

export const dynamic = "force-dynamic";

const AuditLogsSuspense = async () => {
  const checkAdmin = await requireAdmin();

  if (!checkAdmin.ok) {
    notFound();
  }

  // Fetch initial audit logs from server
  const { data, pagination } = await AuditLogs.fetchLogs({
    page: 1,
    limit: 20,
  });

  return <AuditLogsClient initialLogs={data} initialPagination={pagination} />;
};

const AuditLogsPage = async () => {
  return (
    <div className="p-6">
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner />
          </div>
        }
      >
        <AuditLogsSuspense />
      </Suspense>
    </div>
  );
};

export default AuditLogsPage;
