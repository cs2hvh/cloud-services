import { ApiResponse } from "./type";
import { resend } from ".";
import ForgotPasswordEmail from "./templates/forgot-password";

export async function send_forgot_password_email(email: string, username: string, otp: string): Promise<ApiResponse> {
    try {
        const res = await resend.emails.send({
            from: `support@${process.env.RESEND_DOMAIN}`,
            to: email,
            subject: 'Samatva | Your Password Reset OTP',
            react: ForgotPasswordEmail({ username, otp }),
        });
        console.log(res);
        return { success: true, message: 'Forgot Password OTP email sent successfully.' };
    } catch (error) {
        console.error("Error sending Forgot Password OTP email:", error);
        return {
            success: false,
            message: "Failed to send Forgot Password OTP email."
        };
    }
}
