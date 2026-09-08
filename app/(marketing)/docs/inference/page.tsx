import { Code, CodeTabs } from "@/components/docs/code";
import { docsMetadata } from "@/components/docs/metadata";
import { ModelsList } from "@/components/docs/models-table";
import {
  A,
  C,
  Callout,
  DocPage,
  Endpoint,
  H2,
  H3,
  Li,
  Ol,
  P,
  Strong,
  Table,
  Ul,
} from "@/components/docs/primitives";

export const metadata = docsMetadata({
  title: "Overview — Inference API — AhuraSense Docs",
  description:
    "One OpenAI-compatible endpoint for frontier and open-source models, with an Anthropic-compatible route, streaming, tool calling and per-key controls.",
  path: "/docs/inference",
});

// The model list below is read from the catalog; refresh at most every five
// minutes so a new model or price shows up without a deploy.
export const revalidate = 300;

const HREF = "/docs/inference";

export default function InferenceOverview() {
  return (
    <DocPage
      href={HREF}
      eyebrow="Inference API"
      title="Overview"
      lede={
        <>
          The inference API serves frontier and open-source models behind one endpoint that
          speaks the OpenAI Chat Completions protocol, with an Anthropic Messages route for code
          written against that SDK. Point a client you already use at our base URL and it works.
        </>
      }
    >
      <H2>Base URL</H2>
      <Code lang="text" title="base url">{`https://api.ahurasense.com/v1`}</Code>
      <P>
        Every request needs an API key in the <C>Authorization</C> header. Keys are created in
        the dashboard under{" "}
        <A href="/dashboard/services/inference/api-keys">Inference → API keys</A> and start
        with <C>ahu_live_</C>. See <A href="/docs/inference/authentication">Authentication</A>.
      </P>

      <H2>Endpoints</H2>
      <Table
        head={["Endpoint", "What it does"]}
        rows={[
          [<C key="1">POST /v1/chat/completions</C>, <>OpenAI-compatible chat. Streaming, tool calling, JSON mode. <A href="/docs/inference/chat-completions">Reference</A>.</>],
          [<C key="2">POST /v1/messages</C>, <>Anthropic-compatible chat for existing Anthropic SDK code. <A href="/docs/inference/messages">Reference</A>.</>],
          [<C key="3">GET /v1/models</C>, <>The models your key can call, with capabilities and prices. <A href="/docs/inference/models">Models</A>.</>],
          [<C key="4">GET /v1/key</C>, <>What the calling key is allowed to do and what it has spent this month. <A href="/docs/inference/authentication#inspect-a-key">Details</A>.</>],
          [<C key="5">GET /v1/health</C>, <>Unauthenticated liveness check. Returns <C>{`{"status":"ok"}`}</C> with the gateway version.</>],
          [<C key="6">POST /v1/embeddings</C>, <>Not available at the moment. Returns <C>503 embeddings_unavailable</C> until an embeddings provider is configured.</>],
        ]}
      />

      <H2>Quickstart</H2>
      <Ol>
        <Li>
          <A href="/signup">Create an account</A>, then open{" "}
          <A href="/dashboard/services/inference/api-keys">Inference → API keys</A> and create a
          key. The full key is shown once.
        </Li>
        <Li>Put it in an environment variable and make the request below.</Li>
      </Ol>
      <CodeTabs
        tabs={[
          {
            label: "curl",
            lang: "bash",
            code: `curl https://api.ahurasense.com/v1/chat/completions \\
  -H "Authorization: Bearer $AHURA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "anthropic/claude-haiku-4.5",
    "messages": [
      {"role": "user", "content": "In one sentence, what is a GPU?"}
    ]
  }'`,
          },
          {
            label: "Python",
            lang: "python",
            code: `import os
from openai import OpenAI

client = OpenAI(
    base_url="https://api.ahurasense.com/v1",
    api_key=os.environ["AHURA_API_KEY"],
)

completion = client.chat.completions.create(
    model="anthropic/claude-haiku-4.5",
    messages=[{"role": "user", "content": "In one sentence, what is a GPU?"}],
)
print(completion.choices[0].message.content)`,
          },
          {
            label: "TypeScript",
            lang: "typescript",
            code: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://api.ahurasense.com/v1",
  apiKey: process.env.AHURA_API_KEY,
});

const completion = await client.chat.completions.create({
  model: "anthropic/claude-haiku-4.5",
  messages: [{ role: "user", content: "In one sentence, what is a GPU?" }],
});
console.log(completion.choices[0].message.content);`,
          },
        ]}
      />
      <P>The response is a standard chat completion object:</P>
      <Code lang="json" title="response">{`{
  "id": "chatcmpl-…",
  "object": "chat.completion",
  "model": "claude-haiku-4-5",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "A GPU is a processor built to run thousands of small calculations in parallel, which makes it fast at graphics and at training and running AI models."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": { "prompt_tokens": 16, "completion_tokens": 34, "total_tokens": 50 }
}`}</Code>
      <Callout kind="note" title="Which model answered">
        The <C>model</C> field in the body is whatever the serving backend reports and can use a
        different spelling from the id you sent. The <C>X-Ahura-Model</C> response header always
        carries the catalog id you asked for, and it is the id your usage is recorded under.
      </Callout>

      <H2>Available models</H2>
      <P>
        The public catalog, live. Prices are input / output per million tokens; models marked{" "}
        <Strong>hosted</Strong> run on AhuraSense GPU infrastructure. Context windows,
        capabilities and cached-input rates are on the{" "}
        <A href="/docs/inference/models">Models</A> page, and <C>GET /v1/models</C> returns the
        same list to your code.
      </P>
      <ModelsList />

      <H2>What happens to a request</H2>
      <P>Every call passes through the same steps, in this order, at the edge closest to you:</P>
      <Ol>
        <Li>
          <Strong>Authentication.</Strong> The key is hashed and looked up. Expired keys, keys
          called from an address outside their IP allowlist, and unknown keys get <C>401</C>.
        </Li>
        <Li>
          <Strong>Spend cap.</Strong> If the key or the organization has a monthly hard cap and it
          is reached, the request stops with <C>402</C>.
        </Li>
        <Li>
          <Strong>Rate limit.</Strong> A per-key token bucket. Over the limit is <C>429</C> with{" "}
          <C>Retry-After</C>.
        </Li>
        <Li>
          <Strong>Validation and routing.</Strong> The body is checked, the model is resolved
          (directly or through a <A href="/docs/inference/presets">preset</A>), and the key’s
          model allowlist is applied.
        </Li>
        <Li>
          <Strong>Guardrail.</Strong> Prompt text is scanned for injection patterns; by default the
          result is only annotated on the response. <A href="/docs/inference/guardrails">Guardrails</A>.
        </Li>
        <Li>
          <Strong>Cache.</Strong> Deterministic, non-streaming requests can be answered from the
          exact-match cache. <A href="/docs/inference/caching">Caching</A>.
        </Li>
        <Li>
          <Strong>The model.</Strong> The request is forwarded to the model’s serving backend and
          the answer is streamed or returned to you unchanged.
        </Li>
      </Ol>
      <P>
        Usage is recorded after the response completes, so metering never adds latency to the
        call itself. Every response carries <C>X-Ahura-Request-Id</C>; quote it when you contact
        support and we can find the exact request.
      </P>

      <H2>Managed in the dashboard</H2>
      <P>
        Some features are configured in the dashboard rather than through the API, and then apply
        to your requests automatically:
      </P>
      <Ul>
        <Li>
          <Strong>API keys</Strong>: model allowlists, IP allowlists, expiry, rate limits, spend
          caps, zero data retention.
        </Li>
        <Li>
          <Strong>Presets</Strong>: named default models you switch without a deploy.
        </Li>
        <Li>
          <Strong>Usage and audit</Strong>: per-key and per-model spend, latency percentiles, a CSV
          export, and an audit trail of every change to your account.
        </Li>
        <Li>
          <Strong>Batches, fine-tuning, vector collections, notifications</Strong>: available
          from the dashboard today; API access to these is on the roadmap.
        </Li>
      </Ul>

      <H3>Where next</H3>
      <P>
        Read <A href="/docs/inference/chat-completions">Chat completions</A> for every parameter,
        or <A href="/docs/inference/sdks">SDKs & frameworks</A> if you already have code that
        talks to OpenAI or Anthropic.
      </P>
      <Endpoint method="POST" path="/v1/chat/completions" />
    </DocPage>
  );
}
