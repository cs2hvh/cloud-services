import { requireAdmin } from "@/lib/supabase/auth";
import { notFound } from "next/navigation";
import { PartnerModelsView } from "@admin/components/ai/partner-models-view";

export const dynamic = "force-dynamic";

export default async function AdminAiPartnerModelsPage() {
  const checkAdmin = await requireAdmin();
  if (!checkAdmin.ok) {
    notFound();
  }

  return <PartnerModelsView />;
}
