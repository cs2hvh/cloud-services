"use client";

import { assetUrl } from "@/lib/asset-url";
import * as React from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "@/lib/utils";

import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { otp_schema, signup_schema } from "@/types/zod/auth";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import Image from "next/image";
import Link from "next/link";
import { Icons } from "@/components/ui/icons";
import { PasswordInput } from "../ui/password-input";
import api from "@/lib/axios/axios";
import glass from "@/components/auth/glass-controls.module.css";

type SignupFormData = z.infer<typeof signup_schema>;
type OtpFormData = z.infer<typeof otp_schema>;

const entry_schema = z.object({ email: z.string().email() });
type EntryFormData = z.infer<typeof entry_schema>;

const inputShellClass = `${glass.glassControl} ${glass.inputShell}`;

// Premium primary button — accent gradient, soft glow, inset highlight, hover lift.
const PRIMARY_BTN =
  "relative flex h-11 w-full items-center justify-center rounded-[10px] text-[15px] font-semibold text-white transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50";
const PRIMARY_BTN_STYLE: React.CSSProperties = {
  background: "linear-gradient(135deg, #1f9dff, #0061c4)",
  boxShadow:
    "0 12px 34px -10px rgba(0,149,255,0.6), inset 0 1px 0 rgba(255,255,255,0.28)",
};
const onBtnEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
  if (e.currentTarget.disabled) return;
  e.currentTarget.style.filter = "brightness(1.08)";
  e.currentTarget.style.transform = "translateY(-1px)";
};
const onBtnLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
  e.currentTarget.style.filter = "none";
  e.currentTarget.style.transform = "none";
};

