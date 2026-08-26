import { requireAdmin } from "@/lib/supabase/auth";
import { notFound } from "next/navigation";
import { AiWorkloads } from "@admin/components/ai/workloads";

export const dynamic = "force-dynamic";

export default async function AdminAiWorkloadsPage() {
  const checkAdmin = await requireAdmin();
  if (!checkAdmin.ok) {
    notFound();
  }

  return <AiWorkloads />;
}
