import GpuDashboard from "@/components/dashboard/gpu/gpu-dashboard";

export const dynamic = "force-dynamic";

export default function GpuLandingPage() {
    return (
        <div className="flex-1 min-h-screen px-6 py-6 text-white sm:px-8 sm:py-8">
            <GpuDashboard />
        </div>
    );
}
