import type { Metadata } from "next";
import { Code, CodeTabs } from "@/components/docs/code";
import { A, C, Callout, DocPage, H2, Li, Ol, P, Ul } from "@/components/docs/primitives";

export const metadata: Metadata = {
  title: "Tool calling — Inference API — AhuraSense Docs",
  description:
    "Function calling on the AhuraSense inference API in the OpenAI tool format: define tools, read the model's calls, return results, and stream them.",
};

const HREF = "/docs/inference/tool-calling";

export default function ToolCallingPage() {
  return (
    <DocPage
      href={HREF}
      eyebrow="Features"
      title="Tool calling"
      lede="Describe functions your code can run; the model decides when to call them and with what arguments. You run the function and send the result back. The format is OpenAI's, on every model whose catalog entry has tools set to true."
    >
      <H2>Define a tool</H2>
      <P>
        Each tool is a JSON Schema description of a function. Good descriptions matter more than
        clever prompting: the model reads them to decide when a call is appropriate.
      </P>
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
    "messages": [{"role": "user", "content": "What is the weather in Ahmedabad right now?"}],
    "tools": [{
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "Current weather for a city.",
        "parameters": {
          "type": "object",
          "properties": {
            "city": {"type": "string", "description": "City name"},
            "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]}
          },
          "required": ["city"]
        }
      }
    }],
    "tool_choice": "auto"
  }'`,
          },
          {
            label: "Python",
            lang: "python",
            code: `tools = [{
    "type": "function",
    "function": {
        "name": "get_weather",
        "description": "Current weather for a city.",
        "parameters": {
            "type": "object",
            "properties": {
                "city": {"type": "string", "description": "City name"},
                "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]},
            },
            "required": ["city"],
        },
    },
}]

first = client.chat.completions.create(
    model="anthropic/claude-sonnet-5",
    messages=[{"role": "user", "content": "What is the weather in Ahmedabad right now?"}],
    tools=tools,
    tool_choice="auto",
)
call = first.choices[0].message.tool_calls[0]
print(call.function.name, call.function.arguments)`,
          },
        ]}
      />

      <H2>Read the call</H2>
      <P>
        When the model wants a tool, the assistant message has <C>tool_calls</C> instead of
        content, and <C>finish_reason</C> is <C>tool_calls</C>. Arguments arrive as a JSON string
        you parse.
      </P>
      <Code lang="json" title="response">{`{
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": null,
      "tool_calls": [{
        "id": "call_7Qx2",
        "type": "function",
        "function": {
          "name": "get_weather",
          "arguments": "{\\"city\\":\\"Ahmedabad\\",\\"unit\\":\\"celsius\\"}"
        }
      }]
    },
    "finish_reason": "tool_calls"
  }]
}`}</Code>

      <H2>Return the result</H2>
      <P>
        Append the assistant message as-is, then one <C>tool</C> message per call with the
        matching <C>tool_call_id</C>, and send the conversation again. The model writes the final
        answer from the result.
      </P>
      <Code lang="python" title="second turn">{`import json

result = get_weather(**json.loads(call.function.arguments))

second = client.chat.completions.create(
    model="anthropic/claude-sonnet-5",
    messages=[
        {"role": "user", "content": "What is the weather in Ahmedabad right now?"},
        first.choices[0].message,
        {"role": "tool", "tool_call_id": call.id, "content": json.dumps(result)},
    ],
    tools=tools,
)
print(second.choices[0].message.content)`}</Code>

      <H2>Controlling when tools are used</H2>
      <Ul>
        <Li><C>&quot;tool_choice&quot;: &quot;auto&quot;</C>: the model decides. The default when tools are present.</Li>
        <Li><C>&quot;tool_choice&quot;: &quot;none&quot;</C>: never call a tool on this turn, even though tools are defined.</Li>
        <Li><C>&quot;tool_choice&quot;: &quot;required&quot;</C>: the model must call at least one tool.</Li>
        <Li><C>{`{"type":"function","function":{"name":"get_weather"}}`}</C>: force that tool.</Li>
      </Ul>
      <P>
        A model may return several calls in one turn. Run them all, return every result, then
        continue. Keep tool results compact: they are input tokens on the next turn.
      </P>

      <H2>Streaming tool calls</H2>
      <P>
        On a stream, tool calls arrive as fragments in <C>delta.tool_calls</C>: the first chunk
        for a call carries its <C>id</C> and <C>function.name</C>, later chunks carry pieces of{" "}
        <C>function.arguments</C>. Group by <C>index</C> and concatenate. The OpenAI SDKs expose
        this as a finished list once the stream ends; if you parse events yourself, do not try to
        parse the arguments until <C>finish_reason</C> arrives.
      </P>

      <H2>Practical notes</H2>
      <Ol>
        <Li>
          Check the <C>tools</C> capability in <A href="/docs/inference/models">the catalog</A>{" "}
          before sending tools to a model; a model without it ignores them or errors.
        </Li>
        <Li>
          Requests with tools are cacheable; the tool definitions are part of the cache key, so a
          changed schema is a cache miss.
        </Li>
        <Li>
          The Anthropic-compatible route passes Anthropic tool definitions through but does not
          stream tool use as structured blocks. Use this endpoint for streamed tool use.
        </Li>
      </Ol>
      <Callout kind="tip" title="Validate arguments">
        Treat <C>function.arguments</C> like any other user input: parse it, validate it against
        your schema, and never execute it as code. Models occasionally invent fields.
      </Callout>
    </DocPage>
  );
}
