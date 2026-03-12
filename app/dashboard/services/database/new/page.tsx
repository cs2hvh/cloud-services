import DatabaseSelect from "@/components/dashboard/database/new";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { getCachedLocations, getCachedProducts } from "@/lib/cache/query-cache";
import { getUser } from "@/lib/supabase/auth";
import { Database_Clusters } from "@/lib/supabase/queries/database_clusters";
import { Projects } from "@/lib/supabase/queries/projects";
import { notFound } from "next/navigation";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

const DatabaseNewSuspense = async () => {
  const user = await getUser();

  if (!user) {
    notFound();
  }

  const [products, location, projects, clusters] = await Promise.all([
    getCachedProducts.byType("database"),
    getCachedLocations.all(),
    Projects.get_all_by_user(user.id),
    Database_Clusters.read_all_owner_id(user.id),
  ]);

  return (
    <DatabaseSelect
      products={products}
      locations={location}
      projects={projects}
      userId={user.id}
      clusters={clusters}
    />
  );
};

const DatabaseNewPage = () => {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner />
        </div>
      }
    >
      <DatabaseNewSuspense />
    </Suspense>
  );
};

export default DatabaseNewPage;
