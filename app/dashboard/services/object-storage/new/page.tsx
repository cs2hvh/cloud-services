import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { getUser } from "@/lib/supabase/auth";
import { Locations, ObjectSpaces, Projects } from "@/lib/supabase/queries";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import BucketCreate from "@/components/dashboard/object-storage/bucket-create";

const BucketNewSuspense = async () => {
  const user = await getUser();

  if (!user) {
    notFound();
  }

  const projects = await Projects.get_all_by_user(user.id);
  const locations = await Locations.get_by_type("object");
  const buckets = await ObjectSpaces.get_all_buckets();

  return <BucketCreate projects={projects} locations={locations} userId={user.id} buckets={buckets} />;
};

const BucketNewPage = () => {
  return (
    <div className="flex-1 bg-black min-h-screen p-6 sm:p-8 text-white">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">New Bucket</h1>
        <p className="text-white/60">
          Create a new Spaces bucket for storing files and objects.
        </p>
      </div>

      <div className="border-t border-white/10 pt-8">
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-20">
              <LoadingSpinner />
            </div>
          }
        >
          <BucketNewSuspense />
        </Suspense>
      </div>
    </div>
  );
};

export default BucketNewPage;
