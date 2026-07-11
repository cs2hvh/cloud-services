import { notFound } from "next/navigation";

import { requireAdmin } from "@/lib/supabase/auth";
import { getGameDeployEnabled } from "@/lib/admin/platform-settings";
import GameAdminConsole from "@/components/admin/game/game-admin-console";

export const dynamic = "force-dynamic";

export default async function AdminGamePage() {
  const admin = await requireAdmin();
  if (!admin.ok) notFound();

  const enabled = await getGameDeployEnabled();

  return (
    <div className="min-h-full bg-[#08090b] text-white">
      <div className="px-6 py-10 sm:px-10">
        <GameAdminConsole initialKillEnabled={enabled} />
      </div>
    </div>
  );
}
