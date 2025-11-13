"use server"
import SingleCluster from "@/components/dashboard/kubernetes/clusters/singlecluster/singlecluster";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { Suspense } from "react";

type Params = { clusterId: string };


const ClusterNewSuspense = async ({clusterId}:{ clusterId: string }) => {
  return <SingleCluster clusterId={clusterId}  />
};

const ClusterNewPage = async ({
  params,
}: {
  params: Promise<Params>;
}) => {


    //console.log(params,".............params...........");

    const { clusterId } = await params;   
    console.log(clusterId,".............clusterId...........");
  //const clusterId =  decodeURIComponent(clusterId);
  return (
    <div className="flex-1 bg-black min-h-screen p-6 sm:p-8 text-white">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Single Cluster Page</h1>
        <p className="text-white/60">This page contains information about single cluster.</p>
      </div>
      
      <div className="border-t border-white/10 pt-8">
        <Suspense fallback={
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner  />
          </div>
        }>
          <ClusterNewSuspense clusterId={decodeURIComponent(clusterId)} />
        </Suspense>
      </div>
    </div>
  );
};

export default ClusterNewPage;