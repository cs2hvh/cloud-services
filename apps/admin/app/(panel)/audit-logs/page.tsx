import { Suspense } from "react";
import { notFound } from "next/navigation";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { requireAdmin } from "@/lib/supabase/auth";
import AuditLogsClient from "@/components/admin/audit-logs-client";
import { AuditLogs } from "@/lib/supabase/queries/audit_logs";
import { PageHeader } from "@admin/components/page-header";
import { Callout } from "@admin/components/deploy/bits";

export const dynamic = "force-dynamic";

/**
 * Reader for audits.audit_logs. The coverage banner is the load-bearing part:
 * the table is populated and authoritative-LOOKING while covering only
 * instrumented routes — as of 2026-09-01, 7 of the main app's 51 mutating
 * admin routes write here (billing-lane count), and lib/api/audit-logger's
 * logAudit goes to stdout, not this table. Confidently incomplete is worse
 * than empty, so the gap is stated where the data is read.
 */
const AuditLogsSuspense = async () => {
  const checkAdmin = await requireAdmin();
  if (!checkAdmin.ok) {
    notFound();
  }

  const { data, pagination } = await AuditLogs.fetchLogs({
    page: 1,
    limit: 20,
  });

  return <AuditLogsClient initialLogs={data} initialPagination={pagination} />;
};

export default function AuditLogsPage() {
  return (
    <div>
      <PageHeader
        title="Audit Logs"
        description="Who did what, when — admin actions and customer-data reads"
      />

      <Callout tone="warning">
        <strong className="font-semibold">
          This trail covers instrumented routes only.
        </strong>{" "}
        Everything this panel does is recorded — price and markup writes,
        discounts, catalog toggles, pod actions, and every read of customer
        data. Most of the MAIN app&apos;s older admin routes are not yet
        instrumented (7 of 51 mutating routes write here; pricing and deletion
        routes largely do not), so an empty result like &quot;no changes to
        GPU pricing&quot; means <em>no recorded</em> changes — not that none
        happened. Instrumenting the rest is with the billing lane pending
        sign-off.
      </Callout>

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
}
