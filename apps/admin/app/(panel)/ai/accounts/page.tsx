import { requireAdmin } from "@/lib/supabase/auth";
import { notFound } from "next/navigation";
import { AiAccountsView } from "@admin/components/ai/accounts-view";

export const dynamic = "force-dynamic";

export default async function AdminAiAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const checkAdmin = await requireAdmin();
  if (!checkAdmin.ok) {
    notFound();
  }
  const { org } = await searchParams;

  return <AiAccountsView initialOrg={org} />;
}
