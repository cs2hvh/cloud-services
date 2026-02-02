"use client";

import * as React from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Icons } from "@/components/ui/icons";
import { Label } from "@/components/ui/label";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

import { signin_schema } from "@/types/zod/auth";
import api from "@/lib/axios/axios";
import { createClient } from "@/lib/supabase/client";

type InputType = z.infer<typeof signin_schema>;

export function SignInForm() {
  const router = useRouter();
  const search = useSearchParams();

  // ---- UI state
  const [isLoading, setIsLoading] = React.useState(false);

  // ---- 2FA state
  const [twofaRequired, setTwofaRequired] = React.useState(false);
  const [otpCode, setOtpCode] = React.useState("");
  const [twofaError, setTwofaError] = React.useState("");
  const [twofaBusy, setTwofaBusy] = React.useState(false);
  const [twofaReady, setTwofaReady] = React.useState(false);
  const [needsMfa, setNeedsMfa] = React.useState(false);
  const [factorId, setFactorId] = React.useState("");

  // create supabase client once
  const supabase = React.useMemo(() => createClient(), []);

  // safe redirect
  const nextPath = React.useMemo(() => {
    const raw = search.get("next") || "/dashboard";
    return raw.startsWith("/") ? raw : "/dashboard";
  }, [search]);

  // ---- form
  const form = useForm<InputType>({
    resolver: zodResolver(signin_schema),
    defaultValues: { email: "", password: "" },
  });

  // ---- email/password sign-in
  async function onSubmit(values: InputType) {
    setIsLoading(true);
    const res = await api.post("/auth/signin/email", {
      email: values.email,
      password: values.password,
    });
    setIsLoading(false);
    // If server says 2FA is required, switch to 2FA mode
    if (res.data?.twofastatus) {
      setTwofaRequired(true);
      return; // don't redirect yet
    } else if (res.status === 200) {
      toast.success(`Welcome back ${res.data?.name || ""}!`);
      
      // Server set the session cookie, trigger auth state change by reading and setting it
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        await supabase.auth.setSession(data.session);
      }
      
      router.refresh();
      router.push("/");
    }
  }

  // ---- social sign-in
  const handleSignIn = async (type: string) => {
    setIsLoading(true);
    let response;
    if (type === "github" || type === "google" || type === "bitbucket") {
       response = await api.post("/auth/signin/github", { type });
    } else if (type === "gitlab") {
       response = await api.post("/auth/signin/gitlab", { type });
    }


    //if we get the url from the response, redirect to it.
    if (response?.data?.url) {
      window.location.href = response.data.url;
    }
    setIsLoading(false);
  };

  // ---- kick off AAL check only when 2FA mode is active
  React.useEffect(() => {
    if (!twofaRequired) return;

    let cancelled = false;
    (async () => {
      const { data, error } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

      if (cancelled) return;

      if (error) {
        setTwofaError(error.message);
        setTwofaReady(true);
        return;
      }

      // Already at AAL2 (rare here) → proceed
      if (data.currentLevel === "aal2") {
        router.refresh();
        router.replace(nextPath);
        return;
      }

      // Needs upgrade to AAL2 → load verified TOTP factor
      if (data.nextLevel === "aal2") {
        setNeedsMfa(true);
        const factors = await supabase.auth.mfa.listFactors();
        if (factors.error) {
          setTwofaError(factors.error.message);
          setTwofaReady(true);
          return;
        }
        const totp = factors.data.totp.find((f) => f.status === "verified");
        if (!totp) {
          setTwofaError(
            "No verified TOTP factor found. Enable 2FA in settings first.",
          );
          setTwofaReady(true);
          return;
        }
        setFactorId(totp.id);
        setTwofaReady(true);
        return;
      }

      // AAL2 not required → proceed
      router.refresh();
      router.replace(nextPath);
    })();

    return () => {
      cancelled = true;
    };
  }, [twofaRequired, supabase, router, nextPath]);

  // ---- submit 2FA code
  const onSubmit2fa = async (e: React.FormEvent) => {
    e.preventDefault();
    setTwofaError("");
    setTwofaBusy(true);
    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error) throw new Error(challenge.error.message);

      const verify = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.data.id,
        code: otpCode.trim(),
      });
      if (verify.error) {
        // Handle specific TOTP errors
        if (verify.error.message.includes("Invalid TOTP code")) {
          throw new Error("Invalid code. Make sure your device's clock is synchronized and try again.");
        }
        throw new Error(verify.error.message);
      }

      router.refresh();
      router.replace(nextPath);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Verification failed. Please try again.";
      setTwofaError(msg);
    } finally {
      setTwofaBusy(false);
    }
  };

  // ---------- RENDER ----------

  // Show 2FA UI only when in 2FA mode
  if (twofaRequired) {
    if (!twofaReady) {
      return (
        <div className="p-6 text-sm text-muted-foreground">
          Checking your session…
        </div>
      );
    }
    if (!needsMfa) {
      // We’ll have redirected already
      return null;
    }

    return (
      <div className="max-w-sm mx-auto p-6 bg-black/40 border border-white/10 rounded-lg shadow-sm backdrop-blur-md">
        <h1 className="text-xl font-semibold mb-2 text-white">Two-Factor Verification</h1>
        <p className="text-sm text-gray-300 mb-4">
          Enter the 6-digit code from your authenticator app to continue.
        </p>

        <form onSubmit={onSubmit2fa} className="space-y-3">
          <div>
            <Label htmlFor="code">Authentication code</Label>
            <Input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              value={otpCode}
              onChange={(e) => {
                // allow only digits and cap length at 6
                const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                setOtpCode(v);
              }}
              maxLength={6}
            />
          </div>

          {twofaError && <p className="text-sm text-red-600">{twofaError}</p>}

          <Button type="submit" disabled={twofaBusy || otpCode.length < 6}>
            {twofaBusy ? "Verifying…" : "Verify"}
          </Button>
        </form>
      </div>
    );
  }

  // Normal sign-in UI
  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto">
      <Card className="overflow-hidden shadow-lg bg-black/40 backdrop-blur-md border border-white/10">
        <CardContent className="grid p-0 md:grid-cols-2">
          <div className="relative hidden md:block h-full min-h-80 rounded-l-xl bg-gradient-to-br from-gray-900 to-black">
            <div className="w-full h-full rounded-l-xl flex items-center justify-center">
              <div className="text-center space-y-4 p-8">
                <h2 className="text-2xl font-bold text-white">Welcome Back</h2>
                <p className="text-gray-300">Access your cloud services platform</p>
              </div>
            </div>
          </div>

          <div className="p-6 md:p-8">
            <div className="flex flex-col items-center text-center mb-6">
              <h1 className="text-2xl font-bold tracking-tight text-white">
                Welcome back
              </h1>
              <p className="text-sm text-gray-300 mt-1">
                Please sign in to access your account.
              </p>
            </div>

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

            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="flex flex-col gap-4"
              >
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-white">Email</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="name@example.com"
                          {...field}
                          disabled={isLoading}
                          type="email"
                          className="bg-black/20 border-white/10 text-white placeholder:text-gray-400"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel htmlFor="password" className="text-white">Password</FormLabel>
                        <Link
                          href="/reset-password"
                          className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                        >
                          Forgot password?
                        </Link>
                      </div>
                      <FormControl>
                        <PasswordInput
                          field={field}
                          placeholder="••••••••"
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
                  className="w-full mt-2"
                >
                  {isLoading ? (
                    <>
                      <Icons.spinner className="h-4 w-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    "Sign in with Email"
                  )}
                </Button>
              </form>
            </Form>

            <div className="flex items-center justify-center mt-2">
              <p className="text-sm text-gray-300">
                Don&apos;t have an account?{" "}
                <Link
                  href="/signup"
                  className="text-blue-400 hover:text-blue-300 transition-colors font-medium"
                >
                  Sign up
                </Link>
              </p>
            </div>
          </div>
        </CardContent>
        <CardFooter className="px-6 flex items-center justify-center border-t border-white/10">
          <div className="text-center text-sm text-gray-300 [&_a]:text-blue-400 [&_a]:underline [&_a]:underline-offset-4 hover:[&_a]:text-blue-300 transition-colors">
            By signing in, you agree to our{" "}
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