export default function SignUpMultiStep({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const [step, setStep] = React.useState<0 | 1 | 2>(0);
  const [isLoading, setIsLoading] = React.useState(false);
  const [pendingEmail, setPendingEmail] = React.useState<string>("");
  const submitLockRef = React.useRef(false);
  const router = useRouter();
  const search = useSearchParams();

  const nextPath = React.useMemo(() => {
    const raw = search.get("next") || "";
    // Reject protocol-relative URLs (//evil.com) to prevent open redirect
    return raw.startsWith("/") && !raw.startsWith("//") ? raw : "";
  }, [search]);

  const entryForm = useForm<EntryFormData>({
    resolver: zodResolver(entry_schema),
    defaultValues: { email: "" },
  });

  const signupForm = useForm<SignupFormData>({
    resolver: zodResolver(signup_schema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const otpForm = useForm<OtpFormData>({
    resolver: zodResolver(otp_schema),
    defaultValues: {
      pin: "",
    },
  });

  async function onSubmitSignup(data: SignupFormData) {
    if (submitLockRef.current) {
      return;
    }
    submitLockRef.current = true;
    setIsLoading(true);
    try {
      const response = await api.post("/auth/onboarding", data);
      if (response.status === 200) {
        toast.success(response?.data?.message);
        setPendingEmail(data.email);
        setStep(2);
      } else {
        toast.error(response?.data?.message);
      }
    } finally {
      setIsLoading(false);
      submitLockRef.current = false;
    }
  }

  async function onSubmitOtp(data: OtpFormData) {
    if (submitLockRef.current) {
      return;
    }
    submitLockRef.current = true;
    setIsLoading(true);
    try {
      const response = await api.post("/auth/onboarding/verify-otp", {
        email: pendingEmail,
        otpCode: data.pin,
      });

      if (response.status === 200) {
        toast.success(response?.data?.message || "Email verified! You can now sign in.");
        router.push(nextPath ? `/signin?next=${encodeURIComponent(nextPath)}` : "/signin");
        // keep isLoading=true — spinner stays until navigation completes
        return;
      }

      setIsLoading(false);
    } catch {
      setIsLoading(false);
      submitLockRef.current = false;
    }
  }

  async function handleEntryContinue(data: EntryFormData) {
    signupForm.setValue("email", data.email, { shouldValidate: true });
    setPendingEmail(data.email);
    setStep(1);
  }

  const handleSignIn = async (type: string) => {
    if (submitLockRef.current) {
      return;
    }
    submitLockRef.current = true;
    setIsLoading(true);
    try {
      const endpointByProvider: Record<string, string> = {
        github: "/auth/signin/github",
        google: "/auth/signin/github",
        gitlab: "/auth/signin/gitlab",
        bitbucket: "/auth/signin/bitbucket",
      };
      const endpoint = endpointByProvider[type];

      if (!endpoint) {
        toast.error("Unsupported sign-up provider");
        setIsLoading(false);
        return;
      }

      const payload =
        endpoint === "/auth/signin/github"
          ? { type, next: nextPath || undefined }
          : { next: nextPath || undefined };
      const response = await api.post(endpoint, payload);
      if (response?.data?.url) {
        window.location.href = response?.data?.url;
        // keep isLoading=true — spinner stays until browser navigates
        return;
      }

      setIsLoading(false);
    } catch {
      setIsLoading(false);
      submitLockRef.current = false;
    }
  };

  return (
    <div
      className={cn(
        "relative mx-auto w-full max-w-[480px] overflow-hidden rounded-[16px] border border-white/[0.08] bg-[#101116]/95 px-7 py-8 shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-[24px] sm:px-9 sm:py-9",
        className,
      )}
      {...props}
    >
      {/* Ambient accent glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-28 left-1/2 h-56 w-[150%] -translate-x-1/2 blur-3xl"
        style={{ background: "radial-gradient(closest-side, rgba(0,149,255,0.18), transparent)" }}
      />
      <div className="relative z-10">
      {/* Branding — always visible */}
      <div className="mx-auto mb-1 text-center pt-2 pb-1">
        <h1 style={{ fontFamily: "'Sansation', system-ui, sans-serif" }} className="text-[24px] leading-[27px] font-bold text-white">Ahura<span className="text-[#2f8af5]">Sense</span></h1>
        <p className="mt-3 text-[14px] leading-[16px] text-white">
          <span style={{ fontFamily: "'Sansation', system-ui, sans-serif" }} className="block text-[14px] leading-[18px] font-normal">Sign up to Ahura<span className="text-[#2f8af5]">Sense</span> Cloud</span>
          <span className="block  text-[14px] leading-[16px] text-white/90">{step === 0
            ? "Welcome! Create an account to continue."
            : step === 1
              ? "Create your account details to continue."
              : "Enter the OTP sent to your email."}
          </span>
        </p>
      </div>

      {/* Loading overlay — replaces form */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-14 gap-5">
          <div className="relative h-12 w-12">
            <div className="absolute inset-0 rounded-full border-2 border-white/10" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#2f8af5] animate-spin" />
          </div>
          <p className="text-sm text-white/50 tracking-wide">
            {step === 2 ? "Verifying…" : "Creating account…"}
          </p>
        </div>
      ) : (
        <>
          {step !== 2 && (
            <>
              <div className="mx-auto mt-4 w-full max-w-[320px] flex items-center justify-between gap-4 sm:gap-6">
                <button type="button" aria-label="Sign up with GitHub" className="flex-1 flex items-center justify-center text-white/95 transition hover:opacity-90 cursor-pointer" onClick={() => handleSignIn("github")} disabled={isLoading}>
                  <Icons.gitHub className="h-8 w-8" />
                </button>
                <button type="button" aria-label="Sign up with GitLab" className="flex-1 flex items-center justify-center transition hover:opacity-90 cursor-pointer" onClick={() => handleSignIn("gitlab")} disabled={isLoading}>
                  <Image src={assetUrl("/gitlab.png")} alt="GitLab" width={32} height={32} className="h-8 w-8" />
                </button>
                <button type="button" aria-label="Sign up with Bitbucket" className="flex-1 flex items-center justify-center transition hover:opacity-90 cursor-pointer" onClick={() => handleSignIn("bitbucket")} disabled={isLoading}>
                  <Image src={assetUrl("/BitBucket.png")} alt="Bitbucket" width={32} height={32} className="h-8 w-8" />
                </button>
                <button type="button" aria-label="Sign up with Google" className="flex-1 flex items-center justify-center text-[#f4f4f5] transition hover:opacity-90 cursor-pointer" onClick={() => handleSignIn("google")} disabled={isLoading}>
                  <Icons.google className="h-8 w-8" />
                </button>
              </div>

              <div className="mx-auto mt-4 w-full max-w-[320px]">
                <div className="flex items-center gap-3 text-white/55">
                  <div className="h-px flex-1 bg-white/15" />
                  <span className="text-xs uppercase tracking-[0.18em]">Or</span>
                  <div className="h-px flex-1 bg-white/15" />
                </div>
              </div>
            </>
          )}

          {step === 0 && (
            <Form {...entryForm}>
              <form
                  onSubmit={entryForm.handleSubmit(handleEntryContinue)}
                  className="mx-auto mt-4 w-full max-w-[320px] space-y-4"
                >
                <FormField
                  control={entryForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-normal text-white">Email</FormLabel>
                      <FormControl>
                        <div className={inputShellClass}>
                          <Input
                            placeholder=""
                            {...field}
                            type="email"
                            disabled={isLoading}
                            className={glass.field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <button
                  type="submit"
                  disabled={isLoading}
                  className={`${PRIMARY_BTN} mt-1`}
                  style={PRIMARY_BTN_STYLE}
                  onMouseEnter={onBtnEnter}
                  onMouseLeave={onBtnLeave}
                >
                  Continue
                </button>
              </form>
            </Form>
          )}

          {step === 1 && (
            <Form {...signupForm}>
              <form
                onSubmit={signupForm.handleSubmit(onSubmitSignup)}
                className="mx-auto mt-4 w-full max-w-[320px] space-y-3"
              >
                <FormField
                  control={signupForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-normal text-white">Username</FormLabel>
                      <FormControl>
                        <div className={inputShellClass}>
                          <Input
                            placeholder=""
                            {...field}
                            type="text"
                            disabled={isLoading}
                            className={glass.field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={signupForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-normal text-white">Email</FormLabel>
                      <FormControl>
                        <div className={inputShellClass}>
                          <Input
                            placeholder=""
                            {...field}
                            type="email"
                            disabled
                            className={glass.field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={signupForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-normal text-white">Password</FormLabel>
                      <FormControl>
                      <PasswordInput
                        field={field}
                        placeholder=""
                        disabled={isLoading}
                        className={glass.field}
                        wrapperClassName={inputShellClass}
                        toggleClassName="h-full pr-3"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                  )}
                />

                <FormField
                  control={signupForm.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-normal text-white">Confirm Password</FormLabel>
                      <FormControl>
                      <PasswordInput
                        field={field}
                        placeholder=""
                        disabled={isLoading}
                        className={glass.field}
                        wrapperClassName={inputShellClass}
                        toggleClassName="h-full pr-3"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                  )}
                />

                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setStep(0)}
                    className="flex h-11 shrink-0 items-center justify-center rounded-[10px] border border-white/[0.12] bg-white/[0.03] px-5 text-[14px] font-medium text-white/80 transition-colors hover:bg-white/[0.07] hover:text-white"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className={`${PRIMARY_BTN} flex-1`}
                    style={PRIMARY_BTN_STYLE}
                    onMouseEnter={onBtnEnter}
                    onMouseLeave={onBtnLeave}
                  >
                    Create Account
                  </button>
                </div>
              </form>
            </Form>
          )}

          {step === 2 && (
            <Form {...otpForm}>
              <form
                onSubmit={otpForm.handleSubmit(onSubmitOtp)}
                className="mx-auto mt-5 max-w-sm space-y-4 text-center"
              >
                <p className="text-sm text-white/85">
                  Verification code sent to {pendingEmail}
                </p>
                <FormField
                  control={otpForm.control}
                  name="pin"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <InputOTP maxLength={6} {...field}>
                          <InputOTPGroup>
                            <InputOTPSlot index={0} />
                            <InputOTPSlot index={1} />
                            <InputOTPSlot index={2} />
                          </InputOTPGroup>
                          <InputOTPSeparator />
                          <InputOTPGroup>
                            <InputOTPSlot index={3} />
                            <InputOTPSlot index={4} />
                            <InputOTPSlot index={5} />
                          </InputOTPGroup>
                        </InputOTP>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <button
                  type="submit"
                  disabled={isLoading}
                  className={PRIMARY_BTN}
                  style={PRIMARY_BTN_STYLE}
                  onMouseEnter={onBtnEnter}
                  onMouseLeave={onBtnLeave}
                >
                  Verify OTP
                </button>
              </form>
            </Form>
          )}

          <p className="mt-4 text-center text-sm text-white">
            {step === 0 ? "Do you already have an account?" : "Already have an account?"}{" "}
            <Link href={nextPath ? `/signin?next=${encodeURIComponent(nextPath)}` : "/signin"} className="text-[#00a2ff] hover:text-[#53beff] cursor-pointer">
              Log In
            </Link>
          </p>
        </>
      )}
      </div>
    </div>
  );
}
