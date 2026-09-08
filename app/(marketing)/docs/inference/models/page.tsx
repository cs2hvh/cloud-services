import { Code } from "@/components/docs/code";
import { docsMetadata } from "@/components/docs/metadata";
import { ModelsTable } from "@/components/docs/models-table";
import {
  A,
  C,
  Callout,
  DocPage,
  Endpoint,
  H2,
  Li,
  P,
  Strong,
  Table,
  Ul,
} from "@/components/docs/primitives";

export const metadata = docsMetadata({
  title: "Models — Inference API — AhuraSense Docs",
  description:
    "The live AhuraSense model catalog: ids, context windows, capabilities and per-token prices, and the GET /v1/models endpoint.",
  path: "/docs/inference/models",
});

// The table below is read from the catalog. Re-render at most every five
// minutes so a price or a new model shows up without a deploy.
export const revalidate = 300;

const HREF = "/docs/inference/models";

export default function ModelsPage() {
  return (
    <DocPage
      href={HREF}
      eyebrow="Inference API"
      title="Models"
      lede="One catalog, one id per model, one price list. The table on this page is read from the same source the API serves, so what you see here is what a request gets."
    >
      <H2>Model ids</H2>
      <P>
        Ids are namespaced by vendor, <C>anthropic/claude-sonnet-5</C>,{" "}
        <C>openai/gpt-5.5</C>, <C>zhipu/glm-5.3-flash</C>, and are used exactly as listed,
        including case. A request naming an id that is not in the catalog, or not in your key’s
        allowlist, is refused before anything is billed.
      </P>
      <P>
        Ids are stable. When a vendor renames a model upstream, the catalog id you integrated
        against keeps working.
      </P>

      <H2>List models</H2>
      <Endpoint method="GET" path="/v1/models" />
      <P>
        Returns every active model your key can call: the public catalog plus any models private
        to your organization, such as your own fine-tuned adapters. The shape is OpenAI’s list
        shape with extra fields per entry.
      </P>
      <Code lang="bash" title="request">{`curl https://api.ahurasense.com/v1/models \\
  -H "Authorization: Bearer $AHURA_API_KEY"`}</Code>
      <Code lang="json" title="response (one entry shown)">{`{
  "object": "list",
  "data": [
    {
      "id": "anthropic/claude-haiku-4.5",
      "object": "model",
      "created": 0,
      "owned_by": "ahura",
      "display_name": "Claude Haiku 4.5",
      "description": "Fast tier. 200K context. High-volume light workloads.",
      "modality": "chat",
      "capabilities": {
        "tools": true,
        "vision": false,
        "json_mode": true,
        "streaming": true,
        "max_output": 64000,
        "context_window": 200000
      },
      "pricing": {
        "input_cents_per_mtok": 100,
        "cached_cents_per_mtok": 10,
        "output_cents_per_mtok": 500
      },
      "off_peak": null,
      "featured": true
    }
  ]
}`}</Code>
      <Table
        head={["Field", "Meaning"]}
        rows={[
          [<C key="1">id</C>, "The catalog id to send as model."],
          [<C key="2">owned_by</C>, <><C>ahura</C> for the public catalog, <C>ahura-private</C> for models only your organization can see.</>],
          [<C key="3">modality</C>, <><C>chat</C> today. Other modalities appear here as they are added.</>],
          [<C key="4">capabilities</C>, <>What the model supports. <C>context_window</C> and <C>max_output</C> are in tokens.</>],
          [<C key="5">pricing</C>, <>Cents per million tokens, for input, cached input and output. <A href="/docs/inference/pricing">Pricing & usage</A>.</>],
          [<C key="6">off_peak</C>, <>Reserved for a discount window; <C>null</C> means the price applies at all hours.</>],
          [<C key="7">featured</C>, "A model we recommend starting with."],
        ]}
      />
      <Callout kind="tip" title="Select by capability, not by name">
        The <C>capabilities</C> block is there so code can pick a model: filter on{" "}
        <C>tools</C> before sending a function-calling request, or on{" "}
        <C>context_window</C> before sending a long document.
      </Callout>

      <H2>Hosted models</H2>
      <P>
        Most catalog models are served by partner backends. Some run on AhuraSense GPU
        infrastructure; the table marks them <Strong>hosted</Strong>, and responses from them
        carry <C>X-Ahura-Routing: managed</C>. Two things differ for hosted models:
      </P>
      <Ul>
        <Li>
          The response cache does not apply to them; every request reaches the model.
        </Li>
        <Li>
          If every replica is starting up, the gateway returns <C>503 instance_warming_up</C>{" "}
          with <C>Retry-After: 10</C>. Retry, and the request goes through.
        </Li>
      </Ul>

      <H2>Catalog</H2>
      <P>
        Prices are per million tokens. Context and max output are in tokens. Updated from the
        live catalog every few minutes.
      </P>
      <ModelsTable />
    </DocPage>
  );
}
