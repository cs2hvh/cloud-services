import DatabaseSelect from "@/components/dashboard/database/new";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { getUser } from "@/lib/supabase/auth";
import { Database_Clusters } from "@/lib/supabase/queries/database_clusters";
import { Projects } from "@/lib/supabase/queries/projects";
import { getCachedProducts, getCachedLocations } from "@/lib/cache/query-cache";
import { notFound } from "next/navigation";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

const DatabaseNewSuspense = async () => {
  const user = await getUser();
  
  if (!user) {
    notFound();
  }

  // Parallel data fetching with caching for products and locations
  const [products, location, projects, clusters] = await Promise.all([
    getCachedProducts.byType("database"),
    getCachedLocations.all(),
    Projects.get_all_by_user(user.id),
    Database_Clusters.read_all_owner_id(user.id),
  ]);

  return <DatabaseSelect products={products} locations={location} projects={projects} userId={user.id} clusters={clusters} />;
};

const DatabaseNewPage = () => {
  return (
    <div className="flex-1 bg-black min-h-screen p-6 sm:p-8 text-white">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">New Database Cluster</h1>
        <p className="text-white/60">Deploy a managed database with automated backups and high availability.</p>
      </div>
      
      <div className="border-t border-white/10 pt-8">
        <Suspense fallback={
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner />
          </div>
        }>
          <DatabaseNewSuspense />
        </Suspense>
      </div>
    </div>
  );
};

export default DatabaseNewPage;