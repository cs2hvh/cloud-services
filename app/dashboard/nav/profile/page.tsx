import { redirect } from "next/navigation";

import { buildSettingsRedirect } from "../settings-redirect";

// Legacy route — account settings now live at /dashboard/settings.
const ProfilePage = async ({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) => {
  redirect(buildSettingsRedirect("profile", await searchParams));
};

export default ProfilePage;
