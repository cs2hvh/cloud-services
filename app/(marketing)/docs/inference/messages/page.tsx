import type { Metadata } from "next";
import { Code, CodeTabs } from "@/components/docs/code";
import {
  A,
  C,
  Callout,
  DocPage,
  Endpoint,
  H2,
  Li,
  P,
  Params,
  Table,
  Ul,
} from "@/components/docs/primitives";

export const metadata: Metadata = {
  title: "Messages — Inference API — AhuraSense Docs",
  description:
    "Reference for POST /v1/messages, the Anthropic-compatible endpoint on the AhuraSense inference API.",
};

const HREF = "/docs/inference/messages";

export default function MessagesPage() {
  return (
    <DocPage
      href={HREF}
      eyebrow="API reference"
      title="Messages"
      lede="An Anthropic Messages API endpoint, for code written against the Anthropic SDK. The gateway translates to the model's native protocol and back, so any chat model in the catalog can be called this way, not only Anthropic’s."
    >
      <Endpoint method="POST" path="/v1/messages" />

      <H2>Request</H2>
      <CodeTabs
        tabs={[
          {
            label: "curl",
            lang: "bash",
            code: `curl https://api.ahurasense.com/v1/messages \\
  -H "x-api-key: $AHURA_API_KEY" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "anthropic/claude-sonnet-5",
    "max_tokens": 256,
    "system": "You are a terse assistant.",
    "messages": [
      {"role": "user", "content": "Explain rate limiting in two sentences."}
    ]
  }'`,
          },
          {
            label: "Python",
            lang: "python",
            code: `import os
from anthropic import Anthropic

client = Anthropic(base_url="https://api.ahurasense.com", api_key=os.environ["AHURA_API_KEY"])

message = client.messages.create(
    model="anthropic/claude-sonnet-5",
    max_tokens=256,
    system="You are a terse assistant.",
    messages=[{"role": "user", "content": "Explain rate limiting in two sentences."}],
)
print(message.content[0].text)`,
          },
          {
            label: "TypeScript",
            lang: "typescript",
            code: `import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ baseURL: "https://api.ahurasense.com", apiKey: process.env.AHURA_API_KEY });

const message = await client.messages.create({
  model: "anthropic/claude-sonnet-5",
  max_tokens: 256,
  system: "You are a terse assistant.",
  messages: [{ role: "user", content: "Explain rate limiting in two sentences." }],
});`,
          },
        ]}
      />
      <Callout kind="note" title="Base URL for the Anthropic SDKs">
        The Anthropic SDKs add <C>/v1/messages</C> themselves. Give them{" "}
        <C>https://api.ahurasense.com</C>, without <C>/v1</C>. They send the key as{" "}
        <C>x-api-key</C>, which the gateway accepts alongside <C>Authorization</C>.
      </Callout>

      <Params
        items={[
          { name: "model", type: "string", required: true, children: <>A catalog id. Any chat model works, not only Anthropic’s.</> },
          { name: "max_tokens", type: "integer", required: true, children: <>Upper bound on generated tokens, reasoning included on models that reason.</> },
          {
            name: "messages",
            type: "array",
            required: true,
            children: (
              <>
                Alternating <C>user</C> and <C>assistant</C> turns. <C>content</C> is a string or
                an array of blocks: <C>text</C>, <C>image</C> (base64 source), <C>tool_use</C> and{" "}
                <C>tool_result</C>.
              </>
            ),
          },
          { name: "system", type: "string or array", children: <>The system prompt, as a string or text blocks.</> },
          { name: "stream", type: "boolean", defaultValue: "false", children: <>Anthropic-style event stream. See below.</> },
          { name: "temperature", type: "number, 0 to 1", children: <>Anthropic’s range. Mapped onto the model unchanged.</> },
          { name: "top_p", type: "number, 0 to 1", children: <>Nucleus sampling.</> },
          { name: "top_k", type: "integer", children: <>Passed through where the model supports it.</> },
          { name: "stop_sequences", type: "array of strings", children: <>Sequences at which generation stops.</> },
          { name: "tools", type: "array", children: <>Anthropic tool definitions, passed through.</> },
          { name: "tool_choice", type: "object", children: <>Anthropic tool choice, passed through.</> },
          { name: "metadata.user_id", type: "string", children: <>Your identifier for the end user.</> },
        ]}
      />

      <H2>Response</H2>
      <P>A native Anthropic message object:</P>
      <Code lang="json" title="200 OK">{`{
  "id": "msg_…",
  "type": "message",
  "role": "assistant",
  "model": "anthropic/claude-sonnet-5",
  "content": [{ "type": "text", "text": "Rate limiting caps how many requests …" }],
  "stop_reason": "end_turn",
  "stop_sequence": null,
  "usage": {
    "input_tokens": 31,
    "output_tokens": 48,
    "cache_creation_input_tokens": 0,
    "cache_read_input_tokens": 0
  }
}`}</Code>
      <P>
        Errors use Anthropic’s envelope, <C>{`{"type":"error","error":{"type":"…","message":"…"}}`}</C>,
        with the same status codes as the rest of the API. <C>X-Ahura-Request-Id</C> is on every
        response.
      </P>

      <H2>Streaming</H2>
      <P>
        With <C>stream: true</C> the response is a stream of named events in Anthropic’s order:
      </P>
      <Table
        head={["Event", "Carries"]}
        rows={[
          [<C key="1">message_start</C>, "The message envelope with empty content and the input token count."],
          [<C key="2">content_block_start</C>, "The opening of the text block."],
          [<C key="3">content_block_delta</C>, <>A <C>text_delta</C> with the next piece of text. Repeated.</>],
          [<C key="4">content_block_stop</C>, "The block is complete."],
          [<C key="5">message_delta</C>, <>The <C>stop_reason</C> and the output token count.</>],
          [<C key="6">message_stop</C>, "End of the message."],
        ]}
      />
      <P>The Anthropic SDKs’ streaming helpers consume this without changes.</P>

      <H2>Differences from Anthropic’s API</H2>
      <Ul>
        <Li>Tool use in a stream arrives as text deltas; tool calls are not streamed as structured blocks. Non-streaming tool use is passed through.</Li>
        <Li><C>cache_control</C> hints on content blocks are accepted and ignored.</Li>
        <Li>Images must be base64 sources; URL sources are not translated.</Li>
        <Li>Container and code-execution tools are not available.</Li>
      </Ul>
      <P>
        For new integrations, <A href="/docs/inference/chat-completions">Chat completions</A> is
        the fuller endpoint. This route exists so that existing Anthropic code can move without a
        rewrite.
      </P>
    </DocPage>
  );
}
