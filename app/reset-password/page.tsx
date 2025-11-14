"use client";

import * as React from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";
import { motion } from "framer-motion";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
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
import { Spotlight } from "@/components/ui/spotlight";
import { cn } from "@/lib/utils";

type ForgotPasswordInput = z.infer<typeof forgot_password_schema>;
type ResetPasswordInput = z.infer<typeof reset_password_schema>;

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

export default function ResetPasswordPage() {
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
        if (response.data.expiresAt) {
          setOtpExpiresAt(response.data.expiresAt);
        }
      }
    } catch (error: any) {
      const message = error.response?.data?.message || "Failed to send reset code. Please try again.";
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
    } catch (error: any) {
      const message = error.response?.data?.message || "Failed to reset password. Please try again.";
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
          if (response.data.expiresAt) {
            setOtpExpiresAt(response.data.expiresAt);
          }
        }
      } catch (error: any) {
        const message = error.response?.data?.message || "Failed to resend code. Please try again.";
        toast.error(message);
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <div className="relative min-h-svh w-full overflow-hidden bg-black/[0.96] antialiased">
      <div
        className={cn(
          "pointer-events-none absolute inset-0 [background-size:40px_40px] select-none",
          "[background-image:linear-gradient(to_right,#171717_1px,transparent_1px),linear-gradient(to_bottom,#171717_1px,transparent_1px)]",
        )}
      />

      <Spotlight
        className="-top-40 left-0 md:-top-20 md:left-60"
        fill="white"
      />

      {/* Content */}
      <div className="relative z-10 flex min-h-svh flex-col items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-md">
          <Card className="overflow-hidden shadow-lg bg-black/40 backdrop-blur-md border border-white/10">
            <CardContent className="p-6 md:p-8">
              <div className="flex flex-col items-center text-center mb-6">
                <h1 className="text-2xl font-bold tracking-tight text-white">
                  {step === "email" ? "Reset Your Password" : "Verify & Reset"}
                </h1>
                <p className="text-sm text-gray-300 mt-1">
                  {step === "email" 
                    ? "Enter your email address and we'll send you a code to reset your password" 
                    : "Enter the code sent to your email and choose a new password"}
                </p>
              </div>

              <div className="space-y-4">
                {step === "email" ? (
                  <Form {...forgotForm}>
                    <form onSubmit={forgotForm.handleSubmit(onForgotSubmit)} className="space-y-4">
                      <FormField
                        control={forgotForm.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-white">Email Address</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                type="email"
                                placeholder="name@example.com"
                                disabled={isLoading}
                                className="bg-black/20 border-white/10 text-white placeholder:text-gray-400"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <Button
                        type="submit"
                        disabled={isLoading}
                        className="w-full mt-2"
                      >
                        {isLoading ? (
                          <>
                            <Icons.spinner className="h-4 w-4 animate-spin" />
                            Sending code...
                          </>
                        ) : (
                          "Send Reset Code"
                        )}
                      </Button>
                    </form>
                  </Form>
                ) : (
                  <Form {...resetForm}>
                    <form onSubmit={resetForm.handleSubmit(onResetSubmit)} className="space-y-4">
                      <div className="space-y-2">
                        <Label className="text-white">Email Address</Label>
                        <div className="relative">
                          <Input
                            value={resetForm.watch("email")}
                            type="email"
                            disabled
                            className="bg-black/20 border-white/10 text-white placeholder:text-gray-400"
                          />
                        </div>
                        <p className="text-xs text-gray-400">
                          This is the email address where we sent the reset code.
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
                              <FormLabel className="text-white">Reset Code</FormLabel>
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
                              <FormLabel className="text-white">New Password</FormLabel>
                              <FormControl>
                                <PasswordInput
                                  field={field}
                                  placeholder="Enter new password"
                                  disabled={isLoading}
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
                              <FormLabel className="text-white">Confirm Password</FormLabel>
                              <FormControl>
                                <PasswordInput
                                  field={field}
                                  placeholder="Confirm new password"
                                  disabled={isLoading}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </motion.div>

                      <Button
                        type="submit"
                        disabled={isLoading}
                        className="w-full mt-2"
                      >
                        {isLoading ? (
                          <>
                            <Icons.spinner className="h-4 w-4 animate-spin" />
                            Resetting password...
                          </>
                        ) : (
                          "Reset Password"
                        )}
                      </Button>
                    </form>
                  </Form>
                )}
              </div>

              <div className="flex items-center justify-center mt-4 gap-4 flex-wrap">
                {step === "reset" ? (
                  <>
                    <button
                      onClick={resendCode}
                      disabled={isLoading}
                      className="text-sm text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50"
                    >
                      Resend code
                    </button>
                    <span className="text-gray-600">•</span>
                    <button
                      onClick={() => setStep("email")}
                      className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      Use different email
                    </button>
                  </>
                ) : (
                  <p className="text-sm text-gray-300">
                    Remember your password?{" "}
                  </p>
                )}
                <span className="text-gray-600">•</span>
                <Link
                  href="/signin"
                  className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                >
                  Sign in
                </Link>
              </div>
            </CardContent>
            <CardFooter className="px-6 flex items-center justify-center border-t border-white/10">
              <div className="text-center text-sm text-gray-300 [&_a]:text-blue-400 [&_a]:underline [&_a]:underline-offset-4 hover:[&_a]:text-blue-300 transition-colors">
                By resetting your password, you agree to our{" "}
                <Link href="/terms" target="_blank">
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link href="/privacy" target="_blank">
                  Privacy Policy
                </Link>
                .
              </div>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}