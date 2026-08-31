// Legacy /dashboard/nav/{profile,account} routes fold into /dashboard/settings.
// Query params are carried through — the Connections tab reads `reconnect` and
// `returnTo` when a git provider token expires.
export function buildSettingsRedirect(
  tab: "profile" | "account" | "security",
  searchParams: Record<string, string | string[] | undefined>
): string {
  const params = new URLSearchParams();
  params.set("tab", tab);

  for (const [key, value] of Object.entries(searchParams)) {
    if (key === "tab") continue;
    if (typeof value === "string") params.set(key, value);
    else if (Array.isArray(value)) value.forEach((entry) => params.append(key, entry));
  }

  return `/dashboard/settings?${params.toString()}`;
}
