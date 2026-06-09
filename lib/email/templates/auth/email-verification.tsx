import {
  BaseEmailLayout,
  EmailCodeBlock,
  EmailParagraph,
} from "@/lib/email/components/base-layout";
import type { EmailVerificationEmailData } from "@/lib/email/types";

export function EmailVerificationTemplate({
  username,
  verificationUrl,
  verificationCode,
  expiresIn,
}: EmailVerificationEmailData) {
  return (
    <BaseEmailLayout
      actionLabel={verificationUrl ? "Verify email" : undefined}
      actionUrl={verificationUrl}
      greeting={`Hi ${username},`}
      preview="Verify your email address"
      title="Confirm your email address"
    >
      <EmailParagraph>
        Please verify your email address to activate all account features.
      </EmailParagraph>
      {verificationCode ? (
        <EmailCodeBlock code={verificationCode} label="Verification code" />
      ) : null}
      <EmailParagraph>
        {expiresIn
          ? `This verification step expires in ${expiresIn}.`
          : "Complete this verification as soon as possible."}
      </EmailParagraph>
    </BaseEmailLayout>
  );
}
