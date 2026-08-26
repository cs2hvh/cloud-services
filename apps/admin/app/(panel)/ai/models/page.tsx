import { requireAdmin } from "@/lib/supabase/auth";
import { notFound } from "next/navigation";
import { AiModelsTable } from "@admin/components/ai/models-table";

export const dynamic = "force-dynamic";

export default async function AdminAiModelsPage() {
  const checkAdmin = await requireAdmin();
  if (!checkAdmin.ok) {
    notFound();
  }

  return <AiModelsTable />;
}
