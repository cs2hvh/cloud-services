import {
  BaseEmailLayout,
  EmailCard,
  EmailList,
  EmailParagraph,
} from "@/lib/email/components/base-layout";
import type { InferenceEventEmailData } from "@/lib/email/types";

const SUCCESS_GREEN = "#16a34a";
const FAIL_RED = "#dc2626";
const NEUTRAL_BLUE = "#2563eb";

function accentFor(event: InferenceEventEmailData["event"]): string {
  if (event.endsWith(".failed")) return FAIL_RED;
  if (event.endsWith(".succeeded") || event.endsWith(".completed") || event.endsWith(".ready"))
    return SUCCESS_GREEN;
  return NEUTRAL_BLUE;
}

function headingFor(event: InferenceEventEmailData["event"]): string {
  switch (event) {
    case "finetune.succeeded":
      return "Fine-tune finished";
    case "finetune.failed":
      return "Fine-tune failed";
    case "batch.completed":
      return "Batch completed";
    case "batch.failed":
      return "Batch failed";
    case "serving_pod.ready":
      return "Serving instance ready";
    case "serving_pod.stopped":
      return "Serving instance stopped";
  }
}

/**
 * One template for every inference-side event. Discriminated union on
 * `event` drives heading + accent color; the `items` array is whatever
 * the caller passes for the body (model id / cost / latency / etc.).
 * Keeps us from spawning a separate template per event type while still
 * giving each one a tailored heading and CTA.
 */
export function InferenceEventEmailTemplate(data: InferenceEventEmailData) {
  return (
    <BaseEmailLayout
      actionLabel={data.actionLabel ?? "Open dashboard"}
      actionUrl={data.actionUrl}
      greeting={`Hi ${data.recipientName},`}
      preview={data.preview ?? headingFor(data.event)}
      title={headingFor(data.event)}
    >
      <EmailParagraph>{data.summary}</EmailParagraph>
      <EmailCard accent={accentFor(data.event)}>
        <EmailList items={data.items} />
      </EmailCard>
      {data.errorMessage && (
        <EmailCard accent={FAIL_RED}>
          <EmailParagraph>
            <strong>Error:</strong> {data.errorMessage}
          </EmailParagraph>
        </EmailCard>
      )}
    </BaseEmailLayout>
  );
}
