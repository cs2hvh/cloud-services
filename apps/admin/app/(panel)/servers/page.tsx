import { requireAdmin } from "@/lib/supabase/auth";
import { notFound } from "next/navigation";
import { ServersFleet } from "@admin/components/servers/fleet";

export const dynamic = "force-dynamic";

export default async function AdminServersPage() {
  const checkAdmin = await requireAdmin();
  if (!checkAdmin.ok) {
    notFound();
  }

  return <ServersFleet />;
}
