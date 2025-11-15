import SettingsPage from "@/components/dashboard/settings/page";

import { SidebarLayout } from "@/components/dashboard/sidebar/layout";
import { ErrorMessage } from "@/components/dashboard/utils/error";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";

import { Suspense } from "react";

const SettingsSuspense = async () => {
  try {
    return (
      <>
        <SettingsPage />
      </>
    );
  } catch (error) {
    console.error("Error in Settings component:", error);
    return (
      <ErrorMessage message="An unexpected error occurred. Please try again later." />
    );
  }
};

const Settings = async () => {
  return (
    <SidebarLayout>
      <Suspense fallback={<LoadingSpinner />}>
        <SettingsSuspense />
      </Suspense>
    </SidebarLayout>
  );
};

export default Settings;