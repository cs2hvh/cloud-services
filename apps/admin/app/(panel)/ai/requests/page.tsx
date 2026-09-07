import { requireAdmin } from "@/lib/supabase/auth";
import { notFound } from "next/navigation";
import { AiRequestsView } from "@admin/components/ai/requests-view";

export const dynamic = "force-dynamic";

export default async function AdminAiRequestsPage() {
  const checkAdmin = await requireAdmin();
  if (!checkAdmin.ok) {
    notFound();
  }

  return <AiRequestsView />;
}
