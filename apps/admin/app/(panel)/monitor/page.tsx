import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/supabase/auth";
import HqBoard from "@admin/components/monitor/hq-board";
import AnalyticsView from "@admin/components/monitor/analytics-view";

export const dynamic = "force-dynamic";

/**
 * HQ Monitor — one scrolling war room: the live map first (12s poll), the
 * 30-day analytics right below it (60s poll). This shell only gates access;
 * both feeds arrive client-side.
 */
export default async function MonitorPage() {
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
    </div>
  );
}
