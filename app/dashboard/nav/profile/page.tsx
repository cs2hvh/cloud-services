import ProfileSettings from "@/components/dashboard/profile/page";

import { SidebarLayout } from "@/components/dashboard/sidebar/layout";
import { ErrorMessage } from "@/components/dashboard/utils/error";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";

import { Suspense } from "react";

const ProfileSuspense = async () => {
  try {
    return (
      <div className="space-y-5 px-2 py-4 text-white sm:px-3 lg:px-4">
        <div className="glass-panel overflow-hidden">
          <div className="flex flex-col gap-5 px-5 py-5 sm:px-6 sm:py-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-300/70">
                User Profile
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                Manage your personal identity and credential settings.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/50 sm:text-[15px]">
                Keep your account details current and use the password actions below to maintain
                secure access to your workspace.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:min-w-[260px]">
              <div className="border border-white/[0.08] bg-white/[0.04] px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                  Section
                </div>
                <div className="mt-2 text-lg font-semibold text-white">Profile</div>
              </div>
              <div className="border border-white/[0.08] bg-white/[0.04] px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                  Security
                </div>
                <div className="mt-2 text-lg font-semibold text-white">Password Controls</div>
              </div>
            </div>
          </div>
        </div>

        <div className="glass-panel overflow-hidden">
          <div className="border-b border-white/[0.06] px-5 py-5 sm:px-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
              Identity
            </p>
            <h2 className="mt-1 text-xl font-semibold text-white">Profile Details</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/45">
              Update your profile details and security preferences in one place.
            </p>
          </div>
          <div className="px-5 py-5 sm:px-6 sm:py-6">
            <ProfileSettings />
          </div>
        </div>
      </div>
    );
  } catch (error) {
    console.error("Error in ApplicationForms component:", error);
    return (
      <ErrorMessage message="An unexpected error occurred. Please try again later." />
    );
  }
};

const ProfilePage = async () => {
  return (
    <SidebarLayout>
      <div className="dashboard-bg flex-1 min-h-screen px-6 py-5 text-white sm:px-8 sm:py-8 xl:px-9 [&_button]:cursor-pointer [&_a]:cursor-pointer [&_[role=tab]]:cursor-pointer">
        <Suspense fallback={<LoadingSpinner />}>
          <ProfileSuspense />
        </Suspense>
      </div>
    </SidebarLayout>
  );
};

export default ProfilePage;
