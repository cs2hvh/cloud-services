import { requireAdmin } from "@/lib/supabase/auth";
import { notFound } from "next/navigation";
import { AiJobsView } from "@admin/components/ai/jobs-view";

export const dynamic = "force-dynamic";

export default async function AdminAiJobsPage() {
  const checkAdmin = await requireAdmin();
  if (!checkAdmin.ok) {
    notFound();
  }

  return <AiJobsView />;
}
