import { requireAdmin } from "@/lib/supabase/auth";
import { notFound } from "next/navigation";
import { UsersView } from "@admin/components/users/users-view";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const checkAdmin = await requireAdmin();
  if (!checkAdmin.ok) {
    notFound();
  }

  return <UsersView />;
}
