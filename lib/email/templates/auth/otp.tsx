import { Text } from "@react-email/components";
import {
  BaseEmailLayout,
  EmailCard,
  EmailParagraph,
} from "@/lib/email/components/base-layout";
import type { OtpEmailData } from "@/lib/email/types";

export function OtpEmailTemplate({ username, otp }: OtpEmailData) {
  return (
    <BaseEmailLayout
      greeting={`Hi ${username},`}
      preview="Your verification code is ready"
      title="Confirm your email"
    >
      <EmailParagraph>
        Use the verification code below to complete your registration.
      </EmailParagraph>
      <EmailCard accent="#2563eb">
        <Text style={otpStyle}>{otp}</Text>
      </EmailCard>
      <EmailParagraph>This code expires in 10 minutes.</EmailParagraph>
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
