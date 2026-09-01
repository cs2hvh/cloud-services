"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
// Button is still used inside the modal dialogs below, which stay on shadcn.
// Input and Label are gone — the inline form now uses the dashboard's own
// field styling rather than a second, differently-shaped one.
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  enrollMFA,
  verifyMFA,
  unenrollMFA,
  getMFAStatus,
  update2FAStatus,
} from "@/lib/api/mfa";

/* ------------------------------------------------------------------ */
/*  Design tokens                                                      */
/*                                                                     */
/*  This tab was built against the shadcn primitives (Button, Label,   */
/*  text-muted-foreground) while the settings shell around it, billing */
/*  and the service pages all use the dashboard's own tokens. The two  */
/*  do not agree on surface colour, corner radius, type scale or       */
/*  button weight, so Security read as a page from a different app     */
/*  bolted into the tab strip.                                         */
/*                                                                     */
/*  The modal dialogs below are deliberately left on shadcn: they are  */
/*  overlays with their own consistent treatment, and restyling them   */
/*  risks their focus and dismissal behaviour for a surface the user   */
/*  sees for two seconds.                                              */
/* ------------------------------------------------------------------ */

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const ACCENT = "#0095FF";
const CARD = "border border-white/[0.06] bg-[#111216] rounded-[6px]";

const PRIMARY_BTN = `${MONO} inline-flex h-10 items-center justify-center gap-2 rounded-[5px] px-4 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed`;
const PRIMARY_STYLE: React.CSSProperties = {
  background: `linear-gradient(135deg, ${ACCENT}, #0066B3)`,
  boxShadow:
    "0 8px 20px rgba(0,149,255,0.18), inset 0 1px 0 rgba(255,255,255,0.15)",
};
const DANGER_BTN = `${MONO} inline-flex h-10 items-center justify-center gap-2 rounded-[5px] border border-red-500/25 bg-red-500/[0.06] px-4 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-red-300 transition-colors hover:bg-red-500/[0.14] hover:text-red-200 disabled:opacity-50 disabled:cursor-not-allowed`;
const FIELD_LABEL = `${MONO} block text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-2`;

