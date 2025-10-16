import ProfileSettings from "@/components/dashboard/profile/page";

import { SidebarLayout } from "@/components/dashboard/sidebar/layout";
import { ErrorMessage } from "@/components/dashboard/utils/error";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";

import { Suspense } from "react";

const ProfileSuspense = async () => {
  try {
    //const project = await Projects.get_by_id(id);

    // if (!project) {
    //   return (
    //     <ErrorMessage message="Unable to load application forms. Please try again later." />
    //   );
    // }

    return (
      <>
        <ProfileSettings />
      </>
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
      <Suspense fallback={<LoadingSpinner />}>
        <ProfileSuspense />
      </Suspense>
    </SidebarLayout>
  );
};

export default ProfilePage;
