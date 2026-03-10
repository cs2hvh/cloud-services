"use server";

import { ApiResponse } from "./type";
import { emailService } from "@/lib/email";

export async function send_forgot_password_email(
  email: string,
  username: string,
  otp: string,
): Promise<ApiResponse> {
  return emailService.sendTemplate({
    template: "forgotPassword",
    to: email,
    data: { username, otp },
  });
}
