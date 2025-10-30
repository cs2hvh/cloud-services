import VPSFormLoader from "@/components/dashboard/compute/vps/form-loader";
import { Suspense } from "react";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";

const VPSNewPage = () => {
  return (
    <div className="flex-1 bg-black min-h-screen p-6 sm:p-8 text-white">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">New VPS Instance</h1>
        <p className="text-white/60">Deploy a scalable virtual private server with flexible resource allocation.</p>
      </div>
      
      <div className="border-t border-white/10 pt-8">
        <Suspense fallback={
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner />
          </div>
        }>
          <VPSFormLoader />
        </Suspense>
      </div>
    </div>
  );
};

export default VPSNewPage;
