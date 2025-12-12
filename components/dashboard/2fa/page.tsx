"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
      // Updated class to match dashboard spacing pattern
      <div className="space-y-4">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-sm text-muted-foreground"
        >
          Loading 2FA settings...
        </motion.div>
      </div>
    );
  }

  return (
    // Updated class to remove max-width constraint to match dashboard spacing
    <div className="space-y-4">
      {!has2FA ? (
        !showSetup ? (
          // Show enable button when 2FA is not set up
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <p className="text-sm text-muted-foreground mb-4">
              Two-factor authentication adds an extra layer of security to your account by requiring more than just a password to sign in.
            </p>
            <Button onClick={startEnrollment}>
              Enable Two-Factor Authentication
            </Button>
          </motion.div>
        ) : (
          // Show setup flow when user has clicked enable
          <>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <Label>Scan this QR in your Authenticator app</Label>
              {qrSvg ? (
                <motion.img
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2 }}
                  alt="TOTP QR Code"
                  src={qrSvg}
                  className="mt-2 border rounded-md w-48 h-48 object-contain bg-white"
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
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="text-sm text-muted-foreground mt-2"
                >
                  Generating QR…
                </motion.div>
              )}
              {totpSecret && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="mt-2"
                >
                  <Label className="text-xs">Secret Key (for manual entry):</Label>
                  <div className="text-xs font-mono bg-black/20 p-2 rounded mt-1 break-all">
                    {totpSecret}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Enter this key manually in your authenticator app if you
                    can&apos;t scan the QR code.
                  </p>
                </motion.div>
              )}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <Label htmlFor="totp">Enter the 6-digit code</Label>
              <Input
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
              />
              <p className="text-xs text-muted-foreground mt-1">
                Make sure your device&apos;s clock is synchronized for the code to
                work properly.
              </p>
              {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <Button
                onClick={onVerify}
                disabled={busy || !factorId || code.length < 6}
              >
                {busy ? "Enabling…" : "Enable 2FA"}
              </Button>
            </motion.div>
          </>
        )
      ) : (
        <>
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-2"
          >
            <Label>
              Two-factor authentication is currently{" "}
              <span className="font-semibold">Enabled</span>.
            </Label>
            <p className="text-sm text-muted-foreground">
              You&apos;ll be asked for a code each time you sign in.
            </p>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Button
              variant="destructive"
              onClick={() => setShowDisableConfirmDialog(true)}
              disabled={busy}
            >
              {busy ? "Disabling…" : "Disable 2FA"}
            </Button>
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