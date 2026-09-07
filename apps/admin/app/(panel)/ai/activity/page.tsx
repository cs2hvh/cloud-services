import { requireAdmin } from "@/lib/supabase/auth";
import { notFound } from "next/navigation";
import { AiActivityView } from "@admin/components/ai/activity-view";

export const dynamic = "force-dynamic";

export default async function AdminAiActivityPage() {
  const checkAdmin = await requireAdmin();
  if (!checkAdmin.ok) {
    notFound();
  }

  return <AiActivityView />;
}
