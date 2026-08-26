import { Suspense } from "react";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { requireAdmin } from "@/lib/supabase/auth";
import { notFound } from "next/navigation";
import AdminUsers from "@/components/admin/users/admin-users";
import { Users } from "@/lib/supabase/queries/users";

export const dynamic = "force-dynamic";

const AdminUsersSuspense = async () => {
  const checkAdmin = await requireAdmin();

  if (!checkAdmin.ok) {
    notFound();
  }

  const users = await Users.get_all_profiles();

  return <AdminUsers all_users={users} />;
};

const AdminUsersPage = () => {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner />
        </div>
      }
    >
      <AdminUsersSuspense />
    </Suspense>
  );
};

export default AdminUsersPage;
