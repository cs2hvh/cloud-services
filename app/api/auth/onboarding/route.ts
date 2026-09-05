import { NextRequest } from "next/server";
import { generateSixDigitOtp } from "@/lib/utils";
import { send_otp_email } from "@/lib/resend/send_otp";
import { createServiceClient } from "@/lib/supabase/server";
import { OTPs } from "@/lib/supabase/queries/otps";
import { limitByEmail } from "@/lib/cooldown/emailbased";
import { signup_schema } from "@/types/zod/auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // SERVER-SIDE VALIDATION. `name` reaches a branded OTP email, and the only
    // thing that had ever checked its shape was the browser form. The schema
    // that the signup UI already uses is applied here instead, so the value
    // rendered into an email we send on the user's behalf is constrained to
    // letters, digits and underscores rather than to whatever was posted.
    const parsed = signup_schema.safeParse({
      ...body,
      confirmPassword: body?.confirmPassword ?? body?.password,
    });

    if (!parsed.success) {
      return Response.json(
        { message: parsed.error.issues[0]?.message ?? "Invalid signup details" },
        { status: 400 },
      );
    }

    const { email, name, password } = parsed.data;

    // RATE LIMIT. This endpoint creates an account and sends an email for any
    // address supplied, and had no limit of any kind. The middleware's IP limit
    // now covers /api/auth/onboarding, and this adds the per-address limit that
    // an IP limit cannot provide: 3 attempts per 5 minutes, matching
    // forgot-password. Without it the platform is a mail relay pointed at
    // whichever recipient the caller names.
    const windowLimit = await limitByEmail(email, {
      limit: 3,
      windowMs: 300_000,
    });
    if (!windowLimit.allowed) {
      return Response.json(
        { message: "Too many signup attempts. Please try again later." },
        { status: 429 },
      );
    }

    const supabase = await createServiceClient();

    // Check if user already exists in Supabase Auth
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    //console.log(authUsers,".............authUsers12345")
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

      // ACCOUNT PRE-HIJACKING. This branch used to issue a fresh OTP for the
      // existing unverified account and nothing else, leaving whatever password
      // was set when the row was first created:
      //
      //   1. attacker onboards victim@example.com with the ATTACKER's password.
      //      The account is created unverified. Nothing is sent to the attacker,
      //      so this costs them nothing and raises no alarm.
      //   2. the real owner later signs up with the same address. They land
      //      here, are sent an OTP, and enter it.
      //   3. the account becomes verified — still holding the attacker's
      //      password. The attacker signs in to the victim's verified account.
      //
      // The submitted credentials are now bound to the account BEFORE the OTP
      // goes out, so the password that ends up on the account is always the one
      // from the request that triggered the code the user is about to enter.
      // Re-binding is safe precisely because the account is unverified: nobody
      // has proven they own the address yet, so there is no established owner
      // whose password could be overwritten.
      const { error: rebindError } = await supabase.auth.admin.updateUserById(
        existingUser.id,
        {
          password,
          user_metadata: {
            username: name,
            display_name: name,
          },
        }
      );

      if (rebindError) {
        console.error(
          "[onboarding] failed to rebind unverified account:",
          rebindError.message
        );
        return Response.json(
          { message: "Failed to process signup" },
          { status: 500 }
        );
      }

      // If user exists but is NOT yet verified, send new OTP
      // One live code per address: a second submission for the same email
      // (the account's owner retrying, or someone else racing them) must not
      // leave the earlier code valid alongside the new one.
      await OTPs.invalidate_pending(email);
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
        { message: "Failed to create user.Email is not valid" },
        { status: 500 },
      );
    }

    // Generate OTP for the new user. One live code per address, as in the
    // existing-account branch above.
    await OTPs.invalidate_pending(email);
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
