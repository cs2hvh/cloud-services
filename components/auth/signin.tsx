"use client";

import * as React from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
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
import glass from "@/components/auth/glass-controls.module.css";

type InputType = z.infer<typeof signin_schema>;

const inputShellClass = `${glass.glassControl} ${glass.inputShell}`;
const buttonShellClass = `${glass.glassControl} ${glass.buttonShell}`;

export function SignInForm() {
  const router = useRouter();
  const search = useSearchParams();

  const [isLoading, setIsLoading] = React.useState(false);
  const [rememberMe, setRememberMe] = React.useState(true);

  const [twofaRequired, setTwofaRequired] = React.useState(false);
  const [otpCode, setOtpCode] = React.useState("");
  const [twofaError, setTwofaError] = React.useState("");
  const [twofaBusy, setTwofaBusy] = React.useState(false);
  const [twofaReady, setTwofaReady] = React.useState(false);
  const [needsMfa, setNeedsMfa] = React.useState(false);
  const [factorId, setFactorId] = React.useState("");

  const supabase = React.useMemo(() => createClient(), []);

  const nextPath = React.useMemo(() => {
    const raw = search.get("next") || search.get("redirectTo") || "/dashboard";
    // Reject protocol-relative URLs (//evil.com) to prevent open redirect
    return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard";
  }, [search]);

  const form = useForm<InputType>({
    resolver: zodResolver(signin_schema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: InputType) {
    setIsLoading(true);
    try {
      const res = await api.post("/auth/signin/email", {
        email: values.email,
        password: values.password,
        rememberMe,
      });

      if (res.data?.twofastatus) {
        setTwofaRequired(true);
        return;
      }

      if (res.status === 200) {
        toast.success(`Welcome back ${res.data?.name || ""}!`);
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          await supabase.auth.setSession(data.session);
        }
        router.refresh();
        router.push(nextPath);
      }
    } finally {
      setIsLoading(false);
    }
  }

  const handleSignIn = async (type: string) => {
    setIsLoading(true);
    try {
      let response;
      if (type === "github" || type === "google" || type === "bitbucket") {
        response = await api.post("/auth/signin/github", { type, next: nextPath });
      } else if (type === "gitlab") {
        response = await api.post("/auth/signin/gitlab", { next: nextPath });
      }

      if (response?.data?.url) {
        window.location.href = response.data.url;
      }
    } finally {
      setIsLoading(false);
    }
  };

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

      if (data.currentLevel === "aal2") {
        router.refresh();
        router.replace(nextPath);
        return;
      }

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

      router.refresh();
      router.replace(nextPath);
    })();

    return () => {
      cancelled = true;
    };
  }, [twofaRequired, supabase, router, nextPath]);

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
        if (verify.error.message.includes("Invalid TOTP code")) {
          throw new Error(
            "Invalid code. Make sure your device clock is synchronized and try again.",
          );
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

  if (twofaRequired) {
    if (!twofaReady) {
      return (
        <div className="mx-auto w-full max-w-md rounded-md border border-white/20 bg-[#11131b]/90 p-6 text-sm text-white/80 backdrop-blur-md">
          Checking your session...
        </div>
      );
    }

    if (!needsMfa) {
      return null;
    }

    return (
      <div className="mx-auto w-full max-w-md rounded-md border border-white/20 bg-[#11131b]/90 p-6 shadow-xl backdrop-blur-md">
        <h1 className="mb-2 text-xl font-semibold text-white">Two-Factor Verification</h1>
        <p className="mb-4 text-sm text-white/80">
          Enter the 6-digit code from your authenticator app.
        </p>

        <form onSubmit={onSubmit2fa} className="space-y-3">
          <div>
            <Label htmlFor="code" className="text-white">Authentication Code</Label>
            <div className={inputShellClass}>
              <Input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                value={otpCode}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                  setOtpCode(v);
                }}
                maxLength={6}
                className={glass.field}
              />
            </div>
          </div>

          {twofaError && <p className="text-sm text-red-400">{twofaError}</p>}

          <div className={`w-full ${buttonShellClass}`}>
            <button
              type="submit"
              disabled={twofaBusy || otpCode.length < 6}
              className={glass.button}
            >
              {twofaBusy ? "Verifying..." : "Verify"}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto mt-3 sm:mt-0 w-full max-w-[520px] rounded-[5px] border border-white/20 bg-[#161619]/95 px-6 py-6 shadow-[0_20px_80px_rgba(0,0,0,0.5)] backdrop-blur-[20px] sm:px-8 sm:py-6">
      <div className="mx-auto mb-1 text-center pt-2 pb-1">
        <h1 style={{ fontFamily: "'Sansation', system-ui, sans-serif" }} className="text-[24px] leading-[27px] font-bold text-white">Ahura<span className="text-[#2f8af5]">Sense</span></h1>
        <p className="mt-3 text-[14px] leading-[16px] text-white">
          <span style={{ fontFamily: "'Sansation', system-ui, sans-serif" }} className="block text-[14px] leading-[18px] font-normal">Sign in to Ahura<span className="text-[#2f8af5]">Sense</span> Cloud</span>
          <span className="block  text-[14px] leading-[16px] text-white/90">Welcome back! Please Log in to continue.</span>
        </p>
      </div>

      <div className="mx-auto mt-4 w-full max-w-[320px] flex items-center justify-between gap-4 sm:gap-6">
        <button type="button" aria-label="Sign in with GitHub" className="flex-1 flex items-center justify-center text-white/95 transition hover:opacity-90 cursor-pointer" onClick={() => handleSignIn("github")} disabled={isLoading}>
          <Icons.gitHub className="h-8 w-8" />
        </button>
        <button type="button" aria-label="Sign in with GitLab" className="flex-1 flex items-center justify-center transition hover:opacity-90 cursor-pointer" onClick={() => handleSignIn("gitlab")} disabled={isLoading}>
          <Image src="/gitlab.png" alt="GitLab" width={32} height={32} className="h-8 w-8" />
        </button>
        <button type="button" aria-label="Sign in with Bitbucket" className="flex-1 flex items-center justify-center transition hover:opacity-90 cursor-pointer" onClick={() => handleSignIn("bitbucket")} disabled={isLoading}>
          <Image src="/BitBucket.png" alt="Bitbucket" width={32} height={32} className="h-8 w-8" />
        </button>
        <button type="button" aria-label="Sign in with Google" className="flex-1 flex items-center justify-center text-[#f4f4f5] transition hover:opacity-90 cursor-pointer" onClick={() => handleSignIn("google")} disabled={isLoading}>
          <Icons.google className="h-8 w-8" />
        </button>
      </div>

      <div className="mx-auto mt-4 w-full max-w-[320px]">
        <div className="flex items-center gap-3 text-white">
          <div className="h-px flex-1 bg-white/75" />
          <span className="text-sm">Or</span>
          <div className="h-px flex-1 bg-white/75" />
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="mx-auto mt-3 w-full max-w-[320px] space-y-2">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-base font-normal text-white">Email</FormLabel>
                <FormControl>
                  <div className={inputShellClass}>
                    <Input
                      placeholder=""
                      {...field}
                      disabled={isLoading}
                      type="email"
                      className={glass.field}
                    />
                  </div>
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

          <div className="flex items-center justify-between text-[11px] text-white">
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-[18px] w-[18px] rounded-sm border border-white/80 bg-transparent accent-white"
              />
              <span>Remember Me</span>
            </label>

            <Link href="/reset-password" className="text-[10px] leading-[11px] text-white hover:text-[#2f8af5]">
              Forgot Password
            </Link>
          </div>

          <div className={`mx-auto mt-2 w-full max-w-[200px] ${buttonShellClass}`}>
            <button
              type="submit"
              disabled={isLoading}
              className={glass.button}
            >
              {isLoading ? "Logging in..." : "Log In"}
            </button>
          </div>
        </form>
      </Form>

      <p className="mt-3 text-center text-sm text-white">
        New here! Create an account{" "}
        <Link href={nextPath !== "/dashboard" ? `/signup?next=${encodeURIComponent(nextPath)}` : "/signup"} className="text-[#00a2ff] hover:text-[#53beff]">
          Sign Up
        </Link>
      </p>
    </div>
  );
}
