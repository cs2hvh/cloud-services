import { Code } from "@/components/docs/code";
import { docsMetadata } from "@/components/docs/metadata";
import { A, C, Callout, DocPage, H2, H3, P } from "@/components/docs/primitives";

export const metadata = docsMetadata({
  title: "SDKs & frameworks — Inference API — AhuraSense Docs",
  description:
    "Use the AhuraSense inference API from the OpenAI and Anthropic SDKs, LangChain, the Vercel AI SDK, or plain HTTP.",
  path: "/docs/inference/sdks",
});

const HREF = "/docs/inference/sdks";

export default function SdksPage() {
  return (
    <DocPage
      href={HREF}
      eyebrow="Inference API"
      title="SDKs & frameworks"
      lede="There is no AhuraSense SDK, on purpose. The API speaks the OpenAI and Anthropic protocols, so the official SDKs for those, and every framework built on them, work by changing the base URL."
    >
      <H2>OpenAI SDK</H2>
      <P>
        The base URL includes <C>/v1</C>; the SDK appends the endpoint path.
      </P>
      <H3>Python</H3>
      <Code lang="python" title="pip install openai">{`import os
from openai import OpenAI

client = OpenAI(
    base_url="https://api.ahurasense.com/v1",
    api_key=os.environ["AHURA_API_KEY"],
)

completion = client.chat.completions.create(
    model="openai/gpt-5.4-mini",
    messages=[{"role": "user", "content": "Hello"}],
)
print(completion.choices[0].message.content)`}</Code>
      <H3>TypeScript / Node</H3>
      <Code lang="typescript" title="npm install openai">{`import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://api.ahurasense.com/v1",
  apiKey: process.env.AHURA_API_KEY,
});

const completion = await client.chat.completions.create({
  model: "openai/gpt-5.4-mini",
  messages: [{ role: "user", content: "Hello" }],
});
console.log(completion.choices[0].message.content);`}</Code>

      <H2>Anthropic SDK</H2>
      <P>
        The Anthropic SDKs append <C>/v1/messages</C> themselves, so the base URL here is the
        host <em>without</em> <C>/v1</C>. They send the key as <C>x-api-key</C>, which the gateway
        accepts. The model must be a catalog id, and it does not have to be an Anthropic model:
        the route translates to and from the OpenAI format for any chat model.
      </P>
      <H3>Python</H3>
      <Code lang="python" title="pip install anthropic">{`import os
from anthropic import Anthropic

client = Anthropic(
    base_url="https://api.ahurasense.com",
    api_key=os.environ["AHURA_API_KEY"],
)

message = client.messages.create(
    model="anthropic/claude-sonnet-5",
    max_tokens=512,
    messages=[{"role": "user", "content": "Hello"}],
)
print(message.content[0].text)`}</Code>
      <H3>TypeScript / Node</H3>
      <Code lang="typescript" title="npm install @anthropic-ai/sdk">{`import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  baseURL: "https://api.ahurasense.com",
  apiKey: process.env.AHURA_API_KEY,
});

const message = await client.messages.create({
  model: "anthropic/claude-sonnet-5",
  max_tokens: 512,
  messages: [{ role: "user", content: "Hello" }],
});
console.log(message.content[0].type === "text" ? message.content[0].text : "");`}</Code>
      <Callout kind="note" title="What the Messages route does not do yet">
        Tool use is streamed as text deltas only, and <C>cache_control</C> hints are ignored. See{" "}
        <A href="/docs/inference/messages">Messages</A>.
      </Callout>

      <H2>LangChain</H2>
      <Code lang="python" title="pip install langchain-openai">{`import os
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(
    model="anthropic/claude-haiku-4.5",
    base_url="https://api.ahurasense.com/v1",
    api_key=os.environ["AHURA_API_KEY"],
)
print(llm.invoke("Hello").content)`}</Code>

      <H2>Vercel AI SDK</H2>
      <Code lang="typescript" title="npm install ai @ai-sdk/openai">{`import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";

const ahura = createOpenAI({
  baseURL: "https://api.ahurasense.com/v1",
  apiKey: process.env.AHURA_API_KEY,
});

const { text } = await generateText({
  model: ahura.chat("anthropic/claude-haiku-4.5"),
  prompt: "Hello",
});`}</Code>

      <H2>OpenCode</H2>
      <P>
        OpenCode takes custom OpenAI-compatible providers from <C>opencode.json</C>, in the
        project or under <C>~/.config/opencode/</C>. The <C>models</C> block is the list its picker
        shows; <C>name</C> is the label, the key is the catalog id it sends. Keep the API key in
        an environment variable, as below, so the file can live in a repository.
      </P>
      <Code lang="json" title="opencode.json">{`{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "ahurasense": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "AhuraSense",
      "options": {
        "baseURL": "https://api.ahurasense.com/v1",
        "apiKey": "{env:AHURA_API_KEY}"
      },
      "models": {
        "anthropic/claude-sonnet-5": {
          "name": "Claude Sonnet 5",
          "limit": { "context": 1000000, "output": 128000 }
        },
        "zhipu/glm-5.3-flash-uncensored": {
          "name": "Z.AI / GLM 5.3 Flash Uncensored",
          "limit": { "context": 1048576, "output": 131072 }
        },
        "qwen/qwen3.8-flash-next-uncensored": {
          "name": "Qwen / Qwen3.8 Flash Next Uncensored",
          "limit": { "context": 262144, "output": 65536 }
        }
      }
    }
  },
  "model": "ahurasense/anthropic/claude-sonnet-5"
}`}</Code>
      <P>
        Switch models inside OpenCode with <C>/models</C>, or start it with{" "}
        <C>opencode -m ahurasense/zhipu/glm-5.3-flash-uncensored</C>. OpenCode sends{" "}
        <C>reasoning_effort</C> when you set a reasoning level, which the hosted models honour
        directly.
      </P>

      <H2>Plain HTTP</H2>
      <P>
        Anything that can send JSON over HTTPS works. The request and response shapes are on the{" "}
        <A href="/docs/inference/chat-completions">Chat completions</A> page; streaming is
        server-sent events, described under <A href="/docs/inference/streaming">Streaming</A>.
      </P>
      <Code lang="bash" title="curl">{`curl https://api.ahurasense.com/v1/chat/completions \\
  -H "Authorization: Bearer $AHURA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"anthropic/claude-haiku-4.5","messages":[{"role":"user","content":"Hello"}]}'`}</Code>

      <H2>Retries</H2>
      <P>
        The OpenAI and Anthropic SDKs retry <C>429</C> and <C>5xx</C> responses with backoff by
        default, and both honour <C>Retry-After</C>. That covers the two retryable situations the
        gateway produces: a rate limit, and a hosted model whose replicas are still starting.
        Do not retry <C>400</C>, <C>401</C>, <C>402</C> or <C>403</C>; those need a change on
        your side. See <A href="/docs/inference/errors">Errors</A>.
      </P>
    </DocPage>
  );
}
