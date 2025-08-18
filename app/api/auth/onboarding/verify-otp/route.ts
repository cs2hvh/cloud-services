import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { OTPs } from "@/lib/supabase/queries";

export async function POST(request: NextRequest) {
  try {
    const { email, otpCode } = await request.json();
    if (!email || !otpCode) {
      return Response.json(
        { message: "Missing email or OTP code." },
        { status: 400 },
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

    if (!user) {
      return Response.json({ message: "User not found." }, { status: 404 });
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(
      user.id,
      { email_confirm: true },
    );

    if (updateError) {
      console.error("Error confirming user email:", updateError);
      return Response.json(
        { message: "Failed to verify user email." },
        { status: 500 },
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
