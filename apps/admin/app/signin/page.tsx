import { SignInForm } from "./signin-form";

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; error?: string }>;
}) {
  const params = await searchParams;
  // Only allow same-origin path redirects; anything else falls back to home.
  const redirectTo =
    params.redirectTo?.startsWith("/") && !params.redirectTo.startsWith("//")
      ? params.redirectTo
      : "/";

  return <SignInForm redirectTo={redirectTo} error={params.error} />;
}
