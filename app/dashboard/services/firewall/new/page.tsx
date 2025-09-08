import FirewallSelect from "@/components/dashboard/firewall/new";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { Suspense } from "react";

const FirewallNewSuspense = async () => {
  return <FirewallSelect />;
};

const FirewallNewPage = () => {
  return (
    <div className="flex-1 bg-black min-h-screen p-6 sm:p-8 text-white">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Configure Web Application Firewall</h1>
        <p className="text-white/60">Set up advanced Layer 7 protection for your web applications and APIs.</p>
      </div>
      
      <div className="border-t border-white/10 pt-8">
        <Suspense fallback={
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner />
          </div>
        }>
          <FirewallNewSuspense />
        </Suspense>
      </div>
    </div>
  );
};

export default FirewallNewPage;
