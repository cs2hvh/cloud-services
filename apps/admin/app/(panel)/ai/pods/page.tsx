import { requireAdmin } from "@/lib/supabase/auth";
import { notFound } from "next/navigation";
import { AiPodsView } from "@admin/components/ai/pods-view";

export const dynamic = "force-dynamic";

export default async function AdminAiPodsPage() {
  const checkAdmin = await requireAdmin();
  if (!checkAdmin.ok) {
    notFound();
  }

  return <AiPodsView />;
}
