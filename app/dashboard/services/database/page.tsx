
import DatabasePage from "@/components/dashboard/database/main";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { Suspense } from "react";

const DatabasePageSuspense = async () => {
  return <DatabasePage />;
};

const DatabasePageWrapper = () => {
  return (
  
        <Suspense fallback={
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner />
          </div>
        }>
          <DatabasePageSuspense />
        </Suspense>
    
  );
};

export default DatabasePageWrapper;