import DDoSProtectionSelect from "@/components/dashboard/network-ddos/new";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { Suspense } from "react";

const DDoSProtectionNewSuspense = async () => {
  return <DDoSProtectionSelect />;
};

const DDoSProtectionNewPage = () => {
  return (
    <div className="flex-1 bg-black min-h-screen p-6 sm:p-8 text-white">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Enable DDoS Protection</h1>
        <p className="text-white/60">Configure advanced network protection for your infrastructure.</p>
      </div>
      
      <div className="border-t border-white/10 pt-8">
        <Suspense fallback={
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner />
          </div>
        }>
          <DDoSProtectionNewSuspense />
        </Suspense>
      </div>
    </div>
  );
};

export default DDoSProtectionNewPage;
