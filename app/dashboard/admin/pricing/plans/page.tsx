import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { PlanPricingManager } from "@/components/admin/pricing/plan-pricing-manager";

export const dynamic = "force-dynamic";

export default function AdminInstancePlanPricingPage() {
    return (
        <div className="p-6 sm:p-8 max-w-[1600px] mx-auto pb-16">
            <header className="mb-8">
                <Link
                    href="/dashboard/admin/pricing"
                    className="inline-flex items-center gap-1.5 text-[12px] text-white/45 hover:text-white/85 transition-colors mb-4"
                >
                    <ArrowLeft className="h-3 w-3" />
                    Back to pricing
                </Link>
                <h1 className="text-[28px] font-semibold tracking-tight text-white">
                    Instance plan pricing
                </h1>
                <p className="mt-1.5 text-[14px] text-white/55">
                    Override the per-plan hourly and monthly price. Reverting a row drops the override
                    so the plan falls back to its code default. Cache refreshes within 60 seconds of a
                    change.
                </p>
            </header>
            <PlanPricingManager />
        </div>
    );
}
