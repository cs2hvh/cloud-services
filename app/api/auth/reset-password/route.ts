import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { limitByEmail } from "@/lib/cooldown/emailbased";
import { reset_password_schema } from "@/types/zod/password-reset";

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
      return NextResponse.json(
        { 
          message: "Invalid request data",
          errors: validation.error.errors 
        },
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

    const supabase = await createServiceClient();

    // Verify OTP
    const { data: otpRecord, error: otpError } = await supabase
      .from("otps")
      .select("id, verified, expires_at")
      .eq("email", email)
      .eq("otp_code", otp)
      .eq("verified", false)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (otpError || !otpRecord) {
      return NextResponse.json(
        { message: "Invalid or expired OTP code. Please request a new one." },
        { status: 400 }
      );
    }

    // Get user by email
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    const user = authUsers.users.find((u) => u.email === email);

    if (!user) {
      return NextResponse.json(
        { message: "User not found." },
        { status: 404 }
      );
    }

    // Update user password
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      user.id,
      { password: newPassword }
    );

    if (updateError) {
      console.error("[ResetPassword] Error updating password:", updateError.message);
      return NextResponse.json(
        { message: "Failed to reset password. Please try again." },
        { status: 500 }
      );
    }

    // Mark OTP as verified
    await supabase
      .from("otps")
      .update({ verified: true })
      .eq("id", otpRecord.id);

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
