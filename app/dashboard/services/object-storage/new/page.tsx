import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import BucketCreate from "@/components/dashboard/object-storage/bucket-create";
import { getUser } from "@/lib/supabase/auth";
import { Locations } from "@/lib/supabase/queries/locations";
import { ObjectSpaces } from "@/lib/supabase/queries/object_spaces";
import { Projects } from "@/lib/supabase/queries/projects";
import { notFound } from "next/navigation";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

const BucketNewSuspense = async () => {
  const user = await getUser();

  if (!user) {
    notFound();
  }

  const projects = await Projects.get_all_by_user(user.id);
  const locations = await Locations.get_by_type("object");
  const buckets = await ObjectSpaces.get_all_buckets();

  return (
    <BucketCreate
      projects={projects}
      locations={locations}
      userId={user.id}
      buckets={buckets}
      role="user"
    />
  );
};

const BucketNewPage = () => {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner />
        </div>
      }
    >
      <BucketNewSuspense />
    </Suspense>
  );
};

export default BucketNewPage;