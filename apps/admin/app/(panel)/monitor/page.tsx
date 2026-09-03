import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/supabase/auth";
import HqBoard from "@admin/components/monitor/hq-board";

export const dynamic = "force-dynamic";

/**
 * HQ Monitor — the platform as a living map. All data arrives client-side
 * from /api/admin/monitor on a 12s poll; this shell only gates access.
 */
export default async function MonitorPage() {
  const checkAdmin = await requireAdmin();
  if (!checkAdmin.ok) {
    notFound();
  }

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <div>
          <h1 className="font-heading text-xl font-semibold tracking-tight">HQ Monitor</h1>
        </div>
        <p className="text-xs text-muted-foreground">
          people → apps → services → billing · nodes are clickable · drag to rearrange
        </p>
      </div>
      <HqBoard />
    </div>
  );
}
