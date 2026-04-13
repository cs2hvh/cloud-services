import { NextRequest, NextResponse } from "next/server";
import { limitByEmail } from "@/lib/cooldown/emailbased";
import { reset_password_schema } from "@/types/zod/password-reset";
import { OTPs } from "@/lib/supabase/queries/otps";
import { sanitizeValidationError, logError } from "@/lib/api/error-sanitizer";
import { Users } from "@/lib/supabase/queries/users";

/**
 * POST /api/auth/reset-password
 * Verifies OTP and updates user password
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request body
    const validation = reset_password_schema.safeParse(body);
    if (!validation.success) {
      logError('POST /api/auth/reset-password validation', validation.error);
      return NextResponse.json(
        sanitizeValidationError(validation.error.errors),
        { status: 400 }
      );
    }

    const { email, otp, newPassword } = validation.data;

    // Rate limiting - prevent brute force OTP attacks
    const windowLimit = await limitByEmail(email, { limit: 5, windowMs: 300_000 }); // 5 attempts per 5 minutes
    if (!windowLimit.allowed) {
      return NextResponse.json(
        { message: "Too many attempts. Please try again later." },
        { 
          status: 429,
          headers: { "Retry-After": String(windowLimit.retryAfterSec) }
        }
      );
    }


    // Verify OTP using abstraction
    const otpRecord = await OTPs.verify_otp(email, otp);
    if (!otpRecord) {
      return NextResponse.json(
        { message: "Invalid or expired OTP code. Please request a new one." },
        { status: 400 }
      );
    }

    // Get user by email using abstraction
    const userProfile = await Users.get_by_email(email);
    if (!userProfile) {
      return NextResponse.json(
        { message: "User not found." },
        { status: 404 }
      );
    }

    // Update user password using abstraction
    const passwordUpdated = await Users.update_password(userProfile.id, newPassword);
    if (!passwordUpdated) {
      return NextResponse.json(
        { message: "Failed to reset password. Please try again." },
        { status: 500 }
      );
    }

    // Mark OTP as verified using abstraction
    await OTPs.verify(otpRecord.id);

    return NextResponse.json({
      message: "Password reset successfully. You can now sign in with your new password.",
    });
  } catch (error) {
    console.error("[ResetPassword] Error:", error);
    return NextResponse.json(
      { message: "An unexpected error occurred. Please try again." },
      { status: 500 }
    );
  }
}
