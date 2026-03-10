import {
  BaseEmailLayout,
  EmailCard,
  EmailList,
  EmailParagraph,
} from "@/lib/email/components/base-layout";
import type { ApiKeyActivityEmailData } from "@/lib/email/types";

export function ApiKeyActivityEmailTemplate({
  username,
  keyName,
  action,
  projectName,
  happenedAt,
  dashboardUrl,
}: ApiKeyActivityEmailData) {
  const title = action === "created" ? "API key created" : "API key deleted";
  const accent = action === "created" ? "#2563eb" : "#dc2626";

  return (
    <BaseEmailLayout
      actionLabel={dashboardUrl ? "Manage API keys" : undefined}
      actionUrl={dashboardUrl}
      greeting={`Hi ${username},`}
      preview={`API key ${action}`}
      title={title}
    >
      <EmailParagraph>
        An API key activity was recorded for your account.
      </EmailParagraph>
      <EmailCard accent={accent}>
        <EmailList
          items={[
            { label: "Key name", value: keyName },
            { label: "Action", value: action },
            ...(projectName ? [{ label: "Project", value: projectName }] : []),
            ...(happenedAt ? [{ label: "Time", value: happenedAt }] : []),
          ]}
        />
      </EmailCard>
    </BaseEmailLayout>
  );
}
