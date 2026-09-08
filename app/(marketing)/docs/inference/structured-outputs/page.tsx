import { Code } from "@/components/docs/code";
import { docsMetadata } from "@/components/docs/metadata";
import { A, C, Callout, DocPage, H2, Li, P, Ul } from "@/components/docs/primitives";

export const metadata = docsMetadata({
  title: "Structured outputs — Inference API — AhuraSense Docs",
  description:
    "Getting reliably parseable JSON from the AhuraSense inference API: JSON mode, schemas, and the prompt habits that make them work.",
  path: "/docs/inference/structured-outputs",
});

const HREF = "/docs/inference/structured-outputs";

export default function StructuredOutputsPage() {
  return (
    <DocPage
      href={HREF}
      eyebrow="Features"
      title="Structured outputs"
      lede="When the answer feeds a program rather than a person, ask for JSON. JSON mode makes the model emit a single valid JSON object; a schema in the prompt makes it the object you expect."
    >
      <H2>JSON mode</H2>
      <P>
        Set <C>response_format</C> to <C>{`{"type":"json_object"}`}</C> on any model whose catalog
        entry has <C>json_mode</C> true. The model then returns a syntactically valid JSON object
        and nothing else: no prose around it, no code fences.
      </P>
      <Code lang="bash" title="curl">{`curl https://api.ahurasense.com/v1/chat/completions \\
  -H "Authorization: Bearer $AHURA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "openai/gpt-5.4-mini",
    "response_format": {"type": "json_object"},
    "messages": [
      {"role": "system", "content": "Extract the fields. Reply with a JSON object with keys name, email, intent (one of: sales, support, other)."},
      {"role": "user", "content": "Hi, Priya here (priya@example.com). My invoice from last month looks wrong."}
    ]
  }'`}</Code>
      <Code lang="json" title="message.content, parsed">{`{ "name": "Priya", "email": "priya@example.com", "intent": "support" }`}</Code>
      <Callout kind="warn" title="Say the word JSON in the prompt">
        Models that implement JSON mode require the word &quot;JSON&quot; to appear in a system
        or user message, and some return an error without it. Naming the keys you want in the
        same sentence is what makes the shape predictable.
      </Callout>

      <H2>Schemas</H2>
      <P>
        JSON mode guarantees valid JSON, not a particular shape. To pin the shape, put the schema in
        the prompt, in words or as a JSON Schema block, and validate the answer on your side. On
        backends that support it, a <C>response_format</C> of type <C>json_schema</C> is passed
        through unchanged and enforces the schema at generation time; where the backend does not
        support it, the request is refused with <C>upstream_rejected_request</C>, so keep the
        prompt-plus-validation path as the fallback.
      </P>
      <Code lang="python" title="pydantic">{`from pydantic import BaseModel, EmailStr
from typing import Literal

class Lead(BaseModel):
    name: str
    email: EmailStr
    intent: Literal["sales", "support", "other"]

completion = client.chat.completions.create(
    model="openai/gpt-5.4-mini",
    response_format={"type": "json_object"},
    messages=[
        {"role": "system", "content": f"Reply with JSON matching this schema: {Lead.model_json_schema()}"},
        {"role": "user", "content": text},
    ],
    temperature=0,
)
lead = Lead.model_validate_json(completion.choices[0].message.content)`}</Code>

      <H2>Tool calling as structured output</H2>
      <P>
        Another reliable route is a single tool whose parameters are the schema you want, with{" "}
        <C>tool_choice</C> forcing that tool. The arguments come back typed by the schema and
        many models are more accurate this way than with free-form JSON. See{" "}
        <A href="/docs/inference/tool-calling">Tool calling</A>.
      </P>

      <H2>Habits that help</H2>
      <Ul>
        <Li>Use <C>temperature: 0</C>. Extraction wants the most likely answer, and it makes repeats cacheable.</Li>
        <Li>Give one example of the exact object you want when the shape has nesting.</Li>
        <Li>Set a <C>max_tokens</C> large enough for the whole object; a truncated object is not valid JSON.</Li>
        <Li>Validate. A schema violation should be a retry with the error appended to the conversation, not a crash.</Li>
      </Ul>
    </DocPage>
  );
}
