import {
  BaseEmailLayout,
  EmailCard,
  EmailList,
  EmailParagraph,
} from "@/lib/email/components/base-layout";
import type { AccountCreatedEmailData } from "@/lib/email/types";

export function AccountCreatedEmailTemplate({
  username,
  email,
  loginUrl,
}: AccountCreatedEmailData) {
  return (
    <BaseEmailLayout
      actionLabel={loginUrl ? "Open dashboard" : undefined}
      actionUrl={loginUrl}
      greeting={`Hi ${username},`}
      preview="Your account is ready"
      title="Welcome to AhuraSense"
    >
      <EmailParagraph>
        Your account has been created successfully. You can now sign in and
        start using the platform.
      </EmailParagraph>
      <EmailCard accent="#16a34a">
        <EmailList
          items={[
            { label: "Account email", value: email },
            { label: "Status", value: "Active" },
          ]}
        />
      </EmailCard>
    </BaseEmailLayout>
  );
}
