import { Suspense } from "react";
import { notFound } from "next/navigation";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { requireAdmin } from "@/lib/supabase/auth";
import { Locations } from "@/lib/supabase/queries/locations";
import { ObjectSpaces } from "@/lib/supabase/queries/object_spaces";
import { Projects } from "@/lib/supabase/queries/projects";
import { Users } from "@/lib/supabase/queries/users";
import BucketCreate from "@/components/dashboard/object-storage/bucket-create";

export const dynamic = "force-dynamic";

const AssignSuspense = async () => {
  const checkAdmin = await requireAdmin();
  if (!checkAdmin.ok) {
    notFound();
  }

  const [projects, locations, buckets, usersData] = await Promise.all([
    Projects.get_all_for_admin(),
    Locations.get_by_type("object"),
    ObjectSpaces.get_all_buckets(),
    Users.get_all_profiles(),
  ]);

  const allUsers = usersData
    .map((user) => ({
      id: user.id,
      email: user.email || "",
      username: user.username || undefined,
    }))
    .filter((user) => user.email);

  return (
    <BucketCreate
      projects={projects}
      locations={locations}
      userId={checkAdmin.userId || ""}
      buckets={buckets}
      role="admin"
      allUsers={allUsers}
    />
  );
};

export default function AdminObjectStorageAssignPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="font-heading text-xl font-semibold tracking-tight">
          Assign Bucket to User
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create an object-storage bucket on behalf of any user.
        </p>
      </div>
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner />
          </div>
        }
      >
        <AssignSuspense />
      </Suspense>
    </div>
  );
}
