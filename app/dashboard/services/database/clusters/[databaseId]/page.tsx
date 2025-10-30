"use server"
import Singledb from "@/components/dashboard/database/singledb";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { Database_Clusters } from "@/lib/supabase/queries";
import { Suspense } from "react";

type Params = { databaseId: string };


const SingleDbSuspense = async ({databaseId,status}:{ databaseId: string, status: string }) => {
  return <Singledb databaseId={databaseId} status={status} />
};

const SingleDbPage = async ({
  params,
}: {
  params: Promise<Params>;
}) => {


    //console.log(params,".............params...........");

    const { databaseId } = await params;
    // console.log(databaseId,".............databaseId...........");
   const databaseStatus =(await Database_Clusters.read(databaseId))?.data?.status ?? "failed";

    // console.log(databaseStatus,".............database status...........");
  return (
    <div className="flex-1 bg-black min-h-screen p-6 sm:p-8 text-white">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Single Database Page</h1>
        <p className="text-white/60">This page contains information about single database cluster.</p>
      </div>
      
      <div className="border-t border-white/10 pt-8">
        <Suspense fallback={
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner  />
          </div>
        }>
          <SingleDbSuspense status={databaseStatus} databaseId={decodeURIComponent(databaseId)} />
        </Suspense>
      </div>
    </div>
  );
};

export default SingleDbPage;