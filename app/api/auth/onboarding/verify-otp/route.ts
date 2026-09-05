import { NextRequest } from "next/server";
import { emailService } from "@/lib/email";
import { createServiceClient } from "@/lib/supabase/server";
import { OTPs } from "@/lib/supabase/queries/otps";
import { limitByEmail } from "@/lib/cooldown/emailbased";

export async function POST(request: NextRequest) {
  try {

    
    const { email, otpCode, password } = await request.json();
    if (typeof email !== "string" || typeof otpCode !== "string" || !email || !otpCode) {
      return Response.json(
        { message: "Missing email or OTP code." },
        { status: 400 },
      );
    }
    // THE CODE-HOLDER'S PASSWORD WINS. Onboarding rebinds an unverified
    // account's password to whichever submission came last, so two signups
    // for one address inside the five-minute window could leave the account
    // carrying one party's password while the other party held a valid code.
    // The signup form therefore sends the password it collected along with
    // the code, and the password is set in the same call that confirms the
    // email. Whoever can read the mailbox decides the credential; nobody
    // else's submission survives. Optional so an older client still verifies.
    if (password !== undefined && (typeof password !== "string" || password.length < 6 || password.length > 100)) {
      return Response.json({ message: "Invalid password." }, { status: 400 });
    }

    // Rate limiting - prevent OTP brute-force attempts
    const windowLimit = await limitByEmail(email, {
      prefix: "rl:auth-onboarding-verify-otp",
      limit: 5,
      windowMs: 300_000, // 5 minutes
    });
    if (!windowLimit.allowed) {
      return Response.json(
        { message: "Too many OTP verification attempts. Please try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(windowLimit.retryAfterSec) },
        },
      );
    }

    const supabase = await createServiceClient();

    // 1. Check for valid, unexpired, unverified OTP
    const { data: otp, error: otpError } = await supabase
      .from("otps")
      .select("id")
      .eq("email", email)
      .eq("otp_code", otpCode)
      .eq("verified", false)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (otpError || !otp) {
      return Response.json(
        { message: "OTP is invalid or expired." },
        { status: 400 },
      );
    }

    // 2. Mark this OTP as verified
    const otpVerified = await OTPs.verify(otp.id);
    if (!otpVerified) {
      return Response.json(
        { message: "Failed to update OTP record." },
        { status: 500 },
      );
    }

    // 3. Mark user's email as verified in Supabase Auth
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    const user = authUsers.users.find((u) => u.email === email);

    // The console.log(user, ...) that stood here printed the whole Supabase auth
    // user on every verification: identifiers, email, phone, app and user
    // metadata, and the full list of enrolled MFA factors, into the application
    // log.

    if (!user) {
      return Response.json({ message: "User not found." }, { status: 404 });
    }

    if (user.email_confirmed_at) {
      return Response.json(
        { message: "Email is already verified." },
        { status: 200 },
      );
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(
      user.id,
      typeof password === "string" ? { email_confirm: true, password } : { email_confirm: true },
    );

    if (updateError) {
      console.error("Error confirming user email:", updateError);
      return Response.json(
        { message: "Failed to verify user email." },
        { status: 500 },
      );
    }

    // The account is confirmed; no other outstanding code for this address
    // may confirm it again or be mistaken for a live one.
    await OTPs.invalidate_pending(email);

    const emailResult = await emailService.sendTemplate({
      template: "accountCreated",
      to: email,
      data: {
        username:
          user.user_metadata?.username ||
          user.user_metadata?.display_name ||
          email.split("@")[0],
        email,
      },
    });

    if (!emailResult.success) {
      console.error(
        "[Onboarding Verify OTP] Failed to send account created email:",
        emailResult.error,
      );
    }

    return Response.json(
      { message: "OTP verified successfully. Email is now verified." },
      { status: 200 },
    );
  } catch (error) {
    console.error("[Route] Error:", error);
    return Response.json(
      { message: "Something went wrong :(" },
      { status: 500 },
    );
  }
}
