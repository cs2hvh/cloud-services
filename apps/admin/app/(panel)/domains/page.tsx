import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/supabase/auth";
import { PageHeader } from "@admin/components/page-header";
import { DomainsView } from "@admin/components/domains/domains-view";

export const dynamic = "force-dynamic";

export default async function AdminDomainsPage() {
  const checkAdmin = await requireAdmin();
  if (!checkAdmin.ok) {
    notFound();
  }

  return (
    <div>
      <PageHeader
        title="Domains"
        description="Registered hostnames, purchases and transfers — lifecycle actions are audited"
      />
      <DomainsView />
    </div>
  );
}
