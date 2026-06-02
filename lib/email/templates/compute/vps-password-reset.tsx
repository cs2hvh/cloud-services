import {
  BaseEmailLayout,
  EmailCard,
  EmailList,
  EmailParagraph,
} from "@/lib/email/components/base-layout";
import type { VpsPasswordResetEmailData } from "@/lib/email/types";

export function VpsPasswordResetEmailTemplate({
  recipientName,
  serverName,
  ipAddress,
  loginUsername,
  password,
  protocol,
  port,
  actionUrl,
}: VpsPasswordResetEmailData) {
  return (
    <BaseEmailLayout
      actionLabel={actionUrl ? "Open server" : undefined}
      actionUrl={actionUrl}
      greeting={`Hi ${recipientName},`}
      preview={`New ${protocol} password for ${serverName}`}
      title="Your server password was reset"
    >
      <EmailParagraph>
        The login password for your server <strong>{serverName}</strong> has been
        reset at your request. Use the credentials below to connect over{" "}
        {protocol}.
      </EmailParagraph>

      <EmailCard accent="#0095FF">
        <EmailList
          items={[
            { label: "Server", value: serverName },
            { label: "IP address", value: ipAddress },
            { label: "Username", value: loginUsername },
            { label: "New password", value: password },
            { label: "Connect via", value: `${protocol} · port ${port}` },
          ]}
        />
      </EmailCard>

      <EmailParagraph>
        For your security, this password is shown <strong>only in this email</strong>{" "}
        — we never store it. We recommend signing in and changing it to one of your
        own. If you did not request this reset, change the password immediately and
        contact support.
      </EmailParagraph>
    </BaseEmailLayout>
  );
}
