"use client";

// Profile settings — grouped cards on a readable measure. Editable
// identity fields sit apart from read-only contact details and from
// password actions, so it is obvious at a glance what can be changed.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { AlertCircle, KeyRound, Loader2, Lock, Mail, Phone, User } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import api from "@/lib/axios/axios";
import { ChangePasswordDialog } from "@/components/dashboard/profile/change-password-dialog";

// ─── Design tokens (shared with the rest of the dashboard) ─────────
const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const ACCENT = "#0095FF";

const LABEL_CLASS = `${MONO} text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/60`;
const HINT_CLASS = `${MONO} text-[11px] leading-relaxed text-white/45`;
const INPUT_CLASS =
  "h-11 rounded-[6px] border-white/[0.08] bg-[#0d0e11] pl-10 text-[13.5px] text-white placeholder:text-white/30 hover:border-white/15 focus-visible:border-[#0095FF]/50 focus-visible:ring-[3px] focus-visible:ring-[#0095FF]/10";
const READONLY_INPUT_CLASS = `${INPUT_CLASS} cursor-not-allowed bg-[#0a0b0e] text-white/55`;

interface UserProfile {
  email: string;
  phone: string;
  userName: string;
  displayName: string;
}

const EMPTY_PROFILE: UserProfile = {
  email: "",
  phone: "",
  userName: "",
  displayName: "",
};

const ProfileSettings: React.FC = () => {
  const router = useRouter();

  const [profile, setProfile] = useState<UserProfile>(EMPTY_PROFILE);
  // Baseline from the server — lets the page tell saved values from edits.
  const [savedProfile, setSavedProfile] = useState<UserProfile>(EMPTY_PROFILE);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [saving, setSaving] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);

  const loadProfile = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await api.get("/auth/profile/read");
      if (res.status !== 200) throw new Error("Failed to load profile");
      const data = (res?.data ?? {}) as Partial<UserProfile>;
      const next: UserProfile = {
        email: data.email ?? "",
        phone: data.phone ?? "",
        userName: data.userName ?? "",
        displayName: data.displayName ?? "",
      };
      setProfile(next);
      setSavedProfile(next);
      setStatus("ready");
    } catch (err) {
      console.error("Failed to fetch profile:", err);
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const { name, value } = e.target;
    setProfile((prev) => ({ ...prev, [name]: value }));
  };

  // Display name is always writable. Username is writable only until it has
  // one — the update endpoint ignores email, and phone changes need an SMS
  // provider that is not connected.
  const usernameLocked = Boolean(savedProfile.userName?.trim());

  const isDirty = useMemo(
    () =>
      profile.displayName !== savedProfile.displayName ||
      profile.userName !== savedProfile.userName,
    [profile, savedProfile]
  );

  const handleUpdate = async (): Promise<void> => {
    if (!isDirty || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/auth/profile/update", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: profile.displayName,
          userName: profile.userName,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(payload.error || "Failed to update profile");

      setSavedProfile(profile);
      toast.success("Profile updated");
    } catch (err) {
      console.error("Update error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to update profile.");
    } finally {
      setSaving(false);
    }
  };

  const handleResetPasswordByEmail = async () => {
    try {
      await fetch("/api/auth/signout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      router.push(`/reset-password?email=${encodeURIComponent(profile.email)}`);
    } catch (error) {
      toast.error("Failed to sign out. Please try again.");
      console.error("Sign out error:", error);
    }
  };

  if (status === "loading") {
    return (
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-[188px] animate-pulse rounded-[6px] border border-white/[0.06] bg-[#111216]"
          />
        ))}
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="rounded-[6px] border border-red-500/25 bg-red-500/[0.06] p-5">
        <p className="flex items-center gap-2 text-[13.5px] text-red-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          We could not load your profile.
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void loadProfile()}
          className="mt-4 cursor-pointer border-white/10 bg-white/[0.03] text-white hover:bg-white/[0.08]"
        >
          Try again
        </Button>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-4"
    >
      {/* Identity — the only editable fields on this page */}
      <Card title="Identity" description="How your account is named across the dashboard.">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field
            id="displayName"
            label="Display name"
            hint="Shown on tickets, comments, and activity."
            icon={User}
          >
            <Input
              id="displayName"
              type="text"
              name="displayName"
              value={profile.displayName}
              onChange={handleChange}
              placeholder="Your name"
              className={INPUT_CLASS}
            />
          </Field>

          {/*
            Set once, then fixed — the same treatment as email and phone. It is
            how other people address this account, so changing it silently
            re-points every reference anyone else holds.

            Keyed off savedProfile, not profile, so the field does not lock
            itself mid-typing while someone is choosing their first one. The
            update route enforces the same rule; a read-only input is a
            courtesy, not the guarantee.
          */}
          <Field
            id="userName"
            label="Username"
            hint={
              usernameLocked
                ? "Set once. Contact support if it needs to change."
                : "Your unique handle. Choose carefully — this cannot be changed later."
            }
            icon={User}
            locked={usernameLocked}
          >
            <Input
              id="userName"
              type="text"
              name="userName"
              value={profile.userName}
              onChange={handleChange}
              readOnly={usernameLocked}
              aria-readonly={usernameLocked}
              placeholder="username"
              className={usernameLocked ? READONLY_INPUT_CLASS : INPUT_CLASS}
            />
          </Field>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-white/[0.06] pt-4">
          {isDirty && (
            <span className={`${MONO} text-[10.5px] uppercase tracking-[0.14em] text-white/45`}>
              Unsaved changes
            </span>
          )}
          <Button
            onClick={handleUpdate}
            disabled={!isDirty || saving}
            size="sm"
            className={`${MONO} h-10 cursor-pointer rounded-[5px] px-5 text-[11px] uppercase tracking-[0.14em] font-semibold text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:bg-none disabled:bg-[#1a1d24] disabled:text-white/35 disabled:shadow-none`}
            style={
              !isDirty || saving
                ? undefined
                : {
                    background: `linear-gradient(135deg, ${ACCENT}, #0066B3)`,
                    boxShadow:
                      "0 8px 20px rgba(0,149,255,0.20), inset 0 1px 0 rgba(255,255,255,0.15)",
                  }
            }
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                Saving
              </>
            ) : (
              "Save changes"
            )}
          </Button>
        </div>
      </Card>

      {/* Contact — read-only, because nothing here can be changed from this page */}
      <Card
        title="Contact"
        description="Verified contact details tied to your login. These cannot be edited here."
      >
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field
            id="email"
            label="Email"
            hint="Contact support to change your sign-in email."
            icon={Mail}
            locked
          >
            <Input
              id="email"
              type="email"
              name="email"
              value={profile.email}
              readOnly
              aria-readonly="true"
              className={READONLY_INPUT_CLASS}
            />
          </Field>

          <Field
            id="phone"
            label="Phone"
            hint="Phone updates are unavailable until SMS delivery is connected."
            icon={Phone}
            locked
          >
            <Input
              id="phone"
              type="tel"
              name="phone"
              value={profile.phone}
              placeholder="Not set"
              readOnly
              aria-readonly="true"
              className={READONLY_INPUT_CLASS}
            />
          </Field>
        </div>
      </Card>

      {/* Password */}
      <Card title="Password" description="Change your password, or send yourself a reset link.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ActionRow
            icon={KeyRound}
            label="Change password"
            description="Enter your current password and set a new one."
            actionLabel="Change"
            onClick={() => setPasswordDialogOpen(true)}
          />
          <ActionRow
            icon={Mail}
            label="Reset by email"
            description="Signs you out and emails a reset link."
            actionLabel="Send link"
            onClick={handleResetPasswordByEmail}
          />
        </div>
      </Card>

      <ChangePasswordDialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen} />
    </motion.div>
  );
};

