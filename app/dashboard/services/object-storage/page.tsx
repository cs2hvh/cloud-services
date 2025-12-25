import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { getUser } from "@/lib/supabase/auth";
import { ObjectSpaces } from "@/lib/supabase/queries/object_spaces";
import { Projects } from "@/lib/supabase/queries/projects";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import ObjectStorageMain from "@/components/dashboard/object-storage/main";
// NOTE: We deliberately avoid decrypting sensitive credentials in the SSR layer.
// Only bucket endpoints (non-secret) are lightly processed here; access/secret keys
// are retrieved via an explicit client action to reduce exposure in initial payload.

const ObjectStorageSuspense = async () => {
  const user = await getUser();

  if (!user) {
    notFound();
  }

  // Parallel data fetching for better performance
  const [projects, buckets] = await Promise.all([
    Projects.get_all_by_user(user.id),
    ObjectSpaces.get_buckets(user.id),
  ]);
  // Sensitive fields remain encrypted; UI will request decrypted credentials on demand.

  return (
    <ObjectStorageMain buckets={buckets} projects={projects} userId={user.id} />
  );
};

const ObjectStoragePage = () => {
  return (
    <div className="flex-1 bg-black min-h-screen p-6 sm:p-8 text-white">
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner />
          </div>
        }
      >
        <ObjectStorageSuspense />
      </Suspense>
    </div>
  );
};

export default ObjectStoragePage;
