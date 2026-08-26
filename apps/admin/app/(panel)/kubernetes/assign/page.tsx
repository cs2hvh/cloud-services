import { Suspense } from "react";
import { notFound } from "next/navigation";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { requireAdmin } from "@/lib/supabase/auth";
import NewClusterForm from "@/components/dashboard/kubernetes/new/kubernetesform";
import { Projects } from "@/lib/supabase/queries/projects";
import { Users } from "@/lib/supabase/queries/users";
import { Clusters } from "@/lib/supabase/queries/clusters";
import { Products } from "@/lib/supabase/queries/products";
import { vmLocations } from "@/config/locations";

export const dynamic = "force-dynamic";

const AdminKubernetesAssignSuspense = async () => {
  const checkAdmin = await requireAdmin();
  if (!checkAdmin.ok) {
    notFound();
  }

  const projects = await Projects.get_all_for_admin();
  const usersData = await Users.get_all_profiles();
  const clusters = await Clusters.get_all_for_admin();
  const products = await Products.get_by_type("kubernetes");

  // Map users to the format expected by NewClusterForm
  const allUsers = usersData
    .map((user) => ({
      id: user.id,
      email: user.email || "",
      username: user.username || undefined,
    }))
    .filter((user) => user.email);

  return (
    <NewClusterForm
      locations={vmLocations}
      projects={projects}
      userId={checkAdmin.userId || ""}
      clusters={clusters}
      products={products}
      role="admin"
      allUsers={allUsers}
      adminReturnPath="/kubernetes"
    />
  );
};

export default function AdminKubernetesAssignPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="font-heading text-xl font-semibold tracking-tight">
          Assign Kubernetes Cluster to User
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create and assign a managed Kubernetes cluster to any user with
          automated backups and high availability.
        </p>
      </div>

      <div className="border-t border-border pt-8">
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-20">
              <LoadingSpinner />
            </div>
          }
        >
          <AdminKubernetesAssignSuspense />
        </Suspense>
      </div>
    </div>
  );
}
