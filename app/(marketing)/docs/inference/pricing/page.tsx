import type { Metadata } from "next";
import { Code } from "@/components/docs/code";
import { A, C, Callout, DocPage, H2, Li, P, Table, Ul } from "@/components/docs/primitives";

export const metadata: Metadata = {
  title: "Pricing & usage — Inference API — AhuraSense Docs",
  description:
    "How a request on the AhuraSense inference API is priced, what each usage record contains, and where to see and export usage.",
};

const HREF = "/docs/inference/pricing";

export default function PricingPage() {
  return (
    <DocPage
      href={HREF}
      eyebrow="Account"
      title="Pricing & usage"
      lede="Per-token prices, per model, listed in the catalog and charged against your AhuraSense balance as requests complete. No subscription and no minimum."
    >
      <H2>How a request is priced</H2>
      <P>
        Each model in the catalog has three rates, in cents per million tokens:
      </P>
      <Table
        head={["Rate", "Applies to"]}
        rows={[
          [<C key="1">input_cents_per_mtok</C>, "Tokens in the prompt: every message you send, tool definitions and tool results included."],
          [<C key="2">cached_cents_per_mtok</C>, "Prompt tokens the backend served from its prompt cache, and the whole prompt of a response answered by the gateway cache."],
          [<C key="3">output_cents_per_mtok</C>, "Tokens the model generated, reasoning tokens included on models that reason."],
        ]}
      />
      <Code lang="text" title="example">{`Model:  anthropic/claude-haiku-4.5   input $1.00 / M   cached $0.10 / M   output $5.00 / M
Usage:  prompt 1,200 tokens (of which 800 cached), completion 300 tokens

cost = 400 × 1.00/1M + 800 × 0.10/1M + 300 × 5.00/1M
     = $0.0004 + $0.00008 + $0.0015
     = $0.00198, recorded as 1 cent (costs round up to the cent per request)`}</Code>
      <Ul>
        <Li>Prices are on the <A href="/docs/inference/models">Models</A> page and in <C>GET /v1/models</C>. A change applies to requests after it, never retroactively.</Li>
        <Li>Requests that end in an error are not charged. A cancelled stream is charged for the tokens generated.</Li>
        <Li>With <A href="/docs/inference/byok">BYOK</A> billing, the platform charge is zero and the provider bills you directly.</Li>
        <Li>The <C>off_peak</C> field on a model is reserved for time-of-day discounts; it is <C>null</C> on every model today.</Li>
      </Ul>

      <H2>What a usage record contains</H2>
      <P>
        Every request produces one record, written a few seconds after the response completes so
        that metering never adds latency:
      </P>
      <Table
        head={["Field", "Meaning"]}
        rows={[
          [<C key="1">request_id</C>, <>Matches <C>X-Ahura-Request-Id</C>.</>],
          [<C key="2">model_id</C>, "The catalog id that served the request."],
          [<C key="3">api_key</C>, "Which key made it, shown by name and masked prefix."],
          [<C key="4">input_tokens, output_tokens, cached_tokens</C>, "The counts the charge was computed from."],
          [<C key="5">cost_cents</C>, "What was charged."],
          [<C key="6">status</C>, <><C>success</C>, or an error class such as <C>error_rate_limit</C> or <C>error_upstream</C>.</>],
          [<C key="7">latency_ms</C>, "Time from request receipt to the last byte of the response."],
          [<C key="8">billed_to</C>, <><C>platform</C> or <C>byok</C>.</>],
          [<C key="9">cache_kind</C>, <><C>none</C> or <C>l1</C>.</>],
        ]}
      />
      <P>
        Prompts and completions are not part of the record. See{" "}
        <A href="/docs/inference/privacy">Privacy & data retention</A>.
      </P>

      <H2>Where to see it</H2>
      <P>
        <A href="/dashboard/services/inference/usage">Inference → Usage</A> shows month-to-date
        spend, requests, tokens and latency percentiles, broken down by model and by key, with
        cache hit rates, and exports the raw records as CSV for any window up to 90 days.{" "}
        <C>GET /v1/key</C> gives a service its own month-to-date spend without the dashboard.
      </P>
      <Callout kind="note" title="Balance">
        Inference is paid from the same AhuraSense balance as the rest of the platform. Top up
        under <A href="/dashboard/billing">Billing</A>; a spend cap on the organization keeps a
        runaway job from draining it. See{" "}
        <A href="/docs/inference/limits">Rate limits & spend caps</A>.
      </Callout>
    </DocPage>
  );
}
