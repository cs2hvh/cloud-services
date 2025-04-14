"use client"

import { useState } from "react"
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod"
import { cn } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useForm } from "react-hook-form"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useRouter } from "next/navigation";
import axios, { AxiosError } from "axios";
import { toast } from "sonner";
import { otp_schema, signup_schema } from "@/types/zod/auth";
import {
    InputOTP,
    InputOTPGroup,
    InputOTPSeparator,
    InputOTPSlot,
} from "@/components/ui/input-otp"
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import Image from "next/image";
import Link from "next/link";
import { Icons } from "@/components/ui/icons";
import { PasswordInput } from "../ui/password-input";

type Input = z.infer<typeof signup_schema>
type SignupFormData = z.infer<typeof signup_schema>
type OtpFormData = z.infer<typeof otp_schema>

export default function SignUpMultiStep({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {

    const [step, setStep] = useState<1 | 2>(1)
    const [isLoading, setIsLoading] = useState(false)
    const [pendingEmail, setPendingEmail] = useState<string>("") // store email to verify with OTP
    const router = useRouter()

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
    })

    // ------------------------------------
    // Step 2 form: collect OTP
    // ------------------------------------
    const otpForm = useForm<OtpFormData>({
        resolver: zodResolver(otp_schema),
        defaultValues: {
            pin: "",
        },
    })

    /**
     * Handle submission of Step 1:
     *  - Send user details to the backend
     *  - Backend should create a "pending" user and send an OTP (email or SMS)
     */
    async function onSubmitSignup(data: SignupFormData) {
        setIsLoading(true)
        try {
            // 1) Post sign-up data to your API
            const response = await axios.post("/api/auth/onboarding", data)
            if (response.status === 200) {
                // Suppose the backend returns { message: "...", email: "..." }
                toast.success(response.data.message)
                setPendingEmail(data.email) // store email in state to verify
                // 2) Switch to the OTP step
                setStep(2)
            } else {
                // e.g. response.status !== 200
                toast.error(response.data.message)
            }
        } catch (error) {
            if (error instanceof AxiosError) {
                const status = error.response?.status;

                // Ensure error.response?.data is treated as an object with a `message` property
                const serverMessage = (error.response?.data as { message?: string })?.message;

                if (status === 400) {
                    toast.error(serverMessage || "Bad request.");
                } else if (status === 403) {
                    toast.error(serverMessage || "Forbidden .");
                } else {
                    toast.error(serverMessage || "Something went wrong.");
                }
            } else if (error instanceof Error) {
                toast.error(error.message || "An unexpected error occurred.");
            } else {
                toast.error("An unknown error occurred.");
            }
        } finally {
            setIsLoading(false)
        }
    }

    /**
     * Handle submission of Step 2 (OTP):
     *  - Verify the OTP the user enters
     */
    async function onSubmitOtp(data: OtpFormData) {
        setIsLoading(true)
        try {
            // 1) Post OTP to your verify-OTP endpoint
            const response = await axios.post("/api/auth/onboarding/verify-otp", {
                email: pendingEmail, // from step 1
                otpCode: data.pin,
            })

            if (response.status === 200) {
                toast.success(response.data.message)
                router.push("/signin") // or wherever you want to redirect
            } else {
                toast.error(response.data.message)
            }
        } catch (error: unknown) {
            if (error instanceof AxiosError) {
                const status = error.response?.status;

                // Ensure error.response?.data is treated as an object with a `message` property
                const serverMessage = (error.response?.data as { message?: string })?.message;

                if (status === 400) {
                    toast.error(serverMessage || "Bad request - OTP invalid or expired.");
                } else if (status === 403) {
                    toast.error(serverMessage || "Forbidden - maybe OTP was used or user is blocked.");
                } else {
                    toast.error(serverMessage || "Something went wrong while verifying OTP.");
                }
            } else if (error instanceof Error) {
                toast.error(error.message || "An unexpected error occurred.");
            } else {
                toast.error("An unknown error occurred.");
            }
        } finally {
            setIsLoading(false);
        }
    }

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
                            <h1 className="text-2xl font-bold tracking-tight">Welcome to AhuraSense</h1>
                            <p className="text-sm text-muted-foreground mt-1">
                                We&apos;re excited to have you! Let&apos;s create your account.
                            </p>
                        </div>

                        <div className={cn("grid gap-4", className)} {...props}>
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
                                                    <FormLabel>Username</FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            placeholder="Provide your desired username"
                                                            {...field}
                                                            type="text"
                                                            disabled={isLoading}
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
                                                    <FormLabel>Email</FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            placeholder="Enter an email"
                                                            {...field}
                                                            type="email"
                                                            disabled={isLoading}
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
                                                    <FormLabel>Password</FormLabel>
                                                    <FormControl>
                                                        <PasswordInput
                                                            field={field}
                                                            placeholder="Enter a good password"
                                                            disabled={isLoading}
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
                                                    <FormLabel>Confirm Password</FormLabel>
                                                    <FormControl>
                                                        <PasswordInput
                                                            field={field}
                                                            placeholder="Confirm your password"
                                                            disabled={isLoading}
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <Button type="submit" disabled={isLoading} className="w-full">
                                            {isLoading && <Icons.spinner className="h-4 w-4 animate-spin" />}
                                            Create Account
                                        </Button>
                                    </form>
                                </Form>
                            )}

                            {step === 2 && (
                                <Form {...otpForm}>
                                    <form onSubmit={otpForm.handleSubmit(onSubmitOtp)} className="space-y-6 mx-auto text-center">
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
                                        <Button type="submit" disabled={isLoading} className="w-full">
                                            {isLoading && <Icons.spinner className="h-4 w-4 animate-spin" />}
                                            Verify OTP
                                        </Button>
                                    </form>
                                </Form>
                            )}
                        </div>
                        <div className="flex items-center justify-center mt-2">
                            <p className="text-sm text-muted-foreground">
                                Already have an account?{" "}
                                <Link href="/signin" className="text-primary hover:text-primary/90 transition-colors font-medium">
                                    Sign In
                                </Link>
                            </p>
                        </div>
                    </div>
                </CardContent>
                <CardFooter className="px-6 flex items-center justify-center border-t">
                    <div className="text-center text-sm text-muted-foreground [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 hover:[&_a]:text-primary/90 transition-colors">
                        By creating account, you agree to our{" "}
                        <Link href="/terms" target="_blank">Terms of Service</Link> and{" "}
                        <Link href="/privacy" target="_blank">Privacy Policy</Link>.
                    </div>
                </CardFooter>
            </Card>
        </div>
    )
}