"use server";

import { emailService } from "@/lib/email";
import { ApiResponse } from "./type";

export async function send_otp_email(
  email: string,
  username: string,
  otp: string,
): Promise<ApiResponse> {
  return emailService.sendTemplate({
    template: "emailVerification",
    to: email,
    data: {
      username,
      verificationCode: otp,
      expiresIn: "5 minutes",
    },
  });
}
