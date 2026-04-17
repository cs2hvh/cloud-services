"use client";

import * as React from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { motion } from "framer-motion";

import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Icons } from "@/components/ui/icons";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { forgot_password_schema, reset_password_schema } from "@/types/zod/auth";
import api from "@/lib/axios/axios";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import glass from "@/components/auth/glass-controls.module.css";

type ForgotPasswordInput = z.infer<typeof forgot_password_schema>;
type ResetPasswordInput = z.infer<typeof reset_password_schema>;

const authCardClassName =
  "mx-auto mt-3 sm:mt-0 w-full max-w-[520px] rounded-[5px] border border-white/20 bg-[#161619]/95 px-4 py-4 shadow-[0_20px_80px_rgba(0,0,0,0.5)] backdrop-blur-[20px] sm:px-8 sm:py-6";
const inputShellClass = `${glass.glassControl} ${glass.inputShell}`;
const buttonShellClass = `${glass.glassControl} ${glass.buttonShell}`;

// Countdown timer component
function CountdownTimer({ expiresAt }: { expiresAt: string }) {
  const [timeLeft, setTimeLeft] = React.useState<string>("");

  React.useEffect(() => {
    const expirationTime = new Date(expiresAt).getTime();

    const calculateTimeLeft = () => {
      const now = new Date().getTime();
      const difference = expirationTime - now;

      if (difference <= 0) {
        return "Expired";
      }

      const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((difference % (1000 * 60)) / 1000);

      return `${minutes}:${seconds < 10 ? `0${seconds}` : seconds}`;
    };

    // Update immediately
    setTimeLeft(calculateTimeLeft());

    // Update every second
    const timer = setInterval(() => {
      const timeRemaining = calculateTimeLeft();
      setTimeLeft(timeRemaining);
      
      if (timeRemaining === "Expired") {
        clearInterval(timer);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [expiresAt]);

  if (timeLeft === "Expired") {
    return (
      <div className="text-center py-2">
        <p className="text-sm text-red-400">OTP has expired. Please request a new code.</p>
      </div>
    );
  }

  return (
    <div className="text-center py-2">
      <p className="text-sm text-gray-400">
        Code expires in: <span className="font-mono text-yellow-400">{timeLeft}</span>
      </p>
    </div>
  );
}

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = React.useState(false);
  const [step, setStep] = React.useState<"email" | "reset">("email");
  const [emailSentTo, setEmailSentTo] = React.useState("");
  const [otpExpiresAt, setOtpExpiresAt] = React.useState<string | null>(null);

  // Pre-fill email from query params if available
  const emailFromQuery = searchParams.get("email") || "";

  const forgotForm = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgot_password_schema),
    defaultValues: { email: emailFromQuery },
  });

  const resetForm = useForm<ResetPasswordInput>({
    resolver: zodResolver(reset_password_schema),
    defaultValues: {
      email: emailFromQuery,
      otp: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  // Set the email in reset form when it changes in forgot form
  const forgotEmail = forgotForm.watch("email");
  React.useEffect(() => {
    resetForm.setValue("email", forgotEmail);
  }, [forgotEmail, resetForm]);

  async function onForgotSubmit(values: ForgotPasswordInput) {
    setIsLoading(true);
    try {
      const response = await api.post("/auth/forgot-password", values);

      if (response.status === 200) {
        toast.success("Password reset code sent! Check your email.");
        setEmailSentTo(values.email);
        resetForm.setValue("email", values.email);
        setStep("reset");
        // Set expiration time if provided
        if (response?.data?.expiresAt) {
          setOtpExpiresAt(response?.data?.expiresAt ?? null);
        }
      }
    } catch (error: unknown) {
      const message = (error as { response?: { data?: { message?: string } } }).response?.data?.message || "Failed to send reset code. Please try again.";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }

  async function onResetSubmit(values: ResetPasswordInput) {
    setIsLoading(true);
    try {
      const response = await api.post("/auth/reset-password", values);

      if (response.status === 200) {
        toast.success("Password reset successfully! You can now sign in.");
        router.push("/signin");
      }
    } catch (error: unknown) {
      const message = (error as { response?: { data?: { message?: string } } }).response?.data?.message || "Failed to reset password. Please try again.";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }

  const resendCode = async () => {
    if (emailSentTo) {
      setIsLoading(true);
      try {
        const response = await api.post("/auth/forgot-password", { email: emailSentTo });
        if (response.status === 200) {
          toast.success("New reset code sent! Check your email.");
          // Update expiration time if provided
          if (response?.data?.expiresAt) {
            setOtpExpiresAt(response?.data?.expiresAt ?? null);
          }
        }
      } catch (error: unknown) {
        const message = (error as { response?: { data?: { message?: string } } }).response?.data?.message || "Failed to resend code. Please try again.";
        toast.error(message);
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <div className="relative min-h-svh w-full overflow-hidden bg-[#04060b] antialiased">
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/signin-signup-bg.png')" }}
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.18)_0%,rgba(0,0,0,0.52)_65%,rgba(0,0,0,0.82)_100%)]" />

      {/* Content */}
      <div className="relative z-10 flex min-h-svh items-center justify-center px-4 py-8 sm:px-6 sm:py-10">
          <div className={authCardClassName}>
          <div className="mx-auto mb-2 text-center">
            <h1 style={{ fontFamily: "'Sansation', system-ui, sans-serif" }} className="text-[24px] leading-[27px] font-bold text-white">Ahura<span className="text-[#2f8af5]">Sense</span></h1>
            <p className="mt-3 text-[14px] leading-[16px] text-white">
              <span style={{ fontFamily: "'Sansation', system-ui, sans-serif" }} className="block text-[14px] leading-[18px] font-normal">Sign in to Ahura<span className="text-[#2f8af5]">Sense</span> Cloud</span>
              <span className="block  text-[14px] leading-[16px] text-white/90">{step === "email" ? "Reset Your Password" : "Verify & Reset"}</span>
            </p>
            <p className="mt-3 text-[14px] leading-[16px] text-white/90">
              {step === "email"
                ? "Enter your email to receive a reset code."
                : "Enter the code and choose a new password."}
            </p>
          </div>

          <div className="mx-auto mt-5 w-full max-w-[320px] space-y-4">
            {step === "email" ? (
              <Form {...forgotForm}>
                <form onSubmit={forgotForm.handleSubmit(onForgotSubmit)} className="space-y-4">
                  <FormField
                    control={forgotForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-normal text-white">Email</FormLabel>
                        <FormControl>
                          <div className={inputShellClass}>
                            <Input
                              {...field}
                              type="email"
                              placeholder=""
                              disabled={isLoading}
                              className={glass.field}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className={`w-full ${buttonShellClass}`}>
                    <button
                      type="submit"
                      disabled={isLoading}
                      className={glass.button}
                    >
                      {isLoading ? "Sending code..." : "Send Reset Code"}
                    </button>
                  </div>
                </form>
              </Form>
            ) : (
              <Form {...resetForm}>
                <form onSubmit={resetForm.handleSubmit(onResetSubmit)} className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-base font-normal text-white">Email</Label>
                    <div className={inputShellClass}>
                      <Input
                        value={resetForm.watch("email")}
                        type="email"
                        disabled
                        className={glass.field}
                      />
                    </div>
                    <p className="text-xs text-white/70">
                      Code sent to this email address.
                    </p>
                  </div>

                      {otpExpiresAt && (
                        <CountdownTimer expiresAt={otpExpiresAt} />
                      )}

                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <FormField
                      control={resetForm.control}
                      name="otp"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-base font-normal text-white">Reset Code</FormLabel>
                          <FormControl>
                            <div className="flex justify-center">
                              <InputOTP maxLength={6} {...field} disabled={isLoading}>
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
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.1 }}
                  >
                    <FormField
                      control={resetForm.control}
                      name="newPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-base font-normal text-white">New Password</FormLabel>
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
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.2 }}
                  >
                    <FormField
                      control={resetForm.control}
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
                  </motion.div>

                  <div className={`w-full ${buttonShellClass}`}>
                    <button
                      type="submit"
                      disabled={isLoading}
                      className={glass.button}
                    >
                      {isLoading ? "Resetting password..." : "Reset Password"}
                    </button>
                  </div>
                </form>
              </Form>
            )}
          </div>

          <div className="mt-4 text-center">
            {step === "reset" ? (
              <div className="flex items-center justify-center gap-2 text-sm">
                <button
                  onClick={resendCode}
                  disabled={isLoading}
                  className="text-[#00a2ff] hover:text-[#53beff] transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Resend code
                </button>
                <span className="text-white/60">•</span>
                <button
                  onClick={() => setStep("email")}
                  className="text-[#00a2ff] hover:text-[#53beff] transition-colors cursor-pointer"
                >
                  Use different email
                </button>
              </div>
            ) : null}
            <p className="mt-2 text-sm text-white">
              Remember your password?{" "}
              <Link href="/signin" className="text-[#00a2ff] hover:text-[#53beff] cursor-pointer">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <React.Suspense
      fallback={
        <div className="relative flex min-h-svh items-center justify-center bg-[#04060b]">
          <div
            className="absolute inset-0 bg-cover bg-center bg-no-repeat"
            style={{ backgroundImage: "url('/signin-signup-bg.png')" }}
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.18)_0%,rgba(0,0,0,0.52)_65%,rgba(0,0,0,0.82)_100%)]" />
          <Icons.spinner className="relative z-10 h-6 w-6 animate-spin text-white" />
        </div>
      }
    >
      <ResetPasswordContent />
    </React.Suspense>
  );
}
