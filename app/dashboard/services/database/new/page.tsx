import DatabaseSelect from "@/components/dashboard/database/new";
import { SidebarLayout } from "@/components/dashboard/sidebar/layout";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { Separator } from "@/components/ui/separator";
import { serviceLocations } from "@/config/locations";
import { Products } from "@/lib/supabase/queries";
import { Suspense } from "react";

const DatabaseNewSuspense = async () => {
  const products = await Products.get_by_type("database");
  // console.log(products)
  return <DatabaseSelect products={products} locations={serviceLocations} />;
};

const DatabaseNewPage = () => {
  return (
    <SidebarLayout>
      <div className="flex justify-between pt-4">
        <div>
          <h2 className="text-2xl font-bold">New Database Cluster</h2>
          <p className="text-muted-foreground">Create a new Database Cluster</p>
        </div>
      </div>
      <Separator className="my-4" />
      <Suspense fallback={<LoadingSpinner />}>
        <DatabaseNewSuspense />
      </Suspense>
    </SidebarLayout>
  );
};

export default DatabaseNewPage;
