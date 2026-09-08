import { SignInForm } from "@/components/auth/signin";
import { assetUrl } from "@/lib/asset-url";
import { getUser } from "@/lib/supabase/auth";
import { redirect } from "next/navigation";
import { getSafeRedirectPath } from "@/lib/utils/safe-redirect";

type SearchParams = {
  next?: string | string[];
  redirectTo?: string | string[];
  mfa?: string | string[];
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const user = await getUser();

  // THE SECOND-FACTOR STOP. The middleware sends a password-only session on an
  // MFA account here with ?mfa=required. That user IS signed in, so the
  // "already signed in, go to the dashboard" redirect below used to fire,
  // the middleware sent them straight back, and the browser showed a loop
  // ending in "MFA required" with no way to enter a code. With the flag, the
  // form renders in its TOTP step instead and returns to `redirectTo` after.
  const mfaRequired = (Array.isArray(params.mfa) ? params.mfa[0] : params.mfa) === "required";

  if (user && !mfaRequired) {
    redirect(getSafeRedirectPath(params));
  }

  return (
    <div className="relative min-h-svh w-full overflow-hidden bg-[#04060b] antialiased">
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url('${assetUrl("/signin-signup-bg.png")}')` }}
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.18)_0%,rgba(0,0,0,0.52)_65%,rgba(0,0,0,0.82)_100%)]" />

      <div className="relative z-10 flex min-h-svh items-center justify-center px-4 py-8 sm:px-6 sm:py-10">
        <SignInForm mfaRequired={Boolean(user) && mfaRequired} />
      </div>
    </div>
  );
}
