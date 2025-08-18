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
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import axios from "axios";
import { signin_schema } from "@/types/zod/auth";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import Image from "next/image";
import Link from "next/link";
import { Icons } from "@/components/ui/icons";
import { PasswordInput } from "../ui/password-input";

type Input = z.infer<typeof signin_schema>;

export function SignInForm() {

    const [isLoading, setIsLoading] = React.useState<boolean>(false);
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
            const res = await axios.post("/api/auth/signin/email", {
                email: data.email,
                password: data.password,
            });
            router.refresh();
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

    const handleGithubSignIn = async () => {
        setIsLoading(true);
        try {
            const response = await axios.post("/api/auth/signin/github");
            if (response.data.url) {
                window.location.href = response.data.url;
            }
        } catch (error) {
            console.error("GitHub sign-in error:", error);
            toast.error("Failed to sign in with GitHub");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSteamSignIn = async () => {
        setIsLoading(true);
        const response = await axios.post("/api/auth/steam");
        router.push(response.data);
    };

    return (
        <div className="flex flex-col gap-6 max-w-3xl mx-auto">
            <Card className="overflow-hidden shadow-lg bg-background/60">
                <CardContent className="grid p-0 md:grid-cols-2">
                    <div className="relative hidden md:block h-full min-h-80 rounded-r-xl">
                        <Image
                            src=""
                            alt="Logo"
                            fill
                            sizes="(min-width: 768px) 320px, 100vw"
                            className="object-cover rounded-r-xl"
                        />
                    </div>

                    <div className="p-6 md:p-8">
                        <div className="flex flex-col items-center text-center mb-6">
                            <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
                            <p className="text-sm text-muted-foreground mt-1">
                                Please sign in to access your account.
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mb-6">
                            <Button
                                variant="outline"
                                className="w-full"
                                onClick={handleGithubSignIn}
                                disabled={isLoading}
                            >
                                <Icons.gitHub className="h-5 w-5" />
                                Github
                            </Button>
                            <Button
                                variant="outline"
                                className="w-full"
                                onClick={handleSteamSignIn}
                                disabled={isLoading}
                            >
                                <Icons.tailwind className="h-5 w-5" />
                                Google
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
                                <Button type="submit" disabled={isLoading} className="w-full mt-2">
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
                                <Link href="/signup" className="text-primary hover:text-primary/90 transition-colors font-medium">
                                    Sign up
                                </Link>
                            </p>
                        </div>
                    </div>
                </CardContent>
                <CardFooter className="px-6 flex items-center justify-center border-t">
                    <div className="text-center text-sm text-muted-foreground [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 hover:[&_a]:text-primary/90 transition-colors">
                        By signing in, you agree to our{" "}
                        <Link href="/terms" target="_blank">Terms of Service</Link> and{" "}
                        <Link href="/privacy" target="_blank">Privacy Policy</Link>.
                    </div>
                </CardFooter>
            </Card>
        </div>
    );
}