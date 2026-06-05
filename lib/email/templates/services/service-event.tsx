import {
  BaseEmailLayout,
  EmailCard,
  EmailList,
  EmailParagraph,
} from "@/lib/email/components/base-layout";
import type {
  ServiceEventEmailData,
  ServiceEventKind,
} from "@/lib/email/types";

const BRAND = "#0095FF";
const GREEN = "#16a34a";
const AMBER = "#d97706";
const RED = "#dc2626";
const SLATE = "#475569";

const META: Record<
  ServiceEventKind,
  { accent: string; verb: string; line: (t: string, n: string) => string }
> = {
  created: {
    accent: GREEN,
    verb: "created",
    line: (t, n) => `Your ${t} "${n}" has been created and is being set up.`,
  },
  ready: {
    accent: GREEN,
    verb: "is ready",
    line: (t, n) => `Your ${t} "${n}" is now active and ready to use.`,
  },
  purchased: {
    accent: BRAND,
    verb: "purchased",
    line: (t, n) => `Your purchase of ${t} "${n}" is confirmed.`,
  },
  renewed: {
    accent: BRAND,
    verb: "renewed",
    line: (t, n) => `Your ${t} "${n}" has been renewed.`,
  },
  updated: {
    accent: BRAND,
    verb: "updated",
    line: (t, n) => `Your ${t} "${n}" has been updated.`,
  },
  resumed: {
    accent: GREEN,
    verb: "resumed",
    line: (t, n) => `Your ${t} "${n}" has been resumed and is active again.`,
  },
  suspended: {
    accent: AMBER,
    verb: "suspended",
    line: (t, n) => `Your ${t} "${n}" has been suspended.`,
  },
  expiring: {
    accent: AMBER,
    verb: "is expiring soon",
    line: (t, n) => `Your ${t} "${n}" is expiring soon — renew to avoid interruption.`,
  },
  deleted: {
    accent: SLATE,
    verb: "deleted",
    line: (t, n) => `Your ${t} "${n}" has been deleted.`,
  },
  failed: {
    accent: RED,
    verb: "failed",
    line: (t, n) => `We ran into a problem with your ${t} "${n}".`,
  },
};

export function ServiceEventEmailTemplate(data: ServiceEventEmailData) {
  const meta = META[data.event] ?? META.updated;
  const title = `${data.serviceType} ${meta.verb}`;
  const summary = data.summary || meta.line(data.serviceType, data.serviceName);

  const items =
    data.items && data.items.length > 0
      ? data.items
      : [
          { label: data.serviceType, value: data.serviceName },
          { label: "Status", value: meta.verb.replace(/^is /, "") },
        ];

  return (
    <BaseEmailLayout
      actionLabel={data.actionLabel || (data.actionUrl ? "Open dashboard" : undefined)}
      actionUrl={data.actionUrl}
      greeting={`Hi ${data.recipientName},`}
      preview={data.preview || summary}
      title={title}
    >
      <EmailParagraph>{summary}</EmailParagraph>
      <EmailCard accent={meta.accent}>
        <EmailList items={items} />
      </EmailCard>
      {data.errorMessage ? (
        <EmailParagraph>{`Details: ${data.errorMessage}`}</EmailParagraph>
      ) : null}
    </BaseEmailLayout>
  );
}
