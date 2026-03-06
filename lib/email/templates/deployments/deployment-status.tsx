import {
  BaseEmailLayout,
  EmailCard,
  EmailList,
  EmailParagraph,
} from "@/lib/email/components/base-layout";
import type { DeploymentStatusEmailData } from "@/lib/email/types";

export function DeploymentStatusEmailTemplate(
  data: DeploymentStatusEmailData,
) {
  const accent = data.status === "success" ? "#16a34a" : "#dc2626";
  const heading =
    data.status === "success" ? "Deployment completed" : "Deployment failed";

  return (
    <BaseEmailLayout
      actionLabel={data.status === "success" ? "Open dashboard" : "View logs"}
      actionUrl={data.status === "success" ? data.dashboardUrl : data.logsUrl}
      greeting={`Hi ${data.customerName},`}
      preview={`${data.serviceName} deployment ${data.status}`}
      title={heading}
    >
      <EmailParagraph>
        We finished processing a deployment event for your service.
      </EmailParagraph>
      <EmailCard accent={accent}>
        <EmailList
          items={[
            { label: "Service", value: data.serviceName },
            { label: "Environment", value: data.environment },
            { label: "Status", value: data.status },
            { label: "Deployed at", value: data.deployedAt },
            ...(data.deploymentId
              ? [{ label: "Deployment ID", value: data.deploymentId }]
              : []),
            ...(data.commitSha
              ? [{ label: "Commit", value: data.commitSha }]
              : []),
          ]}
        />
      </EmailCard>
      {data.commitMessage ? (
        <EmailParagraph>{`Commit message: ${data.commitMessage}`}</EmailParagraph>
      ) : null}
      {data.errorMessage ? (
        <EmailParagraph>{`Error: ${data.errorMessage}`}</EmailParagraph>
      ) : null}
    </BaseEmailLayout>
  );
}
