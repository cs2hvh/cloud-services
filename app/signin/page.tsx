import { SignInForm } from "@/components/auth/signin";
import { getUser } from "@/lib/supabase/auth";
import { Spotlight } from "@/components/ui/spotlight";
import { cn } from "@/lib/utils";
import { redirect } from "next/navigation";

export default async function SignInPage() {
  const user = await getUser();

  if (user) {
    redirect("/");
  }

  return (
    <div className="relative min-h-svh w-full overflow-hidden bg-black/[0.96] antialiased">
      <div
        className={cn(
          "pointer-events-none absolute inset-0 [background-size:40px_40px] select-none",
          "[background-image:linear-gradient(to_right,#171717_1px,transparent_1px),linear-gradient(to_bottom,#171717_1px,transparent_1px)]",
        )}
      />

      <Spotlight
        className="-top-40 left-0 md:-top-20 md:left-60"
        fill="white"
      />

      {/* Content */}
      <div className="relative z-10 flex min-h-svh flex-col items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-sm md:max-w-3xl">
          <SignInForm />
        </div>
      </div>
    </div>
  );
}
