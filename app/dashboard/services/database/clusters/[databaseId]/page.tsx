"use server";
import Singledb from "@/components/dashboard/database/singledb";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { Database_Clusters } from "@/lib/supabase/queries/database_clusters";
import { Products } from "@/lib/supabase/queries/products";
import { Suspense } from "react";
import { Tables } from "@/lib/supabase/types";

type Params = { databaseId: string };

const SingleDbSuspense = async ({
  databaseId,
  products,
}: {
  databaseId: string;
  products: Tables<"products">[];
}) => {
  return <Singledb databaseId={databaseId} products={products} />;
};

const SingleDbPage = async ({ params }: { params: Promise<Params> }) => {
  //console.log(params,".............params...........");

  const { databaseId } = await params;
  //console.log(databaseId,".............databaseId...........");

  // Fetch database cluster details
  const databaseCluster = await Database_Clusters.read(databaseId);
  const databaseEngine = databaseCluster?.data?.engine ?? "";

  // Fetch database products for storage tier options based on database engine type
  const databaseProducts = await Products.get_by_type_and_subtype(
    "database",
    databaseEngine
  );

  //console.log(databaseStatus,".............database status...........");
  return (
    <div className="flex-1 min-h-screen bg-black text-white">
        <Suspense
          fallback={
            <div className="flex items-center justify-center px-4 py-20">
              <LoadingSpinner />
            </div>
          }
        >
          <SingleDbSuspense
            databaseId={decodeURIComponent(databaseId)}
            products={databaseProducts}
          />
        </Suspense>
    </div>
  );
};

export default SingleDbPage;
