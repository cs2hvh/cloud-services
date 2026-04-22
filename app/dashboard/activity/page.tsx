import { Suspense } from "react";
import { SidebarLayout } from "@/components/dashboard/sidebar/layout";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { ErrorMessage } from "@/components/dashboard/utils/error";
import ActivityPage from "@/components/dashboard/activity/page";
import { getUser } from "@/lib/supabase/auth";
import { Projects } from "@/lib/supabase/queries/projects";
import { notFound } from "next/navigation";

const ActivitySuspense = async () => {
  try {
    const user = await getUser();
    if (!user) notFound();

    const logs = (await Projects.get_logs_by_user(user.id)) || [];

    return <ActivityPage logs={logs} />;
  } catch (error) {
    console.error("Error loading activity logs:", error);
    return (
      <ErrorMessage message="Unable to load activity. Please try again later." />
    );
  }
};

const Activity = async () => {
  return (
    <SidebarLayout>
      <div className="flex-1 bg-[#0a0a0a] min-h-screen p-6 sm:p-8 text-white">
        <Suspense fallback={<LoadingSpinner />}>
          <ActivitySuspense />
        </Suspense>
      </div>
    </SidebarLayout>
  );
};

export default Activity;
