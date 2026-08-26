import { requireAdmin } from "@/lib/supabase/auth";
import { notFound } from "next/navigation";
import LinodeAdmin from "@/components/admin/linode/linode-admin";

export const dynamic = "force-dynamic";

/**
 * The full Linode operations console (status, catalog sync, plans/markup,
 * regions, images, instance ledger) — reused wholesale from the shared
 * component while the section migrates.
 */
export default async function AdminLinodePage() {
  const checkAdmin = await requireAdmin();
  if (!checkAdmin.ok) {
    notFound();
  }

  return <LinodeAdmin />;
}
