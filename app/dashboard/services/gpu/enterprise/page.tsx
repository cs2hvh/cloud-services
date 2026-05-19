import Link from "next/link";

import EnterpriseInquiryForm from "@/components/dashboard/gpu/enterprise-form";
import { ArrowLeft, ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default function GpuEnterprisePage() {
    return (
        <div className="flex-1 min-h-screen px-6 py-5 text-white sm:px-8 sm:py-8 xl:px-9">
            <nav className="mb-5 flex items-center gap-1.5 text-sm text-white/38">
                <Link
                    href="/dashboard/services/gpu"
                    className="flex items-center gap-1.5 transition-colors hover:text-white/70"
                >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    GPU Cloud
                </Link>
                <ChevronRight className="h-3 w-3 text-white/20" />
                <span className="text-white/55">Reserved & Clusters</span>
            </nav>
            <EnterpriseInquiryForm />
        </div>
    );
}
