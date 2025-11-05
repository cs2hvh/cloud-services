"use server";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { getUser } from "@/lib/supabase/auth";
import { ObjectSpaces, Projects } from "@/lib/supabase/queries";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import ObjectStorageMain from "@/components/dashboard/object-storage/main";

const ObjectStorageSuspense = async () => {
  const user = await getUser();

  if (!user) {
    notFound();
  }

  const projects = await Projects.get_all_by_user(user.id);
  const buckets = await ObjectSpaces.get_buckets(user.id);

  return <ObjectStorageMain buckets={buckets} projects={projects} userId={user.id} />;
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
