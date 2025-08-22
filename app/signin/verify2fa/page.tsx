"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

export default function Verify2FAPage() {
  const supabase = createClient();
  const router = useRouter();


  const [code, setCode] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [needsMfa, setNeedsMfa] = useState(false);
  const [factorId, setFactorId] = useState("");
    const search = useSearchParams();

  // Only allow relative paths for safety; default to /dashboard
  const nextPath = useMemo(() => {
    const raw = search.get("next") || "/dashboard";
    return raw.startsWith("/") ? raw : "/dashboard";
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (cancelled) return;

      if (error) {
        setErrorMsg(error.message);
        setReady(true);
        return;
      }

      // Already AAL2? Go to next
      if (data.currentLevel === "aal2") {
        router.replace(nextPath);
        return;
      }

      // Needs upgrade to AAL2 → show prompt
      if (data.nextLevel === "aal2") {
        setNeedsMfa(true);

        // Find a verified TOTP factor
        const factors = await supabase.auth.mfa.listFactors();
        if (factors.error) {
          setErrorMsg(factors.error.message);
          setReady(true);
          return;
        }
        const totp = factors.data.totp.find((f) => f.status === "verified");
        if (!totp) {
          setErrorMsg("No verified TOTP factor found. Enable 2FA in settings first.");
          setReady(true);
          return;
        }
        setFactorId(totp.id);
        setReady(true);
        return;
      }

      // AAL2 not required; continue
      router.replace(nextPath);
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, router, nextPath]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setBusy(true);
    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error) throw new Error(challenge.error.message);

      const verify = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.data.id,
        code: code.trim(),
      });
      if (verify.error) throw new Error(verify.error.message);

      router.replace(nextPath);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Verification failed. Please try again.";
      setErrorMsg(msg);
    } finally {
      setBusy(false);
    }
  };

  if (!ready) {
    return <div className="p-6 text-sm text-muted-foreground">Checking your session…</div>;
  }

  if (!needsMfa) {
    return null; // will have redirected already
  }

  return (
    <div className="max-w-sm mx-auto p-6 bg-white border rounded-lg shadow-sm">
      <h1 className="text-xl font-semibold mb-2">Two-Factor Verification</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Enter the 6-digit code from your authenticator app to continue.
      </p>

      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="code">Authentication code</Label>
          <Input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={10}
          />
        </div>

        {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}

        <Button type="submit" disabled={busy || code.trim().length < 6}>
          {busy ? "Verifying…" : "Verify"}
        </Button>
      </form>
    </div>
  );
}
