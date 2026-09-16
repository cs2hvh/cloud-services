"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const FORBIDDEN_MSG =
  "This account is not on the panel's admin allowlist. Signing in succeeded, but access was refused — contact the platform owner to be added.";

const MFA_MSG = "Enter the code from your authenticator app to finish signing in.";

const NETWORK_MSG =
  "Could not reach the panel. Check your connection and try again.";

/**
 * SAME-ORIGIN AUTH. This form talks only to /api/auth/* on this host; the
 * server performs the Supabase calls and sets the session cookies.
 *
 * It used to call Supabase from the browser, which quietly made "can this
 * person administer the platform?" depend on whether their network allowed a
 * third-party domain. On 2026-09-15 that failed for real — the login POST was
 * reset in transit while the panel itself loaded fine, surfacing only as
 * "Failed to fetch". One domain now, and a server-side fault says so instead
 * of impersonating a bad password.
 */

/** POST JSON to our own origin, normalising transport failure into a message. */
async function post<T>(
  url: string,
  body: unknown,
): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as
      | (T & { error?: string })
      | null;
    if (!res.ok || !data) {
      return { data: null, error: data?.error ?? `Sign-in failed (${res.status})` };
    }
    return { data, error: null };
  } catch {
    return { data: null, error: NETWORK_MSG };
  }
}

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

  // SECOND FACTOR. The middleware and requireAdmin refuse a password-only
  // session on an MFA-enrolled account (2026-09-05). This form is where that
  // session completes the step: the sign-in response says whether a factor is
  // still owed, and the code is verified server-side before probing the gate.
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");

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
      void fetch("/api/auth/signout", { method: "POST" }).catch(() => null);
    }
    // The middleware sent a password-only session here to finish MFA: ask the
    // server which factor that session owes and go straight to the code step.
    if (error === "mfa_required") {
      void (async () => {
        try {
          const res = await fetch("/api/auth/mfa");
          const data = (await res.json()) as { factorId: string | null };
          if (data.factorId) {
            setFactorId(data.factorId);
            setFormError(MFA_MSG);
          }
        } catch {
          setFormError(NETWORK_MSG);
        }
        setSubmitting(false);
      })();
    }
  }, [error]);

  /** Probe the gate, then navigate. Shared by the password and the TOTP steps. */
  async function finishSignIn() {
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
      await fetch("/api/auth/signout", { method: "POST" }).catch(() => null);
      setFormError(FORBIDDEN_MSG);
      setSubmitting(false);
      return;
    }

    router.replace(redirectTo);
    router.refresh();
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);

    const { data, error: signInError } = await post<{
      mfaRequired: boolean;
      factorId?: string;
    }>("/api/auth/signin", { email, password });

    if (signInError || !data) {
      setFormError(signInError ?? "Sign-in failed");
      setSubmitting(false);
      return;
    }

    if (data.mfaRequired && data.factorId) {
      setFactorId(data.factorId);
      setFormError(MFA_MSG);
      setSubmitting(false);
      return;
    }

    await finishSignIn();
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factorId) return;
    setSubmitting(true);
    setFormError(null);

    const { error: verifyError } = await post<{ ok: boolean }>("/api/auth/mfa", {
      factorId,
      code: code.trim(),
    });
    if (verifyError) {
      setFormError(verifyError);
      setSubmitting(false);
      return;
    }

    await finishSignIn();
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
            {factorId ? "Two-factor authentication" : "Sign in with an admin account to continue"}
          </p>
        </div>

        {factorId ? (
          <form
            onSubmit={handleVerifyCode}
            className="space-y-4 rounded-xl border border-border bg-card p-6"
          >
            <div className="space-y-2">
              <Label htmlFor="totp">Authenticator code</Label>
              <Input
                id="totp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
              />
            </div>

            {formError && (
              <p className="text-sm text-muted-foreground" role="status">
                {formError}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={submitting || code.length !== 6}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying…
                </>
              ) : (
                "Verify"
              )}
            </Button>
          </form>
        ) : (
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
        )}
      </div>
    </div>
  );
}
