import type { Metadata } from "next";
import { Code } from "@/components/docs/code";
import { A, C, Callout, DocPage, H2, P, Table } from "@/components/docs/primitives";

export const metadata: Metadata = {
  title: "Errors — Inference API — AhuraSense Docs",
  description:
    "The AhuraSense inference API error envelope and every error code, with the HTTP status and what to do about each.",
};

const HREF = "/docs/inference/errors";

export default function ErrorsPage() {
  return (
    <DocPage
      href={HREF}
      eyebrow="API reference"
      title="Errors"
      lede="Every error is JSON with a stable code you can switch on. The status tells you whether to retry; the code tells you why it happened; the message is for a human."
    >
      <H2>Envelope</H2>
      <Code lang="json" title="error">{`{
  "error": {
    "message": "Model \\"openai/gpt-9\\" is not allowed for this API key",
    "type": "invalid_request_error",
    "code": "model_not_allowed",
    "request_id": "9550cc20-5c1f-45e1-8413-08874b3f1a64"
  }
}`}</Code>
      <P>
        <C>request_id</C> matches the <C>X-Ahura-Request-Id</C> header and the usage record.
        Errors from the Anthropic-compatible route use Anthropic’s envelope instead, with the same
        status codes.
      </P>

      <H2>Codes</H2>
      <Table
        head={["Status", "Code", "Cause", "What to do"]}
        rows={[
          ["400", <C key="1">invalid_json</C>, "The body is not valid JSON.", "Fix the request."],
          ["400", <C key="2">invalid_request</C>, "A field failed validation; the message names it.", "Fix the request."],
          ["400", <C key="3">model_required</C>, "No model, and no preset that supplies one.", "Send a model id."],
          ["400", <C key="4">preset_not_found</C>, "X-Ahura-Preset names a preset your organization does not have.", "Check the name in the dashboard."],
          ["400", <C key="5">guardrail_blocked</C>, "The guardrail was set to block and a critical pattern matched.", <>Review the prompt; see <A href="/docs/inference/guardrails">Guardrails</A>.</>],
          ["400", <C key="6">byok_unavailable</C>, "BYOK billing was requested but no usable stored key exists for that provider.", "Add the key in the dashboard or drop the header."],
          ["400", <C key="7">self_serve_model</C>, "A private adapter that is not being served anywhere.", "Start a serving pod for it from the dashboard."],
          ["401", <C key="8">invalid_api_key</C>, "Missing, malformed, unknown, revoked or expired key, or a request from outside the key's IP allowlist.", "Check the key and where you are calling from."],
          ["402", <C key="9">hard_cap_reached</C>, "This key's monthly hard cap is spent.", "Raise the cap on the API keys page, or use another key."],
          ["402", <C key="10">org_hard_cap_reached</C>, "The organization's monthly hard cap is spent.", "Raise the cap under Inference settings, or wait for the new month."],
          ["403", <C key="11">model_not_allowed</C>, "The key's model allowlist does not include this model.", "Use an allowed model or widen the allowlist."],
          ["404", <C key="12">model_not_found</C>, "Not a catalog id.", <>Check <C>GET /v1/models</C>.</>],
          ["429", <C key="13">rate_limit_exceeded</C>, "Over the key's requests per minute.", <>Wait <C>Retry-After</C> seconds. The SDKs do this.</>],
          ["429", <C key="14">upstream_rate_limited</C>, "The model's backend is throttling.", "Retry with backoff, or switch model."],
          ["503", <C key="15">model_unavailable</C>, "The model is in the catalog but switched off, or its routing could not be read.", "Retry later or use another model."],
          ["503", <C key="16">instance_warming_up</C>, "A hosted model's replicas are all starting.", <>Wait <C>Retry-After</C> seconds and retry.</>],
          ["503", <C key="17">embeddings_unavailable</C>, "The embeddings endpoint has no provider configured.", "Not retryable at present."],
          ["502 / 503", <C key="18">upstream_unavailable</C>, "The model's backend rejected our credentials or is down.", "Retry with backoff; we are alerted."],
          ["400 / 422", <C key="19">upstream_rejected_request</C>, "The backend refused the request on a rule of its own.", "Read the message; usually a parameter the model does not accept."],
          ["500", <C key="20">internal_error</C>, "A fault inside the gateway.", <>Retry once; if it persists, contact support with the <C>request_id</C>.</>],
        ]}
      />

      <H2>Retry policy</H2>
      <P>
        Retry <C>429</C>, <C>502</C>, <C>503</C> and <C>500</C> with exponential backoff, honouring{" "}
        <C>Retry-After</C> when present. Never retry <C>400</C>, <C>401</C>, <C>402</C>,{" "}
        <C>403</C> or <C>404</C>: the same request will fail the same way until something on your
        side changes.
      </P>
      <Callout kind="note" title="Errors are not billed">
        A request that ends in an error produces no charge. A stream that was cancelled after
        tokens were generated is charged for those tokens.
      </Callout>
    </DocPage>
  );
}
