import ProfileSettings from "@/components/dashboard/profile/page";

import { SidebarLayout } from "@/components/dashboard/sidebar/layout";
import { ErrorMessage } from "@/components/dashboard/utils/error";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";

import { Suspense } from "react";

const SERIF_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-nunito), system-ui, sans-serif",
};
const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

const ProfileSuspense = async () => {
  try {
    return (
      <div className="min-w-0">
        <h1 className="text-[34px] sm:text-[40px] leading-[1.05] tracking-[-0.025em] text-white font-semibold mb-2">
          Your{" "}
          <span style={SERIF_STYLE} className="text-white/55 font-normal">
            profile
          </span>
          .
        </h1>
        <p
          className={`${MONO} max-w-xl text-[11.5px] text-white/45 leading-relaxed mb-10`}
        >
          Update your identity and password. Changes apply immediately.
        </p>

        <div className="border-t border-white/[0.06] pt-8">
          <ProfileSettings />
        </div>
      </div>
    );
  } catch (error) {
    console.error("Error in Profile component:", error);
    return (
      <ErrorMessage message="An unexpected error occurred. Please try again later." />
    );
  }
};

const ProfilePage = async () => {
  return (
    <SidebarLayout>
      <div className="relative min-h-full bg-[#08090b] text-white [&_button]:cursor-pointer [&_a]:cursor-pointer [&_[role=tab]]:cursor-pointer">
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
            <ProfileSuspense />
          </Suspense>
        </div>
      </div>
    </SidebarLayout>
  );
};

export default ProfilePage;
