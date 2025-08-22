"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
//import Image from "next/image";

export default function EnableTotp() {
  const supabase = createClient();

  const [factorId, setFactorId] = useState<string>("");
  const [qrSvg, setQrSvg] = useState<string>("");
  const [code, setCode] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>("");
  const [has2FA, setHas2FA] = useState<boolean>(false);

 // ✅ Updated enrollment: always provide a non-empty friendlyName, and retry once if name conflict occurs
const startEnrollment = async () => {
  // Give each attempt a unique friendly name to avoid collisions
  const friendlyName = `totp-${Date.now()}`;

  const tryEnroll = async () =>
    supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName, // avoid empty-string collision
    });

  // First attempt
  let { data, error: enrollError } = await tryEnroll();

  if (enrollError?.message?.includes("already exists")) {
    const factors = await supabase.auth.mfa.listFactors();
    if (!factors.error) {
      const pending = factors.data.totp.find((f) => f.status === "unverified");
      if (pending) {
        await supabase.auth.mfa.unenroll({ factorId: pending.id });
        ({ data, error: enrollError } = await tryEnroll());
      }
    }
  }

  if (enrollError) {
    setError(enrollError.message);
    return;
  }

  if(data){
     setFactorId(data.id);
  // If your API returns raw SVG markup, convert to data URL. If it's already a data URL, just set it.
  const qr = data.totp.qr_code;
  setQrSvg(qr.startsWith("<svg") ? `data:image/svg+xml;utf8,${encodeURIComponent(qr)}` : qr);

  }

 
};
  // On mount: detect if user already has a verified TOTP. If yes, show "Disable".
  // If not, begin enrollment to get the QR.
useEffect(() => {
  let cancelled = false;
  (async () => {
    const factors = await supabase.auth.mfa.listFactors();
    if (cancelled) return;

    if (factors.error) {
      setError(factors.error.message);
      return;
    }

    const verifiedTotp = factors.data.totp.find((f) => f.status === "verified");
    if (verifiedTotp) {
      // Already enabled → no QR
      setHas2FA(true);
      setFactorId(verifiedTotp.id);
      setQrSvg("");
      return;
    }

    // If an unverified TOTP exists, remove it so we can re-enroll and get a fresh QR
    const pendingTotp = factors.data.totp.find((f) => f.status === "unverified");
    if (pendingTotp) {
      const unenroll = await supabase.auth.mfa.unenroll({ factorId: pendingTotp.id });
      if (unenroll.error) {
        setError(unenroll.error.message);
        return;
      }
    }

    setHas2FA(false);
    await startEnrollment(); // will set factorId + qrSvg
  })();

  return () => {
    cancelled = true;
  };
}, [supabase]);

  const onVerify = async () => {
    setError("");
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

      // Reflect in your profile table for UI purposes (optional)
      await fetch("/api/profile/twofa", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ two_factor_enabled: true }),
      });

      setHas2FA(true);
      setQrSvg("");
      setCode("");
      alert("2FA enabled!");
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Failed to enable 2FA. Please try again.";
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const onDisable = async () => {
    setError("");
    setBusy(true);
    try {
      // Re-list to get the current verified factor ID (safer)
      const factors = await supabase.auth.mfa.listFactors();
      if (factors.error) throw new Error(factors.error.message);

      const verifiedTotp = factors.data.totp.find((f) => f.status === "verified");
      if (!verifiedTotp) {
        setError("No verified 2FA factor found to disable.");
        return;
      }

      const unenroll = await supabase.auth.mfa.unenroll({ factorId: verifiedTotp.id });
      if (unenroll.error) throw new Error(unenroll.error.message);

      // Reflect in your profile table (optional)
      await fetch("/api/profile/twofa", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ two_factor_enabled: false }),
      });

      setHas2FA(false);
      setCode("");
      // Prepare a fresh enrollment QR in case user wants to re-enable
      await startEnrollment();
      alert("2FA disabled.");
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Failed to disable 2FA. Please try again.";
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md space-y-4">
      {!has2FA ? (
        <>
          <div>
            <Label>Scan this QR in your Authenticator app</Label>
            {qrSvg ? (
              <img
                alt="TOTP QR"
                src={qrSvg}
                className="mt-2 border rounded-md"
              />
            ) : (
              <div className="text-sm text-muted-foreground mt-2">Generating QR…</div>
            )}
          </div>

          <div>
            <Label htmlFor="totp">Enter the 6-digit code</Label>
            <Input
              id="totp"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
          </div>

          <Button onClick={onVerify} disabled={busy || !factorId || code.length < 6}>
            {busy ? "Enabling…" : "Enable 2FA"}
          </Button>
        </>
      ) : (
        <>
          <div className="space-y-2">
            <Label>Two-factor authentication is currently <span className="font-semibold">Enabled</span>.</Label>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
          <Button variant="destructive" onClick={onDisable} disabled={busy}>
            {busy ? "Disabling…" : "Disable 2FA"}
          </Button>
        </>
      )}
    </div>
  );
}
