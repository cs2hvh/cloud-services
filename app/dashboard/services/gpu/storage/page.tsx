import GpuStorage from "@/components/dashboard/gpu/storage-page";

export const dynamic = "force-dynamic";

export default function GpuStoragePage() {
    return (
        <div className="flex-1 min-h-screen px-6 py-6 text-white sm:px-8 sm:py-8">
            <GpuStorage />
        </div>
    );
}
