"use server";
import Singledb from "@/components/dashboard/database/singledb";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { Database_Clusters, Products } from "@/lib/supabase/queries";
import { Suspense } from "react";
import { Tables } from "@/lib/supabase/types";

type Params = { databaseId: string };

const SingleDbSuspense = async ({
  databaseId,
  status,
  products,
}: {
  databaseId: string;
  status: string;
  products: Tables<"products">[];
}) => {
  return (
    <Singledb databaseId={databaseId} status={status} products={products} />
  );
};

const SingleDbPage = async ({ params }: { params: Promise<Params> }) => {
  //console.log(params,".............params...........");

  const { databaseId } = await params;
  //console.log(databaseId,".............databaseId...........");

  // Fetch database cluster details
  const databaseCluster = await Database_Clusters.read(databaseId);
  const databaseStatus = databaseCluster?.data?.status ?? "failed";
  const databaseEngine = databaseCluster?.data?.engine ?? "";

  // Fetch database products for storage tier options based on database engine type
  const databaseProducts = await Products.get_by_type_and_subtype(
    "database",
    databaseEngine
  );

  //console.log(databaseStatus,".............database status...........");
  return (
    <div className="flex-1 bg-black min-h-screen p-6 sm:p-8 text-white">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Manage Database Cluster</h1>
        <p className="text-white/60">
          This page contains information about your database cluster.
        </p>
      </div>

      <div className="border-t border-white/10 pt-8">
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-20">
              <LoadingSpinner />
            </div>
          }
        >
          <SingleDbSuspense
            status={databaseStatus}
            databaseId={decodeURIComponent(databaseId)}
            products={databaseProducts}
          />
        </Suspense>
      </div>
    </div>
  );
};

export default SingleDbPage;
