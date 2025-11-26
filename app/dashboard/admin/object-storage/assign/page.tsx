import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { Locations, ObjectSpaces, Products, Projects, Users } from "@/lib/supabase/queries";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/supabase/auth";
import BucketCreate from "@/components/dashboard/object-storage/bucket-create";


const AdminDatabaseAssignSuspense = async () => {
  // Check admin authentication
  const checkAdmin = await requireAdmin();
  
    if (!checkAdmin.ok) {
      notFound();
    }

  // Fetch required data
  const projects = await Projects.get_all_for_admin();
  const locations = await Locations.get_by_type("object");
  const buckets = await ObjectSpaces.get_all_buckets();
  const usersData = await Users.get_all_profiles();

  console.log("buckets:", buckets);

  // Map users to the format expected by BucketCreate
  const allUsers = usersData.map(user => ({
    id: user.id,
    email: user.email || "",
    username: user.username || undefined,
  })).filter(user => user.email); // Only include users with email

  return <BucketCreate projects={projects} locations={locations} userId={checkAdmin.userId||""} buckets={buckets} role="admin" allUsers={allUsers} />;
};

const AdminDatabaseAssignPage = () => {
  return (
    <div className="flex-1 bg-black min-h-screen p-6 sm:p-8 text-white">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Assign Bucket to User</h1>
        <p className="text-white/60">
          Create and assign a managed bucket to any user with automated backups and high availability.
        </p>
      </div>
      
      <div className="border-t border-white/10 pt-8">
        <Suspense fallback={
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner />
          </div>
        }>
          <AdminDatabaseAssignSuspense />
        </Suspense>
      </div>
    </div>
  );
};

export default AdminDatabaseAssignPage;