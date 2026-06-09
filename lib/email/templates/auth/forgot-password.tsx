import {
  BaseEmailLayout,
  EmailCodeBlock,
  EmailParagraph,
} from "@/lib/email/components/base-layout";
import type { ForgotPasswordEmailData } from "@/lib/email/types";

export function ForgotPasswordEmailTemplate({
  username,
  otp,
}: ForgotPasswordEmailData) {
  return (
    <BaseEmailLayout
      greeting={`Hi ${username},`}
      preview="Use this code to reset your password"
      title="Reset your password"
    >
      <EmailParagraph>
        We received a password reset request for your account. Use the code
        below to continue.
      </EmailParagraph>
      <EmailCodeBlock code={otp} label="Password reset code" />
      <EmailParagraph>
        If you did not request this, you can safely ignore this email.
      </EmailParagraph>
    </BaseEmailLayout>
  );
}
