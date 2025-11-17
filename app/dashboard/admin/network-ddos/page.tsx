import { Suspense } from "react";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { requireAdmin } from "@/lib/supabase/auth";
import { notFound } from "next/navigation";
import AdminNetworkDDoS from "@/components/admin/network-ddos/admin-network-ddos";
import { Spectrum_Apps } from "@/lib/supabase/queries";

const AdminNetworkDDoSSuspense = async () => {
  const checkAdmin = await requireAdmin();

  if (!checkAdmin.ok) {
    notFound();
  }

  // Fetch all spectrum apps for admin
  const apps = await Spectrum_Apps.get_all_for_admin();

  return <AdminNetworkDDoS all_apps={apps} />;
};

const AdminNetworkDDoSPage = async () => {
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
};

export default AdminNetworkDDoSPage;