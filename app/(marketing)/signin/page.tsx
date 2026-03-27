import { SignInForm } from "@/components/auth/signin";
import { getUser } from "@/lib/supabase/auth";
import { redirect } from "next/navigation";

type SearchParams = {
  next?: string | string[];
  redirectTo?: string | string[];
};

function getSafeRedirectPath(searchParams: SearchParams): string {
  const next = Array.isArray(searchParams.next)
    ? searchParams.next[0]
    : searchParams.next;
  const redirectTo = Array.isArray(searchParams.redirectTo)
    ? searchParams.redirectTo[0]
    : searchParams.redirectTo;
  const raw = next || redirectTo || "/";
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}

export default async function SignInPage({
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
        style={{ backgroundImage: "url('/signin-signup-bg.png')" }}
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.18)_0%,rgba(0,0,0,0.52)_65%,rgba(0,0,0,0.82)_100%)]" />

      <div className="relative z-10 flex min-h-svh items-center justify-center px-4 py-8 sm:px-6 sm:py-10">
        <SignInForm />
      </div>
    </div>
  );
}
