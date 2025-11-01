import DatabaseSelect from "@/components/dashboard/database/new";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
// import { serviceLocations } from "@/config/locations";
import { getUser } from "@/lib/supabase/auth";
import { Locations, Products, Projects } from "@/lib/supabase/queries";
import { notFound } from "next/navigation";
import { Suspense } from "react";

const DatabaseNewSuspense = async () => {
  const products = await Products.get_by_type("database");
  const location = await Locations.get_all();
  const user = await getUser();
    
      if (!user) {
        notFound();
      }
    
     if(!user){
         throw new Error("User not found");
     }
     const projects = await Projects.get_all_by_user(user.id);

  console.log(products,"...........database products...........");
  return <DatabaseSelect products={products} locations={location} projects={projects} userId={user.id} />;
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