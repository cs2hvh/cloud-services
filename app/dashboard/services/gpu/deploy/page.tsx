import { Suspense } from "react";

import DeployWizardLoader from "@/components/dashboard/gpu/deploy-wizard-loader";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";

export const dynamic = "force-dynamic";

export default function GpuDeployPage() {
    return (
        // Deploy page owns its own surface — slightly darker than the rest of
        // the dashboard, with a subtle dotted grid texture overlay (rendered
        // via a fixed pseudo-element in deploy-wizard).
        <div className="relative min-h-full bg-[#08090b] text-white">
            <Suspense
                fallback={
                    <div className="flex items-center justify-center py-20">
                        <LoadingSpinner />
                    </div>
                }
            >
                <DeployWizardLoader />
            </Suspense>
        </div>
    );
}
