import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { Projects, Users, Clusters, Products } from "@/lib/supabase/queries";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/supabase/auth";
import NewClusterForm from "@/components/dashboard/kubernetes/new/kubernetesform";
import { vmLocations } from "@/config/locations";

const AdminKubernetesAssignSuspense = async () => {
  // Check admin authentication
  const checkAdmin = await requireAdmin();
  
  if (!checkAdmin.ok) {
    notFound();
  }

  // Fetch required data
  const projects = await Projects.get_all_for_admin();
  const usersData = await Users.get_all_profiles();
  const clusters = await Clusters.get_all_for_admin();
  const products = await Products.get_by_type("kubernetes");

  // Map users to the format expected by NewClusterForm
  const allUsers = usersData.map(user => ({
    id: user.id,
    email: user.email || "",
    username: user.username || undefined,
  })).filter(user => user.email); // Only include users with email

  return (
    <NewClusterForm 
      locations={vmLocations}
      projects={projects} 
      userId={checkAdmin.userId || ""} 
      clusters={clusters}
      products={products}
      role="admin" 
      allUsers={allUsers} 
    />
  );
};

const AdminKubernetesAssignPage = () => {
  return (
    <div className="flex-1 bg-black min-h-screen p-6 sm:p-8 text-white">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Assign Kubernetes Cluster to User</h1>
        <p className="text-white/60">
          Create and assign a managed Kubernetes cluster to any user with automated backups and high availability.
        </p>
      </div>
      
      <div className="border-t border-white/10 pt-8">
        <Suspense fallback={
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner />
          </div>
        }>
          <AdminKubernetesAssignSuspense />
        </Suspense>
      </div>
    </div>
  );
};

export default AdminKubernetesAssignPage;
