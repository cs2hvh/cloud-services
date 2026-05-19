import GpuPodDetail from "@/components/dashboard/gpu/pod-detail";

export const dynamic = "force-dynamic";

export default function GpuPodPage() {
    return (
        <div className="flex-1 min-h-screen px-6 py-6 text-white sm:px-8 sm:py-8">
            <GpuPodDetail />
        </div>
    );
}
