import {
  BaseEmailLayout,
  EmailCard,
  EmailList,
  EmailParagraph,
} from "@/lib/email/components/base-layout";
import type { SuspiciousActivityEmailData } from "@/lib/email/types";

export function SuspiciousActivityEmailTemplate({
  username,
  activity,
  detectedAt,
  location,
  ipAddress,
  actionUrl,
  actionLabel,
}: SuspiciousActivityEmailData) {
  return (
    <BaseEmailLayout
      actionLabel={actionLabel || (actionUrl ? "Secure account" : undefined)}
      actionUrl={actionUrl}
      greeting={`Hi ${username},`}
      preview="Suspicious account activity detected"
      title="Suspicious activity detected"
    >
      <EmailParagraph>
        We detected activity on your account that may require your attention.
      </EmailParagraph>
      <EmailCard accent="#dc2626">
        <EmailList
          items={[
            { label: "Activity", value: activity },
            { label: "Detected at", value: detectedAt },
            ...(location ? [{ label: "Location", value: location }] : []),
            ...(ipAddress ? [{ label: "IP address", value: ipAddress }] : []),
          ]}
        />
      </EmailCard>
      <EmailParagraph>
        If you do not recognize this activity, secure your account immediately.
      </EmailParagraph>
    </BaseEmailLayout>
  );
}