// ─── Subcomponents ────────────────────────────────────────────────

function Card({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[6px] border border-white/[0.06] bg-[#111216] p-5 sm:p-6">
      <header className="mb-5">
        <h3 className="text-[15px] font-semibold tracking-[-0.005em] text-white">{title}</h3>
        <p className={`${HINT_CLASS} mt-1`}>{description}</p>
      </header>
      {children}
    </section>
  );
}

function Field({
  id,
  label,
  hint,
  icon: Icon,
  locked,
  children,
}: {
  id: string;
  label: string;
  hint: string;
  icon: React.ElementType;
  locked?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <Label htmlFor={id} className={`${LABEL_CLASS} mb-2 flex items-center gap-1.5`}>
        {label}
        {locked && <Lock className="h-3 w-3 text-white/30" />}
      </Label>
      <div className="relative">
        {children}
        <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
      </div>
      <p className={`${HINT_CLASS} mt-2`}>{hint}</p>
    </div>
  );
}

function ActionRow({
  icon: Icon,
  label,
  description,
  actionLabel,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  description: string;
  actionLabel: string;
  onClick: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[6px] border border-white/[0.06] bg-[#0d0e11] px-4 py-3.5">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] border border-white/[0.08] bg-[#111216]"
          style={{ color: ACCENT }}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-white">{label}</p>
          <p className={`${HINT_CLASS} truncate`}>{description}</p>
        </div>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={onClick}
        className={`${MONO} h-9 shrink-0 cursor-pointer rounded-[5px] border-white/[0.1] bg-white/[0.03] px-3.5 text-[10.5px] uppercase tracking-[0.12em] text-white hover:bg-white/[0.08]`}
      >
        {actionLabel}
      </Button>
    </div>
  );
}

export default ProfileSettings;
