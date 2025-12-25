import { Suspense } from "react";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { requireAdmin } from "@/lib/supabase/auth";
import { notFound } from "next/navigation";
import AdminObjectStorage from "@/components/admin/object-storage/admin-object-storage";
import { ObjectSpaces } from "@/lib/supabase/queries/object_spaces";


export const dynamic = "force-dynamic";
const AdminObjectStorageSuspense = async () => {
  const checkAdmin = await requireAdmin();

  if (!checkAdmin.ok) {
    notFound();
  }

  // Fetch both buckets and products in parallel
  const [buckets] = await Promise.all([
    ObjectSpaces.get_all_for_admin(),
    //Products.get_by_type("object-storage").catch(() => []), // For future plans tab - handle if no products exist yet
  ]);

  return <AdminObjectStorage all_buckets={buckets}  />;
};

const AdminObjectStoragePage = async () => {
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
};

export default AdminObjectStoragePage;