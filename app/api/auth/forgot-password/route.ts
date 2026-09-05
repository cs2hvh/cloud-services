import { NextRequest, NextResponse } from "next/server";
import { generateSixDigitOtp } from "@/lib/utils";
import { send_forgot_password_email } from "@/lib/resend/send_forgot";
import { createServiceClient } from "@/lib/supabase/server";
import {  Users } from "@/lib/supabase/queries/users";
import { OTPs } from "@/lib/supabase/queries/otps";
import { limitByEmail } from "@/lib/cooldown/emailbased";
import { forgot_password_schema } from "@/types/zod/password-reset";

/**
 * POST /api/auth/forgot-password
 * Initiates the password reset flow by sending an OTP to the user's email
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request body
    const validation = forgot_password_schema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { 
          message: "Invalid email address",
          errors: validation.error.errors 
        },
        { status: 400 }
      );
    }

    const { email } = validation.data;

    // Rate limiting - prevent abuse
    const windowLimit = await limitByEmail(email, { limit: 3, windowMs: 300_000 }); // 3 attempts per 5 minutes
    if (!windowLimit.allowed) {
      return NextResponse.json(
        { message: "Too many password reset attempts. Please try again later." },
        { 
          status: 429,
          headers: { "Retry-After": String(windowLimit.retryAfterSec) }
        }
      );
    }

    // Check if user exists with this email using the abstraction
    const user = await Users.get_by_email(email);

    // ACCOUNT ENUMERATION. The comment below was the intent, but the route did
    // not achieve it: three branches were distinguishable from outside.
    //
    //   no such account   200 { message }
    //   unverified email  403 { message: "Please verify your email..." }
    //   verified account  200 { message, otpId, expiresAt }
    //
    // So an attacker could sort any address list into "not registered",
    // "registered but unverified" and "registered and active" just by posting
    // to this endpoint and reading the status code and the presence of otpId.
    //
    // Every one of those now returns the identical body built at the end of
    // this handler. `expiresAt` is computed up front so it can be returned in
    // all cases — the reset page uses it for a countdown — and `otpId` is gone
    // entirely: nothing on the client ever read it, and its presence was itself
    // the tell.
    const expiresAt = new Date(Date.now() + 10 * 60_000); // 10 minutes
    const neutralResponse = () =>
      NextResponse.json({
        message:
          "If an account exists with this email, you will receive a password reset code.",
        expiresAt: expiresAt.toISOString(),
      });

    if (!user) {
      return neutralResponse();
    }

    // Check if user is verified
    // Note: We need to access the email_confirmed_at from the auth user data
    // Since Users.get_by_email doesn't provide this, we need to check it differently
    const supabase = await createServiceClient();
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    const authUser = authUsers.users.find((u) => u.email === email);
    
    if (!authUser?.email_confirmed_at) {
      // Same body as every other outcome. The tradeoff is deliberate and worth
      // naming: an unverified user who asks for a reset now gets no on-screen
      // explanation. Telling them apart from a stranger is exactly the signal
      // this endpoint must not emit, and the alternative — a "verify first"
      // email to the address itself — reaches only the real owner and can be
      // added later without reopening this.
      console.warn(
        "[ForgotPassword] reset requested for unverified account; responding neutrally"
      );
      return neutralResponse();
    }

    // Generate OTP
    const generatedOtp = generateSixDigitOtp();

    // Save OTP to database
    const otpId = await OTPs.create({
      email,
      otp_code: generatedOtp,
      expires_at: expiresAt.toISOString(),
    });

    if (!otpId) {
      console.error("[ForgotPassword] Failed to create OTP record");
      return NextResponse.json(
        { message: "Failed to process password reset request." },
        { status: 500 }
      );
    }

    // Send OTP via email
    const username = user.username || user.email?.split("@")[0] || "User";
    const emailResult = await send_forgot_password_email(email, username, generatedOtp);

    if (!emailResult.success) {
      console.error("[ForgotPassword] Failed to send email:", emailResult.message);
      return NextResponse.json(
        { message: "Failed to send password reset email." },
        { status: 500 }
      );
    }

    // Identical to the not-found and unverified branches above.
    return neutralResponse();
  } catch (error) {
    console.error("[ForgotPassword] Error:", error);
    return NextResponse.json(
      { message: "An unexpected error occurred. Please try again." },
      { status: 500 }
    );
  }
}