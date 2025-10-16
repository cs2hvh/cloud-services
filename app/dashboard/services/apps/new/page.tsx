import AppDeploymentSelect from "@/components/dashboard/apps/new";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { Suspense } from "react";

const AppDeploymentNewSuspense = async () => {
  return <AppDeploymentSelect />;
};

const AppDeploymentNewPage = () => {
  return (
    <div className="flex-1 bg-black min-h-screen p-6 sm:p-8 text-white">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Deploy New Application</h1>
        <p className="text-white/60">Deploy your application directly from your Git repository with automatic builds and scaling.</p>
      </div>
      
      <div className="border-t border-white/10 pt-8">
        <Suspense fallback={
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner />
          </div>
        }>
          <AppDeploymentNewSuspense />
        </Suspense>
      </div>
    </div>
  );
};

export default AppDeploymentNewPage;
