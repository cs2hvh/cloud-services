import VPSFormLoader from "@/components/dashboard/compute/vps/form-loader";
import { Suspense } from "react";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";

const VPSNewPage = () => {
  return (
    <div className="flex-1 min-h-screen px-6 py-5 text-white sm:px-8 sm:py-8 xl:px-9">
      <div className="glass-panel overflow-hidden border border-white/10 px-0 py-0">
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
