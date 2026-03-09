import {
  BaseEmailLayout,
  EmailCard,
  EmailList,
  EmailParagraph,
} from "@/lib/email/components/base-layout";
import type { SystemAlertEmailData } from "@/lib/email/types";

const SEVERITY_COLORS: Record<SystemAlertEmailData["severity"], string> = {
  info: "#2563eb",
  warning: "#d97706",
  critical: "#dc2626",
};

export function SystemAlertEmailTemplate(data: SystemAlertEmailData) {
  const metadataItems = Object.entries(data.metadata || {}).map(
    ([label, value]) => ({
      label,
      value: String(value),
    }),
  );

  return (
    <BaseEmailLayout
      actionLabel={data.actionLabel || "Review incident"}
      actionUrl={data.actionUrl}
      greeting={`Hi ${data.customerName},`}
      preview={`${data.severity.toUpperCase()} alert for ${data.serviceName}`}
      title={data.alertTitle}
    >
      <EmailParagraph>{data.summary}</EmailParagraph>
      <EmailCard accent={SEVERITY_COLORS[data.severity]}>
        <EmailList
          items={[
            { label: "Severity", value: data.severity },
            { label: "Service", value: data.serviceName },
            { label: "Detected at", value: data.detectedAt },
            ...metadataItems,
          ]}
        />
      </EmailCard>
    </BaseEmailLayout>
  );
}
