import { Suspense } from "react";
import { notFound } from "next/navigation";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { requireAdmin } from "@/lib/supabase/auth";
import AdminDatabaseAssign from "@admin/components/admin/databases/assign-database-new";
import { Locations } from "@/lib/supabase/queries/locations";
import { Users } from "@/lib/supabase/queries/users";
import { Projects } from "@/lib/supabase/queries/projects";
import { loadCatalogPlans } from "@admin/lib/catalog";
import { Callout } from "@admin/components/deploy/bits";

export const dynamic = "force-dynamic";

const AdminDatabaseAssignSuspense = async () => {
  const checkAdmin = await requireAdmin();
  if (!checkAdmin.ok) {
    notFound();
  }

  const [catalog, locations, users, projects] = await Promise.all([
    loadCatalogPlans("database"),
    Locations.get_all(),
    Users.get_all_profiles(),
    Projects.get_all_for_admin(),
  ]);

  if (catalog.error || catalog.plans.length === 0) {
    // No plans to assign — the wizard would dead-end at step 1.
    return (
      <Callout tone="critical">
        Plan catalog unavailable{catalog.error ? `: ${catalog.error}` : " (no active database plans)"}.
      </Callout>
    );
  }

  return (
    <AdminDatabaseAssign
      products={catalog.plans}
      locations={locations}
      allUsers={users}
      allProjects={projects || []}
      basePath="/databases"
    />
  );
};

export default function AdminDatabaseAssignPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="font-heading text-xl font-semibold tracking-tight">
          Assign Database to User
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create and assign a managed database cluster to any user with
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
          <AdminDatabaseAssignSuspense />
        </Suspense>
      </div>
    </div>
  );
}
