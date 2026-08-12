import { redirect } from "next/navigation";

import { buildSettingsRedirect } from "../settings-redirect";

// Legacy route — connected accounts now live in the Settings "Connections" tab.
const NavAccount = async ({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) => {
  redirect(buildSettingsRedirect("account", await searchParams));
};

export default NavAccount;
