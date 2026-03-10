import {
  BaseEmailLayout,
  EmailCard,
  EmailList,
  EmailParagraph,
} from "@/lib/email/components/base-layout";
import type { NewLoginAlertEmailData } from "@/lib/email/types";

export function NewLoginAlertEmailTemplate({
  username,
  device,
  location,
  loggedInAt,
  ipAddress,
  reviewUrl,
}: NewLoginAlertEmailData) {
  return (
    <BaseEmailLayout
      actionLabel={reviewUrl ? "Review account activity" : undefined}
      actionUrl={reviewUrl}
      greeting={`Hi ${username},`}
      preview="We noticed a new login"
      title="New login detected"
    >
      <EmailParagraph>
        We noticed a login from a new device or location on your account.
      </EmailParagraph>
      <EmailCard accent="#d97706">
        <EmailList
          items={[
            { label: "Device", value: device },
            { label: "Location", value: location },
            { label: "Time", value: loggedInAt },
            ...(ipAddress ? [{ label: "IP address", value: ipAddress }] : []),
          ]}
        />
      </EmailCard>
      <EmailParagraph>
        If this was not you, change your password and review your active
        sessions immediately.
      </EmailParagraph>
    </BaseEmailLayout>
  );
}
