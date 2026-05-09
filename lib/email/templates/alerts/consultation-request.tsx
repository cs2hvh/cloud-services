import {
  BaseEmailLayout,
  EmailCard,
  EmailList,
  EmailParagraph,
} from "@/lib/email/components/base-layout";
import type { ConsultationRequestEmailData } from "@/lib/email/types";

export function ConsultationRequestEmailTemplate(
  data: ConsultationRequestEmailData,
) {
  return (
    <BaseEmailLayout
      preview={`New consultation request for ${data.serviceName}`}
      title="New Consultation Request"
      greeting="Hi Admin Team,"
      footerText="A new consultation request was submitted from the solutions page."
    >
      <EmailParagraph>
        A visitor has requested a consultation for one of your services.
      </EmailParagraph>

      <EmailCard accent="#0f766e">
        <EmailList
          items={[
            { label: "Service", value: data.serviceName },
            { label: "Name", value: data.requesterName },
            { label: "Email", value: data.requesterEmail },
            { label: "Submitted At", value: data.submittedAt },
          ]}
        />
      </EmailCard>

      <EmailCard accent="#1f2937">
        <EmailParagraph>
          <strong>Message</strong>
        </EmailParagraph>
        <EmailParagraph>{data.messageBody}</EmailParagraph>
      </EmailCard>
    </BaseEmailLayout>
  );
}
