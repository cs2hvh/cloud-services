import { NextRequest, NextResponse } from "next/server";
import { generateSixDigitOtp } from "@/lib/utils";
import { send_forgot_password_email } from "@/lib/resend/send_forgot";
import { createServiceClient } from "@/lib/supabase/server";
import { OTPs } from "@/lib/supabase/queries";
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

    const supabase = await createServiceClient();

    // Check if user exists with this email
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    const user = authUsers.users.find((u) => u.email === email);

    // Security: Always return success even if user doesn't exist (prevents email enumeration)
    if (!user) {
      return NextResponse.json({
        message: "If an account exists with this email, you will receive a password reset code.",
      });
    }

    // Check if user is verified
    if (!user.email_confirmed_at) {
      return NextResponse.json(
        { message: "Please verify your email before resetting your password." },
        { status: 403 }
      );
    }

    // Generate OTP
    const generatedOtp = generateSixDigitOtp();
    const expiresAt = new Date(Date.now() + 10 * 60_000); // 10 minutes expiry

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
    const username = user.user_metadata?.username || user.email?.split("@")[0] || "User";
    const emailResult = await send_forgot_password_email(email, username, generatedOtp);

    if (!emailResult.success) {
      console.error("[ForgotPassword] Failed to send email:", emailResult.message);
      return NextResponse.json(
        { message: "Failed to send password reset email." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: "If an account exists with this email, you will receive a password reset code.",
      otpId, // Return for tracking purposes (optional)
      expiresAt: expiresAt.toISOString() // Return expiration time for countdown
    });
  } catch (error) {
    console.error("[ForgotPassword] Error:", error);
    return NextResponse.json(
      { message: "An unexpected error occurred. Please try again." },
      { status: 500 }
    );
  }
}
