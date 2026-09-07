import { requireAdmin } from "@/lib/supabase/auth";
import { notFound } from "next/navigation";
import { AiRoutingView } from "@admin/components/ai/routing-view";

export const dynamic = "force-dynamic";

export default async function AdminAiRoutingPage() {
  const checkAdmin = await requireAdmin();
  if (!checkAdmin.ok) {
    notFound();
  }

  return <AiRoutingView />;
}
