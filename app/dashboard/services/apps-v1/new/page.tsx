import AppDeploymentSelect from "@/components/dashboard/apps/new";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { getAllPlatformAppRates } from "@/config/pricing";
import { getUser } from "@/lib/supabase/auth";
import { Projects } from "@/lib/supabase/queries/projects";
import { notFound } from "next/navigation";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

const AppDeploymentNewSuspense = async () => {
  const user = await getUser();

  if (!user) {
    notFound();
  }

  const [projects, pricing] = await Promise.all([
    Projects.get_all_by_user(user.id),
    getAllPlatformAppRates(),
  ]);

  return <AppDeploymentSelect projects={projects} pricing={pricing} />;
};

const AppDeploymentNewPage = () => {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner />
        </div>
      }
    >
      <AppDeploymentNewSuspense />
    </Suspense>
  );
};

export default AppDeploymentNewPage;
