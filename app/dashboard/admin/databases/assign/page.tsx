import AdminDatabaseAssign from "@/components/admin/databases/assign-database-new";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { Locations } from "@/lib/supabase/queries/locations";
import { Products } from "@/lib/supabase/queries/products";
import { Users } from "@/lib/supabase/queries/users";
import { Projects } from "@/lib/supabase/queries/projects";
import { notFound } from "next/navigation";
import { Suspense } from "react";

export const dynamic = "force-dynamic";
import { requireAdmin } from "@/lib/supabase/auth";

const AdminDatabaseAssignSuspense = async () => {
  // Check admin authentication
  const checkAdmin = await requireAdmin();
  
    if (!checkAdmin.ok) {
      notFound();
    }

  // Fetch required data
  const products = await Products.get_by_type("database");
  const locations = await Locations.get_all();
  const users = await Users.get_all_profiles();
  const projects = await Projects.get_all_for_admin();
 

  return (
    <AdminDatabaseAssign 
      products={products} 
      locations={locations} 
      allUsers={users} 
      allProjects={projects || []}
    />
  );
};

const AdminDatabaseAssignPage = () => {
  return (
    <div className="flex-1 bg-black min-h-screen p-6 sm:p-8 text-white">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Assign Database to User</h1>
        <p className="text-white/60">
          Create and assign a managed database cluster to any user with automated backups and high availability.
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