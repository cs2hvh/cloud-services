import { NextRequest } from "next/server";
import { generateSixDigitOtp } from "@/lib/utils";
import { send_otp_email } from "@/lib/resend/send_otp";
import { createServiceClient } from "@/lib/supabase/server";
import { OTPs } from "@/lib/supabase/queries";

export async function POST(request: NextRequest) {
  try {
    const { email, name, password } = await request.json();

    if (!email || !password || !name) {
      return Response.json(
        { message: "Email, password, and name are required" },
        { status: 400 },
      );
    }

    const supabase = await createServiceClient();

    // Check if user already exists in Supabase Auth
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    console.log(authUsers,".............authUsers12345")
    const existingUser = authUsers.users.find((u) => u.email === email);

    // --------------------------
    // 1. USER ALREADY EXISTS
    // --------------------------
    if (existingUser) {
      // If user is already verified, no need to re-register
      if (existingUser.email_confirmed_at) {
        return Response.json(
          { message: "User already exists and is verified." },
          { status: 403 },
        );
      }

      // If user exists but is NOT yet verified, send new OTP
      const generatedOtp = generateSixDigitOtp();
      const expiresAt = new Date(Date.now() + 5 * 60_000); // 5 min from now

      const otpId = await OTPs.create({
        email,
        otp_code: generatedOtp,
        expires_at: expiresAt.toISOString(),
      });

      if (!otpId) {
        return Response.json(
          {
            message: "Failed to generate OTP",
          },
          { status: 500 },
        );
      }

      await send_otp_email(email, name, generatedOtp);

      return Response.json({
        message: "User exists but not verified. New OTP has been sent.",
        otpId,
      });
    }

    // --------------------------
    // 2. CREATE NEW USER
    // --------------------------
    const { data: newUser, error: signUpError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        user_metadata: {
          username: name,
          display_name: name,
        },
        email_confirm: false, // We'll handle email confirmation with OTP
      });

    if (signUpError || !newUser.user) {
      console.error("Error creating user:", signUpError);
      return Response.json(
        { message: "Failed to create user" },
        { status: 500 },
      );
    }

    // Generate OTP for the new user
    const generatedOtp = generateSixDigitOtp();
    const expiresAt = new Date(Date.now() + 5 * 60_000); // 5 min from now

    const otpId = await OTPs.create({
      email,
      otp_code: generatedOtp,
      expires_at: expiresAt.toISOString(),
    });

    if (!otpId) {
      return Response.json(
        { message: "Failed to generate OTP" },
        { status: 500 },
      );
    }

    await send_otp_email(email, name, generatedOtp);

    return Response.json({
      message: "User registration successful. OTP generated.",
      name: name,
      otpId,
    });
  } catch (error) {
    console.error("Error in registration:", error);
    return Response.json(
      { message: "Something went wrong :(" },
      { status: 500 },
    );
  }
}
