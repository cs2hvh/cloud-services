import Accounts from "@/components/dashboard/accounts/page";

import { SidebarLayout } from "@/components/dashboard/sidebar/layout";
import { ErrorMessage } from "@/components/dashboard/utils/error";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";

import { Suspense } from "react";

const AccountSuspense = async () => {
  try {
    return (
      <>
        <Accounts />
      </>
    );
  } catch (error) {
    console.error("Error in ApplicationForms component:", error);
    return (
      <ErrorMessage message="An unexpected error occurred. Please try again later." />
    );
  }
};

const NavAccount = async () => {
  return (
    <SidebarLayout>
      <div className="flex-1 bg-black min-h-screen p-6 sm:p-8 text-white">
        <Suspense fallback={<LoadingSpinner />}>
          <AccountSuspense />
        </Suspense>
      </div>
    </SidebarLayout>
  );
};

export default NavAccount;