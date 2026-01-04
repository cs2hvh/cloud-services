import { Suspense } from "react";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { requireAdmin } from "@/lib/supabase/auth";
import { notFound } from "next/navigation";
import AdminPlatformApps from "@/components/admin/platform-apps/admin-platform-apps";
import { Platform_Apps } from "@/lib/supabase/queries";

export const dynamic = "force-dynamic";

const AdminPlatformAppsSuspense = async () => {
  const checkAdmin = await requireAdmin();

  if (!checkAdmin.ok) {
    notFound();
  }

  // Fetch all platform apps for admin view
  const apps = await Platform_Apps.get_all_for_admin();

  return <AdminPlatformApps all_apps={apps} />;
};

const AdminPlatformAppsPage = async () => {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner />
        </div>
      }
    >
      <AdminPlatformAppsSuspense />
    </Suspense>
  );
};

export default AdminPlatformAppsPage;
