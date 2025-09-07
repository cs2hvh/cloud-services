import DatabaseSelect from "@/components/dashboard/database/new";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { serviceLocations } from "@/config/locations";
import { Products } from "@/lib/supabase/queries";
import { Suspense } from "react";

const DatabaseNewSuspense = async () => {
  const products = await Products.get_by_type("database");
  return <DatabaseSelect products={products} locations={serviceLocations} />;
};

const DatabaseNewPage = () => {
  return (
    <div className="flex-1 bg-black min-h-screen">
      <div className="px-6 py-4">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white mb-2">New Database Cluster</h1>
          <p className="text-gray-400">Deploy a managed database with automated backups and high availability</p>
        </div>
        
        <div className="border-t border-gray-800 pt-4">
          <Suspense fallback={
            <div className="flex items-center justify-center py-20">
              <LoadingSpinner />
            </div>
          }>
            <DatabaseNewSuspense />
          </Suspense>
        </div>
      </div>
    </div>
  );
};

export default DatabaseNewPage;