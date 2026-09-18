import { Code, CodeTabs } from "@/components/docs/code";
import { docsMetadata } from "@/components/docs/metadata";
import { A, C, Callout, DocPage, Endpoint, H2, Li, P, Params, Table, Ul } from "@/components/docs/primitives";

export const metadata = docsMetadata({
  title: "Images — Inference API — AhuraSense Docs",
  description:
    "POST /v1/images/generations: generate one image from a prompt in the OpenAI Images format, returned as base64 and billed per image.",
  path: "/docs/inference/images",
});

const HREF = "/docs/inference/images";

export default function ImagesPage() {
  return (
    <DocPage
      href={HREF}
      eyebrow="API reference"
      title="Images"
      lede="Generate an image from a prompt. The request is the OpenAI Images format, so the OpenAI SDKs work unchanged; the image comes back as base64 in the response, one per request."
    >
      <Endpoint method="POST" path="/v1/images/generations" />

      <H2>Request</H2>
      <CodeTabs
        tabs={[
          {
            label: "curl",
            lang: "bash",
            code: `curl https://api.ahurasense.com/v1/images/generations \\
  -H "Authorization: Bearer $AHURA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "openai/gpt-image-2.5",
    "prompt": "A small red kite over a green hill, flat illustration",
    "size": "1024x1024"
  }'`,
          },
          {
            label: "Python",
            lang: "python",
            code: `import base64
from openai import OpenAI

client = OpenAI(base_url="https://api.ahurasense.com/v1", api_key=os.environ["AHURA_API_KEY"])

result = client.images.generate(
    model="openai/gpt-image-2.5",
    prompt="A small red kite over a green hill, flat illustration",
    size="1024x1024",
)
with open("kite.png", "wb") as f:
    f.write(base64.b64decode(result.data[0].b64_json))`,
          },
          {
            label: "TypeScript",
            lang: "typescript",
            code: `import OpenAI from "openai";
import { writeFileSync } from "node:fs";

const client = new OpenAI({ baseURL: "https://api.ahurasense.com/v1", apiKey: process.env.AHURA_API_KEY });

const result = await client.images.generate({
  model: "openai/gpt-image-2.5",
  prompt: "A small red kite over a green hill, flat illustration",
  size: "1024x1024",
});
writeFileSync("kite.png", Buffer.from(result.data[0].b64_json!, "base64"));`,
          },
        ]}
      />
      <Params
        items={[
          { name: "model", type: "string", required: true, children: <>A catalog id whose modality is <C>image</C>. See <A href="/docs/inference/models">Models</A>.</> },
          { name: "prompt", type: "string", required: true, children: <>What to draw, up to 4,000 characters.</> },
          { name: "size", type: "string", children: <>Width by height, such as <C>1024x1024</C>. Each model lists its sizes in <C>capabilities.sizes</C>; omit it for the model’s default. The size decides the price tier.</> },
          { name: "n", type: "integer", defaultValue: "1", children: <>Only <C>1</C> is accepted. Send several requests for several images.</> },
          { name: "response_format", type: "string", defaultValue: "b64_json", children: <>Only <C>b64_json</C> is available; <C>url</C> is refused with <C>400</C>.</> },
          { name: "user", type: "string", children: <>An identifier for your end user, passed through.</> },
        ]}
      />

      <H2>Response</H2>
      <Code lang="json" title="response">{`{
  "created": 1789744085,
  "data": [
    {
      "b64_json": "iVBORw0KGgoAAAANSUhEUgAABgAAAAQACAIAAACoEwUVAAB…",
      "revised_prompt": "Flat vector-style illustration: a small bright red diamond kite…"
    }
  ]
}`}</Code>
      <P>
        <C>b64_json</C> is the PNG, base64-encoded; decode it and write the bytes. A 1024×1024
        image is roughly 1.5 MB of base64. <C>revised_prompt</C> is present when the model
        rewrote the prompt before drawing. The usual headers apply:{" "}
        <C>X-Ahura-Request-Id</C> and <C>X-Ahura-Model</C>.
      </P>

      <H2>Timing and billing</H2>
      <Ul>
        <Li>Generation is synchronous and takes roughly 10 to 30 seconds. Set your client timeout accordingly.</Li>
        <Li>Billed per image, at the tier the requested size falls in. The rate is in the model’s <C>prices</C> block from <C>GET /v1/models</C>; a failed request is not charged.</Li>
        <Li>Image requests do not use the response cache and are not rate-limited differently from chat.</Li>
      </Ul>

      <H2>Errors</H2>
      <Table
        head={["Status", "Code", "Meaning"]}
        rows={[
          ["400", <C key="1">size_unsupported</C>, "The size is not one the model offers; the message lists them."],
          ["400", <C key="2">response_format_unsupported</C>, <>Only <C>b64_json</C> is available.</>],
          ["400", <C key="3">n_unsupported</C>, "One image per request."],
          ["400", <C key="4">model_wrong_modality</C>, "The model is not an image model."],
          ["404", <C key="5">model_not_found</C>, "Not in the catalog, or not in your key’s allowlist."],
          ["503", <C key="6">media_unavailable</C>, "The image service is down or overloaded. Retry after a few seconds."],
        ]}
      />
      <Callout kind="note" title="Not yet">
        Image editing with input images and streamed partial images are not available on this
        route yet.
      </Callout>
    </DocPage>
  );
}
