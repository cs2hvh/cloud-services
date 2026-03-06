import { Text } from "@react-email/components";
import {
  BaseEmailLayout,
  EmailCard,
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
        <EmailCard accent="#2563eb">
          <Text style={codeStyle}>{verificationCode}</Text>
        </EmailCard>
      ) : null}
      <EmailParagraph>
        {expiresIn
          ? `This verification step expires in ${expiresIn}.`
          : "Complete this verification as soon as possible."}
      </EmailParagraph>
    </BaseEmailLayout>
  );
}

const codeStyle = {
  margin: 0,
  textAlign: "center" as const,
  fontSize: "30px",
  lineHeight: "38px",
  fontWeight: "700",
  letterSpacing: "6px",
  color: "#111827",
};
