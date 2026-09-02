import { Suspense } from "react";
import { notFound } from "next/navigation";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { requireAdmin } from "@/lib/supabase/auth";
import AdminObjectStorage from "@admin/components/admin/object-storage/admin-object-storage";
import { ObjectSpaces } from "@/lib/supabase/queries/object_spaces";

export const dynamic = "force-dynamic";

const AdminObjectStorageSuspense = async () => {
  const checkAdmin = await requireAdmin();
  if (!checkAdmin.ok) {
    notFound();
  }

  const buckets = await ObjectSpaces.get_all_for_admin();
  return <AdminObjectStorage all_buckets={buckets} />;
};

export default function AdminObjectStoragePage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner />
        </div>
      }
    >
      <AdminObjectStorageSuspense />
    </Suspense>
  );
}
