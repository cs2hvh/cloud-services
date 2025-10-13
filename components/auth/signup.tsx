"use client";

import { useState } from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
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
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { otp_schema, signup_schema } from "@/types/zod/auth";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import Image from "next/image";
import Link from "next/link";
import { Icons } from "@/components/ui/icons";
import { PasswordInput } from "../ui/password-input";
import api from "@/lib/axios/axios";

type Input = z.infer<typeof signup_schema>;
type SignupFormData = z.infer<typeof signup_schema>;
type OtpFormData = z.infer<typeof otp_schema>;

export default function SignUpMultiStep({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const [step, setStep] = useState<1 | 2>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string>(""); // store email to verify with OTP
  const router = useRouter();

  // ------------------------------------
  // Step 1 form: collect user details
  // ------------------------------------
  const signupForm = useForm<SignupFormData>({
    resolver: zodResolver(signup_schema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  // ------------------------------------
  // Step 2 form: collect OTP
  // ------------------------------------
  const otpForm = useForm<OtpFormData>({
    resolver: zodResolver(otp_schema),
    defaultValues: {
      pin: "",
    },
  });

  /**
   * Handle submission of Step 1:
   *  - Send user details to the backend
   *  - Backend should create a "pending" user and send an OTP (email or SMS)
   */
  async function onSubmitSignup(data: SignupFormData) {
    // debugger
    //lsetIsLoading(true);

    // 1) Post sign-up data to your API
    const response = await api.post("/auth/onboarding", data);
    //setIsLoading(false);
    if (response.status === 200) {
      // Suppose the backend returns { message: "...", email: "..." }
      toast.success(response.data.message);
      setPendingEmail(data.email); // store email in state to verify
      // 2) Switch to the OTP step
      setStep(2);
    } else {
      // e.g. response.status !== 200
      toast.error(response.data.message);
    }
  }

  async function onSubmitOtp(data: OtpFormData) {
    setIsLoading(true);

    const response = await api.post("/auth/onboarding/verify-otp", {
      email: pendingEmail,
      otpCode: data.pin,
    });

    setIsLoading(false);
    if (response.status === 200) {
      toast.success(response.data.message);
      router.push("/signin");
    }
  }

  // ---- social sign-up
  const handleSignIn = async (type: string) => {
    setIsLoading(true);
    const response = await api.post("/auth/signin/github", { type });

    if (response.data?.url) {
      window.location.href = response.data.url;
    }
    setIsLoading(false);
  };

  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto">
      <Card className="overflow-hidden shadow-lg bg-black/40 backdrop-blur-md border border-white/10">
        <CardContent className="grid p-0 md:grid-cols-2">
          <div className="relative hidden md:block h-full min-h-80 rounded-l-xl bg-gradient-to-br from-gray-900 to-black">
            <div className="w-full h-full rounded-l-xl flex items-center justify-center">
              <div className="text-center space-y-4 p-8">
                <h2 className="text-2xl font-bold text-white">Join AhuraSense</h2>
                <p className="text-gray-300">Start your cloud services journey today</p>
              </div>
            </div>
          </div>

          <div className="p-6 md:p-8">
            <div className="flex flex-col items-center text-center mb-6">
              <h1 className="text-2xl font-bold tracking-tight text-white">
                Welcome to AhuraSense
              </h1>
              <p className="text-sm text-gray-300 mt-1">
                We&apos;re excited to have you! Let&apos;s create your account.
              </p>
            </div>

            <div className={cn("grid gap-4", className)} {...props}>
              {step === 1 && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
                    <Button
                      variant="outline"
                      className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-black/20 border-white/10 text-white hover:bg-white/10 hover:text-white transition-colors"
                      onClick={() => handleSignIn("github")}
                      disabled={isLoading}
                    >
                      <Icons.gitHub className="h-5 w-5" />
                      <span>GitHub</span>
                    </Button>

                    <Button
                      variant="outline"
                      className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-black/20 border-white/10 text-white hover:bg-white/10 hover:text-white transition-colors"
                      onClick={() => handleSignIn("google")}
                      disabled={isLoading}
                    >
                      <Icons.google className="h-5 w-5" />
                      <span>Google</span>
                    </Button>

                    <Button
                      variant="outline"
                      className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-black/20 border-white/10 text-white hover:bg-white/10 hover:text-white transition-colors"
                      onClick={() => handleSignIn("gitlab")}
                      disabled={isLoading}
                    >
                      <Image src="/gitlab.png" alt="GitLab" width={20} height={20} className="h-5 w-5" />
                      <span>GitLab</span>
                    </Button>

                    <Button
                      variant="outline"
                      className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-black/20 border-white/10 text-white hover:bg-white/10 hover:text-white transition-colors"
                      onClick={() => handleSignIn("bitbucket")}
                      disabled={isLoading}
                    >
                      <Image src="/BitBucket.png" alt="Bitbucket" width={20} height={20} className="h-5 w-5" />
                      <span>Bitbucket</span>
                    </Button>
                  </div>

                  <div className="flex justify-center mb-6">
                    <span className="px-4 py-1 text-gray-300 bg-black/60 rounded-md border border-white/10 text-xs uppercase">
                      Or continue with
                    </span>
                  </div>
                </>
              )}

              {step === 1 && (
                <Form {...signupForm}>
                  <form
                    onSubmit={signupForm.handleSubmit(onSubmitSignup)}
                    className="space-y-5"
                  >
                    {/* STEP 1: Sign-up fields */}
                    <FormField
                      control={signupForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-white">Username</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Provide your desired username"
                              {...field}
                              type="text"
                              disabled={isLoading}
                              className="bg-black/20 border-white/10 text-white placeholder:text-gray-400"
                            />
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
                          <FormLabel className="text-white">Email</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Enter an email"
                              {...field}
                              type="email"
                              disabled={isLoading}
                              className="bg-black/20 border-white/10 text-white placeholder:text-gray-400"
                            />
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
                          <FormLabel className="text-white">Password</FormLabel>
                          <FormControl>
                            <PasswordInput
                              field={field}
                              placeholder="Enter a good password"
                              disabled={isLoading}
                             // className="bg-black/20 border-white/10 text-white placeholder:text-gray-400"
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
                          <FormLabel className="text-white">Confirm Password</FormLabel>
                          <FormControl>
                            <PasswordInput
                              field={field}
                              placeholder="Confirm your password"
                              disabled={isLoading}
                              //className="bg-black/20 border-white/10 text-white placeholder:text-gray-400"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button
                      type="submit"
                      disabled={isLoading}
                      className="w-full"
                    >
                      {isLoading && (
                        <Icons.spinner className="h-4 w-4 animate-spin" />
                      )}
                      Create Account
                    </Button>
                  </form>
                </Form>
              )}

              {step === 2 && (
                <Form {...otpForm}>
                  <form
                    onSubmit={otpForm.handleSubmit(onSubmitOtp)}
                    className="space-y-6 mx-auto text-center"
                  >
                    {/* STEP 2: OTP fields */}
                    <FormField
                      control={otpForm.control}
                      name="pin"
                      render={({ field }) => (
                        <FormItem>
                          {/* <FormLabel>One-Time Password</FormLabel> */}
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
                    <Button
                      type="submit"
                      disabled={isLoading}
                      className="w-full"
                    >
                      {isLoading && (
                        <Icons.spinner className="h-4 w-4 animate-spin" />
                      )}
                      Verify OTP
                    </Button>
                  </form>
                </Form>
              )}
            </div>
            <div className="flex items-center justify-center mt-2">
              <p className="text-sm text-gray-300">
                Already have an account?{" "}
                <Link
                  href="/signin"
                  className="text-blue-400 hover:text-blue-300 transition-colors font-medium"
                >
                  Sign In
                </Link>
              </p>
            </div>
          </div>
        </CardContent>
        <CardFooter className="px-6 flex items-center justify-center border-t border-white/10">
          <div className="text-center text-sm text-gray-300 [&_a]:text-blue-400 [&_a]:underline [&_a]:underline-offset-4 hover:[&_a]:text-blue-300 transition-colors">
            By creating account, you agree to our{" "}
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
  );
}
