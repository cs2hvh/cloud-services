"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import api from "@/lib/axios/axios";
import { toast } from "sonner";

interface ChangePasswordForm {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function ChangePasswordDialog({ open, onOpenChange, onSuccess }: ChangePasswordDialogProps) {
  const [passwordForm, setPasswordForm] = useState<ChangePasswordForm>({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [passwordLoading, setPasswordLoading] = useState(false);

  const handlePasswordChange = async (): Promise<void> => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    if (!passwordForm.currentPassword) {
      toast.error("Current password is required");
      return;
    }

    setPasswordLoading(true);
    try {
      // Use the new dedicated change-password endpoint
      const res = await api.put("/auth/profile/change-password", {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });

      if (res.status === 200) {
        toast.success("Password changed successfully!");
        onOpenChange(false);
        setPasswordForm({
          currentPassword: "",
          newPassword: "",
          confirmPassword: "",
        });
        onSuccess?.();
      }
    } catch (err: any) {
      console.error("Password change error:", err);
      const message = err.response?.data?.message || "Failed to change password";
      toast.error(message);
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-black/95 border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="text-white">Change Password</DialogTitle>
          <DialogDescription className="text-gray-400">
            Enter your current password and new password. Make sure it&apos;s at least 6 characters long.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="currentPassword" className="text-white">Current Password</Label>
            <PasswordInput
              field={{
                value: passwordForm.currentPassword,
                onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                  setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))
              }}
              placeholder="Enter current password"
              disabled={passwordLoading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="newPassword" className="text-white">New Password</Label>
            <PasswordInput
              field={{
                value: passwordForm.newPassword,
                onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                  setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))
              }}
              placeholder="Enter new password"
              disabled={passwordLoading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="text-white">Confirm Password</Label>
            <PasswordInput
              field={{
                value: passwordForm.confirmPassword,
                onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                  setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))
              }}
              placeholder="Confirm new password"
              disabled={passwordLoading}
            />
          </div>
          <Button
            onClick={handlePasswordChange}
            disabled={passwordLoading}
            className="w-full"
          >
            {passwordLoading ? "Changing..." : "Change Password"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}