export default function EnableTotp() {
  const [factorId, setFactorId] = useState<string>("");
  const [qrSvg, setQrSvg] = useState<string>("");
  const [totpSecret, setTotpSecret] = useState<string>("");
  const [code, setCode] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [has2FA, setHas2FA] = useState<boolean>(false);
  const [showSetup, setShowSetup] = useState<boolean>(false);

  // Dialog states
  const [showEnableSuccessDialog, setShowEnableSuccessDialog] = useState(false);
  const [showDisableConfirmDialog, setShowDisableConfirmDialog] = useState(false);
  const [showDisableSuccessDialog, setShowDisableSuccessDialog] = useState(false);

  // Check MFA status on mount
  useEffect(() => {
    let cancelled = false;

    const checkStatus = async () => {
      try {
        const status = await getMFAStatus();

        if (cancelled) return;

        if (status.hasVerifiedFactor) {
          // User already has 2FA enabled
          setHas2FA(true);
          setFactorId(status.factorId || "");
          setQrSvg("");
        } else {
          // User doesn't have 2FA enabled
          setHas2FA(false);
          // Don't automatically start enrollment, wait for user action
        }
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "Failed to check 2FA status";
        setError(message);
        toast.error(message);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    checkStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  const startEnrollment = async () => {
    try {
      setLoading(true);
      const result = await enrollMFA();

      setFactorId(result.factorId);
      setQrSvg(result.qrCode);
      setTotpSecret(result.secret);
      setShowSetup(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to start enrollment";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const onVerify = async () => {
    setError("");
    setBusy(true);

    try {
      // Verify the TOTP code
      await verifyMFA(factorId, code.trim());

      // Update user profile
      await update2FAStatus(true);

      setHas2FA(true);
      setQrSvg("");
      setCode("");
      setShowSetup(false);
      setShowEnableSuccessDialog(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to enable 2FA";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const onDisable = async () => {
    setError("");
    setBusy(true);

    try {
      // Unenroll the factor
      await unenrollMFA();

      // Update user profile
      await update2FAStatus(false);

      setHas2FA(false);
      setCode("");
      setShowSetup(false);

      setShowDisableConfirmDialog(false);
      setShowDisableSuccessDialog(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to disable 2FA";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className={`${CARD} max-w-[720px] px-5 py-10 text-center`}>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={`${MONO} text-[11px] text-white/45`}
        >
          Loading 2FA settings...
        </motion.p>
      </div>
    );
  }

  return (
    // Capped: this is a single column of prose, a QR and a six-digit field.
    // The PAGE runs edge to edge; a 6-character input has no business being
    // 1,800px from its own label.
    <div className="max-w-[720px] space-y-4">
      {!has2FA ? (
        !showSetup ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`${CARD} p-5`}
          >
            <div className="flex items-center gap-2.5 mb-3">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-white/25" />
              <span className={`${MONO} text-[10px] uppercase tracking-[0.12em] text-white/40`}>
                Not enabled
              </span>
            </div>
            <p className={`${MONO} text-[11px] leading-relaxed text-white/45 mb-5`}>
              Two-factor authentication adds an extra layer of security to your
              account by requiring more than just a password to sign in.
            </p>
            <button type="button" onClick={startEnrollment} className={PRIMARY_BTN} style={PRIMARY_STYLE}>
              Enable Two-Factor Authentication
            </button>
          </motion.div>
        ) : (
          // Show setup flow when user has clicked enable
          <>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className={`${CARD} p-5`}
            >
              <span className={FIELD_LABEL}>
                Scan this QR in your Authenticator app
              </span>
              {qrSvg ? (
                <motion.img
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2 }}
                  alt="TOTP QR Code"
                  src={qrSvg}
                  // White plate is deliberate — a QR needs light quiet zones to
                  // scan, so it cannot inherit the dark surface.
                  className="h-48 w-48 rounded-[6px] border border-white/[0.08] bg-white object-contain p-2"
                  onError={() => {
                    console.error("QR Code failed to load:", qrSvg);
                    setError(
                      "Failed to load QR code. Please use manual entry instead."
                    );
                    toast.error(
                      "Failed to load QR code. Please use manual entry instead."
                    );
                  }}
                />
              ) : (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className={`${MONO} text-[11px] text-white/45`}
                >
                  Generating QR…
                </motion.p>
              )}
              {totpSecret && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="mt-5"
                >
                  <span className={FIELD_LABEL}>Secret Key (for manual entry):</span>
                  <div
                    className={`${MONO} break-all rounded-[5px] border border-white/[0.08] bg-[#0d0e11] px-3 py-2.5 text-[11px] text-white/80`}
                  >
                    {totpSecret}
                  </div>
                  <p className={`${MONO} mt-2 text-[10.5px] leading-relaxed text-white/40`}>
                    Use this if your device can&apos;t scan the code.
                  </p>
                </motion.div>
              )}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className={`${CARD} p-5`}
            >
              <label htmlFor="totp" className={FIELD_LABEL}>
                Enter the 6-digit code
              </label>
              <input
                id="totp"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                value={code}
                onChange={(e) => {
                  // Only allow digits, max 6 characters
                  const value = e.target.value.replace(/\D/g, "").slice(0, 6);
                  setCode(value);
                }}
                maxLength={6}
                className={`${MONO} h-11 w-full max-w-[220px] rounded-[5px] border border-white/[0.08] bg-[#0d0e11] px-3.5 text-[16px] tracking-[0.28em] text-white outline-none transition-colors placeholder:tracking-[0.28em] placeholder:text-white/25 focus:border-[#0095FF]/50`}
              />
              <p className={`${MONO} mt-2.5 text-[10.5px] leading-relaxed text-white/40`}>
                Codes rotate every 30 seconds. If yours is rejected, check your
                device&apos;s clock is set automatically.
              </p>
              {error && (
                <p className={`${MONO} mt-3 inline-flex items-start gap-1.5 text-[10.5px] leading-relaxed text-red-300/90`}>
                  <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
                  {error}
                </p>
              )}

              <div className="mt-5">
                <button
                  type="button"
                  onClick={onVerify}
                  disabled={busy || !factorId || code.length < 6}
                  className={PRIMARY_BTN}
                  style={PRIMARY_STYLE}
                >
                  {busy ? "Enabling…" : "Enable 2FA"}
                </button>
              </div>
            </motion.div>
          </>
        )
      ) : (
        <>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`${CARD} p-5`}
          >
            <div className="flex items-center gap-2.5 mb-3">
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400"
                style={{ boxShadow: "0 0 6px #34d399" }}
              />
              <span className={`${MONO} text-[10px] uppercase tracking-[0.12em] text-emerald-300/90`}>
                Enabled
              </span>
            </div>
            <p className={`${MONO} text-[11px] leading-relaxed text-white/45`}>
              You&apos;ll be asked for a code each time you sign in.
            </p>
            {error && (
              <p className={`${MONO} mt-3 inline-flex items-start gap-1.5 text-[10.5px] leading-relaxed text-red-300/90`}>
                <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
                {error}
              </p>
            )}
            <div className="mt-5">
              <button
                type="button"
                onClick={() => setShowDisableConfirmDialog(true)}
                disabled={busy}
                className={DANGER_BTN}
              >
                {busy ? "Disabling…" : "Disable 2FA"}
              </button>
            </div>
          </motion.div>
        </>
      )}

      {/* Enable Success Dialog */}
      <Dialog
        open={showEnableSuccessDialog}
        onOpenChange={setShowEnableSuccessDialog}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>2FA Enabled Successfully</DialogTitle>
            <DialogDescription>
              Two-factor authentication has been enabled on your account.
              You&apos;ll now be asked for a code each time you sign in.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setShowEnableSuccessDialog(false)}>
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disable Confirmation Dialog */}
      <AlertDialog
        open={showDisableConfirmDialog}
        onOpenChange={setShowDisableConfirmDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Are you sure you want to disable 2FA?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Disabling two-factor authentication will reduce the security of
              your account. You will no longer be required to enter a code when
              signing in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDisable}
              className="bg-red-600 hover:bg-red-700"
            >
              Disable 2FA
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Disable Success Dialog */}
      <Dialog
        open={showDisableSuccessDialog}
        onOpenChange={setShowDisableSuccessDialog}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>2FA Disabled Successfully</DialogTitle>
            <DialogDescription>
              Two-factor authentication has been disabled on your account. You
              can re-enable it at any time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setShowDisableSuccessDialog(false)}>
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}