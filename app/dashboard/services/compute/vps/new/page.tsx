import VPSFormLoader from "@/components/dashboard/compute/vps/form-loader";
import { Suspense } from "react";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";

const VPSNewPage = () => {
    return (
        <Suspense
            fallback={
                <div className="flex items-center justify-center py-20">
                    <LoadingSpinner />
                </div>
            }
        >
            <VPSFormLoader />
        </Suspense>
    );
};

export default VPSNewPage;
