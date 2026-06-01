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

  return (
    <div className="relative min-h-full bg-[#08090b] text-white">
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div
          className="absolute -top-[300px] -right-[200px] h-[800px] w-[800px] blur-[60px]"
          style={{
            background:
              "radial-gradient(circle, rgba(0,149,255,0.07), transparent 60%)",
          }}
        />
        <div
          className="absolute -bottom-[400px] -left-[200px] h-[700px] w-[700px] blur-[70px]"
          style={{
            background:
              "radial-gradient(circle, rgba(0,149,255,0.04), transparent 60%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.018) 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
        />
      </div>
      <div className="relative z-10 px-6 py-8 sm:px-8 xl:px-10">
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-20">
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
    </div>
  );
};

export default SingleDbPage;
