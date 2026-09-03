import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/supabase/auth";
import MonitorTabs from "@admin/components/monitor/monitor-tabs";

export const dynamic = "force-dynamic";

/**
 * HQ Monitor — Live map (the platform as a living graph, 12s poll) and
 * Analytics (30-day money/growth/ops, 60s poll). This shell only gates
 * access; both feeds arrive client-side.
 */
export default async function MonitorPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const checkAdmin = await requireAdmin();
  if (!checkAdmin.ok) {
    notFound();
  }
  const { tab } = await searchParams;

  return <MonitorTabs initialTab={tab} />;
}
