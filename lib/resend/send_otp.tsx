"use server";

import { resend } from ".";
import { ApiResponse } from "./type";

export async function send_otp_email(
  email: string,
  username: string,
  otp: string,
): Promise<ApiResponse> {
  try {
    const { default: OTPEmail } = await import("./templates/otp");
    const res = await resend.emails.send({
      from: `support@${process.env.RESEND_DOMAIN}`,
      to: email,
      subject: "Samatva | Your OTP Code",
      react: OTPEmail({ username, otp }),
    });
    console.log(res);
    return { success: true, message: "OTP email sent successfully." };
  } catch (error) {
    console.error("Error sending OTP email:", error);
    return {
      success: false,
      message: "Failed to send OTP email.",
    };
  }
}
