import DDoSProtectionSelect from "@/components/dashboard/network-ddos/new";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { getUser } from "@/lib/supabase/auth";
import { Projects,  } from "@/lib/supabase/queries/projects";
import { Spectrum_Apps } from "@/lib/supabase/queries/spectrum_apps";
import { notFound } from "next/navigation";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

const DDoSProtectionNewSuspense = async () => {
  const user = await getUser();

  if (!user ) {
    notFound();
  }

  const projects = await Projects.get_all_by_user(user?.id);
  const spectrumApps = await Spectrum_Apps.get_all_app_name('user');

  return <DDoSProtectionSelect projects={projects} userId={user?.id} spectrumApps={spectrumApps} />;
};

const DDoSProtectionNewPage = () => {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner />
        </div>
      }
    >
      <DDoSProtectionNewSuspense />
    </Suspense>
  );
};

export default DDoSProtectionNewPage;
