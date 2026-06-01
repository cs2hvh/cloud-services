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
      <div className="relative min-h-full bg-[#08090b] text-white">
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
          <div
            className="absolute -top-[300px] -right-[200px] h-[800px] w-[800px] blur-[60px]"
            style={{
              background:
                "radial-gradient(circle, rgba(0,149,255,0.07), transparent 60%)",
            }}
          />
          <div
            className="absolute -bottom-[400px] -left-[200px] h-[700px] w-[700px] blur-[70px]"
            style={{
              background:
                "radial-gradient(circle, rgba(0,149,255,0.04), transparent 60%)",
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.018) 1px, transparent 0)",
              backgroundSize: "28px 28px",
            }}
          />
        </div>

        <div className="relative z-10 px-6 py-8 sm:px-10 sm:py-10">
          <Suspense fallback={<LoadingSpinner />}>
            <ActivitySuspense />
          </Suspense>
        </div>
      </div>
    </SidebarLayout>
  );
};

export default Activity;
