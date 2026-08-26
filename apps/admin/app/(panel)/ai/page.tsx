import { requireAdmin } from "@/lib/supabase/auth";
import { notFound } from "next/navigation";
import { AiOverview } from "@admin/components/ai/overview";

export const dynamic = "force-dynamic";

export default async function AdminAiPage() {
  const checkAdmin = await requireAdmin();
  if (!checkAdmin.ok) {
    notFound();
  }

  return <AiOverview />;
}
