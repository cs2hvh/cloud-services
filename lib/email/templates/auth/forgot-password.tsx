import { Text } from "@react-email/components";
import {
  BaseEmailLayout,
  EmailCard,
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
      <EmailCard accent="#ea580c">
        <Text style={otpStyle}>{otp}</Text>
      </EmailCard>
      <EmailParagraph>
        If you did not request this, you can safely ignore this email.
      </EmailParagraph>
    </BaseEmailLayout>
  );
}

const otpStyle = {
  margin: 0,
  textAlign: "center" as const,
  fontSize: "30px",
  lineHeight: "38px",
  fontWeight: "700",
  letterSpacing: "6px",
  color: "#111827",
};
