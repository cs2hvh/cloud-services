"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const FORBIDDEN_MSG =
  "This account is not on the panel's admin allowlist. Signing in succeeded, but access was refused — contact the platform owner to be added.";

export function SignInForm({
  redirectTo,
  error,
}: {
  redirectTo: string;
  error?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(
    error === "forbidden" ? FORBIDDEN_MSG : null,
  );

  // A non-admin login succeeds at Supabase, then the middleware bounces the
  // client-side navigation straight back here with ?error=forbidden — SAME
  // route, so this component instance survives and useState initials never
  // re-run. Without this effect the button spun forever and the refusal only
  // existed in the URL. Also sign the refused session out, so retrying with
  // a different account starts clean instead of looping on the old cookie.
  useEffect(() => {
    if (error === "forbidden") {
      setSubmitting(false);
      setFormError(FORBIDDEN_MSG);
      void createClient().auth.signOut();
    }
  }, [error]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setFormError(signInError.message);
      setSubmitting(false);
      return;
    }

    // Probe the gate BEFORE navigating: an admin gets 200 for "/", anyone
    // else gets the middleware's redirect (opaque under redirect:"manual").
    // Refusing here keeps the form responsive on every attempt instead of
    // bouncing through ?error=forbidden with component state intact.
    const probe = await fetch("/", { redirect: "manual" }).catch(() => null);
    const refused =
      !probe ||
      probe.type === "opaqueredirect" ||
      (probe.status >= 300 && probe.status < 400) ||
      probe.status === 0;
    if (refused) {
      await supabase.auth.signOut();
      setFormError(FORBIDDEN_MSG);
      setSubmitting(false);
      return;
    }

    router.replace(redirectTo);
    router.refresh();
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-card">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold">AhuraSense Admin</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in with an admin account to continue
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl border border-border bg-card p-6"
        >
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {formError && (
            <p className="text-sm text-red-400" role="alert">
              {formError}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
