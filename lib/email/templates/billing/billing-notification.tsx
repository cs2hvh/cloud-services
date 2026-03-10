import {
  BaseEmailLayout,
  EmailCard,
  EmailList,
  EmailParagraph,
} from "@/lib/email/components/base-layout";
import type { BillingNotificationEmailData } from "@/lib/email/types";

const STATUS_COLORS: Record<BillingNotificationEmailData["status"], string> = {
  paid: "#16a34a",
  due: "#2563eb",
  overdue: "#dc2626",
  failed: "#b91c1c",
};

export function BillingNotificationEmailTemplate(
  data: BillingNotificationEmailData,
) {
  const statusLabel = data.status.charAt(0).toUpperCase() + data.status.slice(1);

  return (
    <BaseEmailLayout
      actionLabel={data.actionLabel || "View billing"}
      actionUrl={data.actionUrl}
      greeting={`Hi ${data.customerName},`}
      preview={`Billing update for invoice ${data.invoiceNumber}`}
      title={`Billing ${statusLabel.toLowerCase()} notification`}
    >
      <EmailParagraph>
        Your billing event has been processed. Review the invoice details below.
      </EmailParagraph>
      <EmailCard accent={STATUS_COLORS[data.status]}>
        <EmailList
          items={[
            { label: "Invoice", value: data.invoiceNumber },
            { label: "Amount", value: data.amount },
            { label: "Due date", value: data.dueDate },
            { label: "Status", value: statusLabel },
          ]}
        />
      </EmailCard>
      {data.notes ? <EmailParagraph>{data.notes}</EmailParagraph> : null}
    </BaseEmailLayout>
  );
}
