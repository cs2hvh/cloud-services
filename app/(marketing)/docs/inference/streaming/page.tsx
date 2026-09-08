import type { Metadata } from "next";
import { Code, CodeTabs } from "@/components/docs/code";
import { A, C, Callout, DocPage, H2, Li, P, Ul } from "@/components/docs/primitives";

export const metadata: Metadata = {
  title: "Streaming — Inference API — AhuraSense Docs",
  description:
    "Streaming responses from the AhuraSense inference API: the server-sent event format, usage on a stream, cancellation, and reasoning tokens.",
};

const HREF = "/docs/inference/streaming";

export default function StreamingPage() {
  return (
    <DocPage
      href={HREF}
      eyebrow="API reference"
      title="Streaming"
      lede="Set stream to true and tokens arrive as they are generated, as server-sent events. The first token typically lands within a second; the whole answer follows at the model's speed."
    >
      <H2>Request</H2>
      <CodeTabs
        tabs={[
          {
            label: "curl",
            lang: "bash",
            code: `curl -N https://api.ahurasense.com/v1/chat/completions \\
  -H "Authorization: Bearer $AHURA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "anthropic/claude-haiku-4.5",
    "messages": [{"role": "user", "content": "Count from 1 to 5."}],
    "stream": true
  }'`,
          },
          {
            label: "Python",
            lang: "python",
            code: `stream = client.chat.completions.create(
    model="anthropic/claude-haiku-4.5",
    messages=[{"role": "user", "content": "Count from 1 to 5."}],
    stream=True,
)
for chunk in stream:
    delta = chunk.choices[0].delta.content if chunk.choices else None
    if delta:
        print(delta, end="", flush=True)`,
          },
          {
            label: "TypeScript",
            lang: "typescript",
            code: `const stream = await client.chat.completions.create({
  model: "anthropic/claude-haiku-4.5",
  messages: [{ role: "user", content: "Count from 1 to 5." }],
  stream: true,
});
for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
}`,
          },
        ]}
      />

      <H2>Wire format</H2>
      <P>
        The response has <C>Content-Type: text/event-stream</C>. Each event is a{" "}
        <C>data:</C> line holding one <C>chat.completion.chunk</C> object; the stream ends with{" "}
        <C>data: [DONE]</C>.
      </P>
      <Code lang="text" title="stream">{`data: {"id":"chatcmpl-…","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}

data: {"id":"chatcmpl-…","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"1"},"finish_reason":null}]}

data: {"id":"chatcmpl-…","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":", 2, 3, 4, 5"},"finish_reason":null}]}

data: {"id":"chatcmpl-…","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: {"id":"chatcmpl-…","object":"chat.completion.chunk","choices":[],"usage":{"prompt_tokens":15,"completion_tokens":11,"total_tokens":26}}

data: [DONE]`}</Code>
      <Ul>
        <Li>
          Concatenate <C>choices[0].delta.content</C> across chunks to rebuild the answer.
        </Li>
        <Li>
          Tool calls stream as <C>delta.tool_calls</C> fragments with an <C>index</C>; append the{" "}
          <C>arguments</C> strings per index. The OpenAI SDKs do this for you.
        </Li>
        <Li>
          The last chunk before <C>[DONE]</C> carries <C>usage</C>. That is the count the request
          is billed on, so keep reading until the end if you meter on your side too.
        </Li>
      </Ul>

      <H2>Headers on a stream</H2>
      <P>
        Headers are sent before the first token, so anything that depends on the outcome is not
        in them. <C>X-Ahura-Request-Id</C>, <C>X-Ahura-Model</C> and{" "}
        <C>X-Ahura-RateLimit-Remaining</C> are present as usual; <C>X-Ahura-Cache</C> is{" "}
        <C>streaming-skipped</C>, because streamed answers are not served from or written to the
        cache.
      </P>

      <H2>Cancellation</H2>
      <P>
        Close the connection and generation stops upstream. You are billed for the tokens
        generated up to that point, as reported by the backend. The SDKs cancel on{" "}
        <C>break</C> out of the loop or on an abort signal.
      </P>

      <H2 id="reasoning-tokens">Reasoning tokens</H2>
      <P>
        Several catalog models think before they answer. Those thinking tokens count against{" "}
        <C>max_tokens</C> and are billed as output, and they are reported in <C>usage</C> as{" "}
        <C>reasoning_tokens</C> or under <C>completion_tokens_details</C>, depending on the
        backend. The visible answer only begins once thinking ends.
      </P>
      <Callout kind="warn" title="A small max_tokens can return an empty answer">
        With <C>max_tokens: 64</C>, a reasoning model may spend all 64 tokens thinking and return{" "}
        <C>content: &quot;&quot;</C> with <C>finish_reason: &quot;length&quot;</C>. Give
        reasoning models a few hundred tokens of headroom, or leave <C>max_tokens</C> unset.
      </Callout>

      <H2>Timeouts</H2>
      <P>
        A streamed response can stay open for as long as the model generates. Set your client’s
        read timeout with that in mind; the SDK defaults are fine. If nothing has arrived after
        the connection opened, the model is still working on the first token, not stalled: the
        headers only tell you the request was accepted.
      </P>
      <P>
        The Anthropic-compatible route streams too, with Anthropic’s event names; see{" "}
        <A href="/docs/inference/messages#streaming">Messages</A>.
      </P>
    </DocPage>
  );
}
