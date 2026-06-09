import { notFound } from "next/navigation";

import { requireAdmin } from "@/lib/supabase/auth";
import { getGpuDeployEnabled } from "@/lib/admin/platform-settings";
import { GpuAvailabilityToggle } from "@/components/admin/gpu/gpu-availability-toggle";

export const dynamic = "force-dynamic";

export default async function AdminGpuPage() {
  const admin = await requireAdmin();
  if (!admin.ok) notFound();

  const enabled = await getGpuDeployEnabled();

  return (
    <div className="min-h-full bg-[#08090b] text-white">
      <div className="mx-auto max-w-3xl px-6 py-10 sm:px-10">
        <a
          href="/dashboard/admin"
          className="text-[12px] text-white/45 hover:text-white transition-colors"
        >
          ← Admin
        </a>
        <h1 className="mt-4 text-[28px] font-semibold tracking-[-0.02em]">
          GPU stock
        </h1>
        <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-white/55">
          Master switch for GPU pod deployments. Turn it off (for example when the
          upstream GPU account has no balance) to mark every GPU as out of stock —
          the deploy wizard blocks it and the create API rejects new pods.
        </p>

        <div className="mt-8">
          <GpuAvailabilityToggle initialEnabled={enabled} />
        </div>
      </div>
    </div>
  );
}
