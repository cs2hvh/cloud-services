import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { StatusChip, Table } from "@admin/components/deploy/bits";
import HqBoard from "@admin/components/monitor/hq-board";
import AnalyticsView from "@admin/components/monitor/analytics-view";

export const dynamic = "force-dynamic";

/**
 * Home = HQ Monitor. The old Overview merged in here (Harshit, 2026-09-04):
 * its KPI cards were redundant with the live map's nodes, so only the recent
 * admin activity table survives, below the analytics.
 */
export default async function HomePage() {
  const checkAdmin = await requireAdmin();
  if (!checkAdmin.ok) {
    notFound();
  }

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h1 className="font-heading text-xl font-semibold tracking-tight">HQ Monitor</h1>
        <p className="hidden text-xs text-muted-foreground lg:block">
          people → apps → services → billing · nodes are clickable · drag to rearrange
        </p>
      </div>
      <HqBoard />

      <div className="mb-3 mt-6 flex items-baseline justify-between gap-4">
        <h2 className="font-heading text-base font-semibold tracking-tight">Analytics</h2>
        <p className="hidden text-xs text-muted-foreground lg:block">
          30-day money, growth and ops — aggregated server-side
        </p>
      </div>
      <AnalyticsView />

      <div className="mt-6">
        <Suspense
          fallback={
            <div className="h-48 animate-pulse rounded-xl border border-border bg-card" />
          }
        >
          <RecentActivity />
        </Suspense>
      </div>
    </div>
  );
}

async function RecentActivity() {
  const supabase = await createServiceClient();
  const activity = await supabase
    .schema("audits")
    .from("audit_logs")
    .select("id, action, service_type, service_name, user_email, created_at")
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="font-heading text-sm font-semibold tracking-tight">
          Recent admin activity
        </h2>
        <Link
          href="/audit-logs"
          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          all audit logs →
        </Link>
      </div>
      <div className="p-4">
        {activity.error ? (
          <p className="text-xs text-red-400">
            Audit log unreadable — {activity.error.message}. Writes are failing the
            same way, so admin actions are currently not being recorded.
          </p>
        ) : (activity.data ?? []).length > 0 ? (
          <Table head={["when", "action", "service", "what", "by"]}>
            {(activity.data ?? []).map((a) => (
              <tr key={a.id} className="border-t border-border/60">
                <td className="py-1.5 pr-4 text-muted-foreground">
                  {a.created_at.slice(5, 16).replace("T", " ")}
                </td>
                <td className="py-1.5 pr-4">
                  <StatusChip status={a.action} />
                </td>
                <td className="py-1.5 pr-4 text-muted-foreground">{a.service_type}</td>
                <td className="max-w-[280px] truncate py-1.5 pr-4">{a.service_name ?? "—"}</td>
                <td className="py-1.5 text-muted-foreground">{a.user_email ?? "—"}</td>
              </tr>
            ))}
          </Table>
        ) : (
          <p className="text-xs text-muted-foreground">
            No audit entries yet — instrumented actions will appear here.
          </p>
        )}
      </div>
    </div>
  );
}
