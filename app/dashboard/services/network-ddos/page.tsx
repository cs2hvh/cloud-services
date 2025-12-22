import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { getUser } from "@/lib/supabase/auth";
import { Spectrum_Apps } from "@/lib/supabase/queries/spectrum_apps";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import NetworkDDoSMain from "@/components/dashboard/network-ddos/main";

const NetworkDDoSSuspense = async () => {
  const user = await getUser();

  if (!user) {
    notFound();
  }

  const spectrumApps = await Spectrum_Apps.list_by_owner(user.id);

  return (
    <NetworkDDoSMain spectrumApps={spectrumApps} userId={user.id} />
  );
};

const NetworkDDoSPage = () => {
  return (
    <div className="flex-1 bg-black min-h-screen">
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner />
          </div>
        }
      >
        <NetworkDDoSSuspense />
      </Suspense>
    </div>
  );
};

export default NetworkDDoSPage;
