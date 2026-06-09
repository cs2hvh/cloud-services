import {
  BaseEmailLayout,
  EmailCodeBlock,
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
      <EmailCodeBlock code={otp} label="Verification code" />
      <EmailParagraph>This code expires in 10 minutes.</EmailParagraph>
    </BaseEmailLayout>
  );
}
