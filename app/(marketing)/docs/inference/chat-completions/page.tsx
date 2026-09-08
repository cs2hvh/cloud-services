import { Code, CodeTabs } from "@/components/docs/code";
import { docsMetadata } from "@/components/docs/metadata";
import {
  A,
  C,
  Callout,
  DocPage,
  Endpoint,
  H2,
  H3,
  Li,
  P,
  Params,
  Table,
  Ul,
} from "@/components/docs/primitives";

export const metadata = docsMetadata({
  title: "Chat completions — Inference API — AhuraSense Docs",
  description:
    "Reference for POST /v1/chat/completions on the AhuraSense inference API: every request parameter, the response, streaming, and the headers the gateway adds.",
  path: "/docs/inference/chat-completions",
});

const HREF = "/docs/inference/chat-completions";

export default function ChatCompletionsPage() {
  return (
    <DocPage
      href={HREF}
      eyebrow="API reference"
      title="Chat completions"
      lede="The main endpoint. Send a conversation, get the next assistant turn. The request and response follow the OpenAI Chat Completions format, so existing clients and frameworks work unchanged."
    >
      <Endpoint method="POST" path="/v1/chat/completions" />

      <H2>Request</H2>
      <CodeTabs
        tabs={[
          {
            label: "curl",
            lang: "bash",
            code: `curl https://api.ahurasense.com/v1/chat/completions \\
  -H "Authorization: Bearer $AHURA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "anthropic/claude-sonnet-5",
    "messages": [
      {"role": "system", "content": "You are a terse assistant."},
      {"role": "user", "content": "Explain rate limiting in two sentences."}
    ],
    "temperature": 0.3,
    "max_tokens": 200
  }'`,
          },
          {
            label: "Python",
            lang: "python",
            code: `completion = client.chat.completions.create(
    model="anthropic/claude-sonnet-5",
    messages=[
        {"role": "system", "content": "You are a terse assistant."},
        {"role": "user", "content": "Explain rate limiting in two sentences."},
    ],
    temperature=0.3,
    max_tokens=200,
)
print(completion.choices[0].message.content)`,
          },
          {
            label: "TypeScript",
            lang: "typescript",
            code: `const completion = await client.chat.completions.create({
  model: "anthropic/claude-sonnet-5",
  messages: [
    { role: "system", content: "You are a terse assistant." },
    { role: "user", content: "Explain rate limiting in two sentences." },
  ],
  temperature: 0.3,
  max_tokens: 200,
});
console.log(completion.choices[0].message.content);`,
          },
        ]}
      />

      <H3>Body parameters</H3>
      <Params
        items={[
          {
            name: "model",
            type: "string",
            required: true,
            children: (
              <>
                A catalog id from <A href="/docs/inference/models">Models</A>. Optional only when
                the request carries <C>X-Ahura-Preset</C>, in which case the preset’s model is used.
              </>
            ),
          },
          {
            name: "messages",
            type: "array",
            required: true,
            children: (
              <>
                The conversation so far, oldest first, at least one message. Roles are{" "}
                <C>system</C>, <C>developer</C>, <C>user</C>, <C>assistant</C> and <C>tool</C>.{" "}
                <C>content</C> is a string, an array of content parts, or <C>null</C> for an
                assistant message that only carries tool calls.
              </>
            ),
          },
          {
            name: "stream",
            type: "boolean",
            defaultValue: "false",
            children: (
              <>
                Return the answer as server-sent events as it is generated. See{" "}
                <A href="/docs/inference/streaming">Streaming</A>.
              </>
            ),
          },
          {
            name: "temperature",
            type: "number, 0 to 2",
            children: (
              <>
                Sampling temperature. <C>0</C> is deterministic and makes the request eligible for
                the response cache.
              </>
            ),
          },
          { name: "top_p", type: "number, 0 to 1", children: <>Nucleus sampling. Set this or temperature, not both.</> },
          {
            name: "max_tokens",
            type: "integer",
            children: (
              <>
                Upper bound on generated tokens. On models that reason before answering, the
                bound covers reasoning tokens too; a small value can leave no room for the visible
                answer. See <A href="/docs/inference/streaming#reasoning-tokens">reasoning tokens</A>.
              </>
            ),
          },
          { name: "n", type: "integer, 1 to 8", defaultValue: "1", children: <>How many alternative completions to generate. Each is billed.</> },
          { name: "stop", type: "string or array", children: <>Up to four sequences at which generation stops.</> },
          { name: "presence_penalty", type: "number, -2 to 2", children: <>Positive values push the model toward new topics.</> },
          { name: "frequency_penalty", type: "number, -2 to 2", children: <>Positive values discourage repeating the same lines.</> },
          {
            name: "tools",
            type: "array",
            children: (
              <>
                Functions the model may call, in the OpenAI tool format. See{" "}
                <A href="/docs/inference/tool-calling">Tool calling</A>.
              </>
            ),
          },
          {
            name: "tool_choice",
            type: "string or object",
            children: (
              <>
                <C>auto</C>, <C>none</C>, <C>required</C>, or{" "}
                <C>{`{"type":"function","function":{"name":"…"}}`}</C> to force one tool.
              </>
            ),
          },
          {
            name: "response_format",
            type: "object",
            children: (
              <>
                <C>{`{"type":"json_object"}`}</C> for JSON mode. See{" "}
                <A href="/docs/inference/structured-outputs">Structured outputs</A>.
              </>
            ),
          },
          { name: "seed", type: "integer", children: <>A best-effort request for repeatable sampling. Part of the cache key.</> },
          { name: "user", type: "string", children: <>Your identifier for the end user, for your own abuse tracking. Not part of the cache key and not stored on zero-retention keys.</> },
        ]}
      />
      <P>
        Other fields in the body are passed through to the model unchanged, so provider-specific
        options keep working where the model supports them. Unknown fields are never an error.
      </P>

      <H2>Response</H2>
      <P>A chat completion object. The fields below are always present.</P>
      <Code lang="json" title="200 OK">{`{
  "id": "chatcmpl-8f1c…",
  "object": "chat.completion",
  "created": 1757320000,
  "model": "claude-sonnet-5",
  "choices": [
    {
      "index": 0,
      "message": { "role": "assistant", "content": "Rate limiting caps how many requests …" },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 31,
    "completion_tokens": 48,
    "total_tokens": 79
  }
}`}</Code>
      <Table
        head={["Field", "Meaning"]}
        rows={[
          [<C key="1">choices[].message</C>, <>The assistant turn. Carries <C>tool_calls</C> instead of <C>content</C> when the model decided to call a tool.</>],
          [<C key="2">choices[].finish_reason</C>, <><C>stop</C>, <C>length</C> (hit <C>max_tokens</C>), <C>tool_calls</C>, or <C>content_filter</C>.</>],
          [<C key="3">usage</C>, <>Token counts the request is billed on. Some backends add <C>prompt_tokens_details.cached_tokens</C> or a <C>reasoning_tokens</C> count.</>],
          [<C key="4">model</C>, <>The backend’s own spelling of the model. Use the <C>X-Ahura-Model</C> header for the catalog id.</>],
        ]}
      />

      <H2>Headers</H2>
      <P>
        The gateway adds headers to every response. The ones you will use most:{" "}
        <C>X-Ahura-Request-Id</C> to identify a call, <C>X-Ahura-Model</C> for the id that
        served it, <C>X-Ahura-Cache</C> to see whether the cache answered, and{" "}
        <C>X-Ahura-RateLimit-Remaining</C> to pace yourself. The full list, and the optional
        request headers, are under <A href="/docs/inference/authentication#request-headers">Authentication</A>.
      </P>

      <H2>Multimodal content</H2>
      <P>
        A <C>user</C> message’s <C>content</C> may be an array of parts. Text parts are{" "}
        <C>{`{"type":"text","text":"…"}`}</C>; image parts are{" "}
        <C>{`{"type":"image_url","image_url":{"url":"…"}}`}</C> with an <C>https</C> URL or a{" "}
        <C>data:</C> URI. Check the model’s <C>vision</C> capability first; a model without it
        will refuse or ignore the image.
      </P>

      <H2>Errors</H2>
      <P>
        Every error is a JSON envelope with a <C>code</C> you can switch on. The codes specific to
        this endpoint:
      </P>
      <Ul>
        <Li><C>400 invalid_request</C>: the body failed validation; the message names the field.</Li>
        <Li><C>400 model_required</C>: no <C>model</C> and no preset that supplies one.</Li>
        <Li><C>403 model_not_allowed</C>: the key’s allowlist does not include this model.</Li>
        <Li><C>404 model_not_found</C>: not a catalog id.</Li>
        <Li><C>503 model_unavailable</C>: the model is in the catalog but switched off.</Li>
      </Ul>
      <P>
        The complete list, including authentication, cap and rate-limit responses, is on the{" "}
        <A href="/docs/inference/errors">Errors</A> page.
      </P>
      <Callout kind="tip" title="Idempotency">
        A request that fails with a network error after the gateway forwarded it may still have
        been generated and billed. Set <C>temperature</C> to <C>0</C> and retry: the second
        attempt is answered from the cache, with the prompt at the cached-input rate, instead of
        running the model twice.
      </Callout>
    </DocPage>
  );
}
