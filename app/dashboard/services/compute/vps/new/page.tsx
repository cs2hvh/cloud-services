import VPSFormLoader from "@/components/dashboard/compute/vps/form-loader";
import { Suspense } from "react";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";

const VPSNewPage = () => {
  return (
    <div className="flex-1 min-h-screen px-6 py-5 text-white sm:px-8 sm:py-8 xl:px-9">
      <nav className="mb-5 flex items-center gap-1.5 text-sm text-white/38">
        <Link
          href="/dashboard/services/compute/vps"
          className="flex items-center gap-1.5 transition-colors hover:text-white/70"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Virtual Servers
        </Link>
        <ChevronRight className="h-3 w-3 text-white/20" />
        <span className="text-white/55">New Server</span>
      </nav>
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner />
          </div>
        }
      >
        <VPSFormLoader />
      </Suspense>
    </div>
  );
};

export default VPSNewPage;
