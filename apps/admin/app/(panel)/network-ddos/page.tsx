import { Suspense } from "react";
import { notFound } from "next/navigation";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { requireAdmin } from "@/lib/supabase/auth";
import AdminNetworkDDoS from "@admin/components/admin/network-ddos/admin-network-ddos";
import { Spectrum_Apps } from "@/lib/supabase/queries/spectrum_apps";

export const dynamic = "force-dynamic";

const AdminNetworkDDoSSuspense = async () => {
  const checkAdmin = await requireAdmin();
  if (!checkAdmin.ok) {
    notFound();
  }

  const apps = await Spectrum_Apps.get_all_for_admin();
  return <AdminNetworkDDoS all_apps={apps} />;
};

export default function AdminNetworkDDoSPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner />
        </div>
      }
    >
      <AdminNetworkDDoSSuspense />
    </Suspense>
  );
}
