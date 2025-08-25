"use client";

import * as React from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { useRouter ,useSearchParams } from "next/navigation";
import { toast } from "sonner";
import axios from "axios";
import { signin_schema } from "@/types/zod/auth";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";
import { Icons } from "@/components/ui/icons";
import { PasswordInput } from "../ui/password-input";
import api from "@/lib/axios/axios";
import { useEffect, useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
//import Verify2FAPage from "@/app/signin/verify2fa/page";

type Input = z.infer<typeof signin_schema>;

export function SignInForm() {
  const [isLoading, setIsLoading] = React.useState<boolean>(false);
  const [twofastatus, setTwofastus] = React.useState<boolean>(false);
  const router = useRouter();
  const form = useForm<Input>({
    resolver: zodResolver(signin_schema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  async function onSubmit(data: Input) {
    setIsLoading(true);
    try {
      const res = await api.post("/auth/signin/email", {
        email: data.email,
        password: data.password,
      });
      console.log(res.data, ".....res.data......");
      //router.refresh();
      if (res.data.twofastatus) {
        // router.push("/signin/verify2fa");
        setTwofastus(true);
        return;
      }
      router.push("/");

      toast.success(`Welcome back ${res.data.name}!`);
    } catch (error) {
      let errorMsg = "Failed to sign in. Please check your credentials.";
      if (axios.isAxiosError(error) && error.response) {
        errorMsg = error.response.data?.message || errorMsg;
      }
      toast.error(errorMsg);
    } finally {
      setIsLoading(false);
    }
  }

  const handleSignIn = async (type: string) => {
    setIsLoading(true);

    const response = await api.post(
      "/auth/signin/github",
      { type } // request body
    );
    // return
    if (response.data.url) {
      window.location.href = response.data.url;
    }
    setIsLoading(true);
  };

    const supabase = createClient();
  
  
    const [code, setCode] = useState("");
    const [errorMsg, setErrorMsg] = useState("");
    const [busy, setBusy] = useState(false);
    const [ready, setReady] = useState(false);
    const [needsMfa, setNeedsMfa] = useState(false);
    const [factorId, setFactorId] = useState("");
      const search = useSearchParams();
  
    // Only allow relative paths for safety; default to /dashboard
    const nextPath = useMemo(() => {
      const raw = search.get("next") || "/dashboard";
      return raw.startsWith("/") ? raw : "/dashboard";
    }, [search]);
  
    useEffect(() => {
      let cancelled = false;
      (async () => {
        const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (cancelled) return;
  
        if (error) {
          setErrorMsg(error.message);
          setReady(true);
          return;
        }
  
        // Already AAL2? Go to next
        if (data.currentLevel === "aal2") {
          router.replace(nextPath);
          return;
        }
  
        // Needs upgrade to AAL2 → show prompt
        if (data.nextLevel === "aal2") {
          setNeedsMfa(true);
  
          // Find a verified TOTP factor
          const factors = await supabase.auth.mfa.listFactors();
          if (factors.error) {
            setErrorMsg(factors.error.message);
            setReady(true);
            return;
          }
          const totp = factors.data.totp.find((f) => f.status === "verified");
          if (!totp) {
            setErrorMsg("No verified TOTP factor found. Enable 2FA in settings first.");
            setReady(true);
            return;
          }
          setFactorId(totp.id);
          setReady(true);
          return;
        }
  
        // AAL2 not required; continue
        router.replace(nextPath);
      })();
  
      return () => {
        cancelled = true;
      };
    }, [supabase, router, nextPath]);
  
    const onSubmit2 = async (e: React.FormEvent) => {
      e.preventDefault();
      setErrorMsg("");
      setBusy(true);
      try {
        const challenge = await supabase.auth.mfa.challenge({ factorId });
        if (challenge.error) throw new Error(challenge.error.message);
  
        const verify = await supabase.auth.mfa.verify({
          factorId,
          challengeId: challenge.data.id,
          code: code.trim(),
        });
        if (verify.error) throw new Error(verify.error.message);
  
        router.replace(nextPath);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Verification failed. Please try again.";
        setErrorMsg(msg);
      } finally {
        setBusy(false);
      }
    };
  
    if (!ready) {
      return <div className="p-6 text-sm text-muted-foreground">Checking your session…</div>;
    }
  
    if (!needsMfa) {
      return null; // will have redirected already
    }

  // const handleSteamSignIn = async () => {
  //   setIsLoading(true);
  //   const response = await axios.post("/api/auth/steam");
  //   router.push(response.data);
  // };

  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto">
      {twofastatus === true ? (
         <div className="max-w-sm mx-auto p-6 bg-white border rounded-lg shadow-sm">
      <h1 className="text-xl font-semibold mb-2">Two-Factor Verification</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Enter the 6-digit code from your authenticator app to continue.
      </p>

      <form onSubmit={onSubmit2} className="space-y-3">
        <div>
          <Label htmlFor="code">Authentication code</Label>
          <Input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={10}
          />
        </div>

        {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}

        <Button type="submit" disabled={busy || code.trim().length < 6}>
          {busy ? "Verifying…" : "Verify"}
        </Button>
      </form>
    </div>
      ) : (
        <Card className="overflow-hidden shadow-lg bg-background/60">
          <CardContent className="grid p-0 md:grid-cols-2">
            <div className="relative hidden md:block h-full min-h-80 rounded-r-xl">
              <div className="w-full h-full rounded-r-xl" />
            </div>

            <div className="p-6 md:p-8">
              <div className="flex flex-col items-center text-center mb-6">
                <h1 className="text-2xl font-bold tracking-tight">
                  Welcome back
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Please sign in to access your account.
                </p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <Button
                  variant="outline"
                  className="w-full flex items-center justify-center gap-2"
                  onClick={() => handleSignIn("github")}
                  disabled={isLoading}
                >
                  <Icons.gitHub className="h-5 w-5" />
                  <span className="hidden sm:inline">GitHub</span>
                </Button>

                <Button
                  variant="outline"
                  className="w-full flex items-center justify-center gap-2"
                  onClick={() => handleSignIn("google")}
                  disabled={isLoading}
                >
                  <Icons.google className="h-5 w-5" />
                  <span className="hidden sm:inline">Google</span>
                </Button>

                <Button
                  variant="outline"
                  className="w-full flex items-center justify-center gap-2"
                  onClick={() => handleSignIn("gitlab")}
                  disabled={isLoading}
                >
                  <Icons.gitHub className="h-5 w-5" />
                  <span className="hidden sm:inline">GitLab</span>
                </Button>

                <Button
                  variant="outline"
                  className="w-full flex items-center justify-center gap-2"
                  onClick={() => handleSignIn("bitbucket")}
                  disabled={isLoading}
                >
                  <Icons.steam className="h-5 w-5" />
                  <span className="hidden sm:inline">Bitbucket</span>
                </Button>
              </div>

              <div className="relative mb-6">
                <div className="absolute inset-0 flex items-center">
                  <Separator />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="px-2 text-muted-foreground">
                    Or continue with
                  </span>
                </div>
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
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="name@example.com"
                            {...field}
                            disabled={isLoading}
                            type="email"
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
                          <FormLabel htmlFor="password">Password</FormLabel>
                          <Link
                            href="/reset-password"
                            className="text-xs text-primary hover:text-primary/90 transition-colors"
                          >
                            Forgot password?
                          </Link>
                        </div>
                        <FormControl>
                          <PasswordInput
                            field={field}
                            placeholder="••••••••"
                            disabled={isLoading}
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
                <p className="text-sm text-muted-foreground">
                  Don&apos;t have an account?{" "}
                  <Link
                    href="/signup"
                    className="text-primary hover:text-primary/90 transition-colors font-medium"
                  >
                    Sign up
                  </Link>
                </p>
              </div>
            </div>
          </CardContent>
          <CardFooter className="px-6 flex items-center justify-center border-t">
            <div className="text-center text-sm text-muted-foreground [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 hover:[&_a]:text-primary/90 transition-colors">
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
      )}
    </div>
  );
}
