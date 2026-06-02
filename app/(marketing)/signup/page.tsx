import SignUpMultiStep from "@/components/auth/signup";
import { assetUrl } from "@/lib/asset-url";
import { getUser } from "@/lib/supabase/auth";
import { redirect } from "next/navigation";
import { getSafeRedirectPath } from "@/lib/utils/safe-redirect";

type SearchParams = {
  next?: string | string[];
  redirectTo?: string | string[];
};

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const user = await getUser();

  if (user) {
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
        <SignUpMultiStep />
      </div>
    </div>
  );
}
