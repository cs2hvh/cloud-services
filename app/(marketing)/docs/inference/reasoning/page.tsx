import { Code, CodeTabs } from "@/components/docs/code";
import { docsMetadata } from "@/components/docs/metadata";
import { A, C, Callout, DocPage, H2, H3, Li, P, Table, Ul } from "@/components/docs/primitives";

export const metadata = docsMetadata({
  title: "Reasoning effort — Inference API — AhuraSense Docs",
  description:
    "Control how much a hosted model thinks before it answers: the effort ladder, an exact token budget, no-think mode, and the same controls from the Anthropic-compatible route.",
  path: "/docs/inference/reasoning",
});

const HREF = "/docs/inference/reasoning";

export default function ReasoningPage() {
  return (
    <DocPage
      href={HREF}
      eyebrow="Features"
      title="Reasoning effort"
      lede="Models that think before they answer spend tokens on the thinking, and you pay for those and wait for them. On the models AhuraSense hosts, you decide how much: a level on a ladder, an exact budget, or none at all."
    >
      <H2>Which models</H2>
      <P>
        These controls apply to the hosted models in the catalog, the ones marked{" "}
        <C>hosted</C> on the <A href="/docs/inference/models">Models</A> page, such as{" "}
        <C>zhipu/glm-5.3-flash-uncensored</C>. Their default is unbounded thinking, so a request that
        says nothing gets the fullest answer and the largest bill. Partner-served models keep
        whatever reasoning behaviour their vendor defines; the fields below are passed through
        to them unchanged and take effect only where the vendor supports them.
      </P>

      <H2>The ladder</H2>
      <P>
        Send <C>reasoning_effort</C> at the top level of a chat-completions request. The last
        column is what one hard prompt actually spent on thinking at each level.
      </P>
      <Table
        head={["Value", "Behaviour", "Thinking tokens on a hard prompt"]}
        rows={[
          [<><C>none</C> / <C>minimal</C> / <C>off</C></>, "Answers immediately, no reasoning.", "1"],
          [<C key="l">low</C>, "Rarely thinks.", "1"],
          [<C key="m">medium</C>, "Thinks, capped at 1,024 tokens.", "1,025"],
          [<C key="h">high</C>, "Thinks, capped at 4,096 tokens.", "4,097"],
          [<><C>xhigh</C> / <C>max</C> / nothing sent</>, "Unbounded thinking. The default.", "6,023"],
        ]}
      />
      <CodeTabs
        tabs={[
          {
            label: "curl",
            lang: "bash",
            code: `curl https://api.ahurasense.com/v1/chat/completions \\
  -H "Authorization: Bearer $AHURA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "zhipu/glm-5.3-flash-uncensored",
    "reasoning_effort": "medium",
    "messages": [{"role": "user", "content": "Plan a three-day trip to Kyoto on a budget."}]
  }'`,
          },
          {
            label: "Python",
            lang: "python",
            code: `completion = client.chat.completions.create(
    model="zhipu/glm-5.3-flash-uncensored",
    reasoning_effort="medium",
    messages=[{"role": "user", "content": "Plan a three-day trip to Kyoto on a budget."}],
)`,
          },
          {
            label: "TypeScript",
            lang: "typescript",
            code: `const completion = await client.chat.completions.create({
  model: "zhipu/glm-5.3-flash-uncensored",
  reasoning_effort: "medium",
  messages: [{ role: "user", content: "Plan a three-day trip to Kyoto on a budget." }],
});`,
          },
        ]}
      />
      <P>
        This is the field OpenCode, Hermes and most SDKs already send when you set a reasoning
        level in them, so in those tools there is nothing extra to configure. The template
        spelling, <C>{`"chat_template_kwargs": {"reasoning_effort": "high"}`}</C>, is accepted too.
      </P>

      <H2>An exact budget</H2>
      <P>
        To cap thinking at a number of tokens rather than a level, send{" "}
        <C>custom_params.thinking_budget</C>. A budget overrides the ladder when both are present.
      </P>
      <Code lang="json" title="request body">{`{
  "model": "zhipu/glm-5.3-flash-uncensored",
  "custom_params": { "thinking_budget": 300 },
  "messages": [{ "role": "user", "content": "Summarise this changelog in three bullets: …" }]
}`}</Code>

      <H2>No thinking at all</H2>
      <P>
        <C>reasoning_effort: &quot;none&quot;</C> puts the model in no-think mode: it answers
        directly, in well under a second on the hosted models, and nothing from the reasoning stage
        appears in the reply. Use it for classification, extraction and short answers, where
        thinking adds latency and cost without changing the result.
      </P>

      <H2>From the Anthropic-compatible route</H2>
      <P>
        Code written against the Anthropic SDK expresses the same intent with Anthropic’s fields,
        and <A href="/docs/inference/messages">POST /v1/messages</A> translates them for hosted
        models:
      </P>
      <Table
        head={["You send", "The model gets"]}
        rows={[
          [<C key="1">{`"output_config": {"effort": "medium"}`}</C>, <C key="1b">reasoning_effort: medium</C>],
          [<C key="2">{`"thinking": {"type": "enabled", "budget_tokens": 300}`}</C>, <C key="2b">thinking_budget: 300</C>],
          [<C key="3">{`"thinking": {"type": "disabled"}`}</C>, "No-think mode."],
        ]}
      />
      <Code lang="python" title="Anthropic SDK">{`message = client.messages.create(
    model="zhipu/glm-5.3-flash-uncensored",
    max_tokens=1024,
    thinking={"type": "enabled", "budget_tokens": 300},
    messages=[{"role": "user", "content": "Summarise this changelog in three bullets: …"}],
)`}</Code>
      <P>
        Claude Code and other Anthropic-protocol clients that set an effort level or a thinking
        budget therefore work as expected against hosted models. A budget wins over an effort level
        when both are present.
      </P>

      <H2>Cost and limits</H2>
      <Ul>
        <Li>
          Thinking tokens are output tokens: billed at the model&apos;s output rate and reported in{" "}
          <C>usage</C> as <C>reasoning_tokens</C>. <A href="/docs/inference/pricing">Pricing & usage</A>.
        </Li>
        <Li>
          They count against <C>max_tokens</C>. With unbounded thinking and a small{" "}
          <C>max_tokens</C>, the model can spend the whole allowance thinking and return an empty
          reply with <C>finish_reason: length</C>. Either raise <C>max_tokens</C> or set an effort
          level. See <A href="/docs/inference/streaming#reasoning-tokens">reasoning tokens</A>.
        </Li>
        <Li>
          Reasoning settings are part of the request, not the key, so one key can run a no-think
          classifier and an unbounded planner side by side.
        </Li>
      </Ul>

      <H3>Choosing a level</H3>
      <P>
        Start at <C>medium</C> for anything interactive: it keeps the first token under a second or
        two on the hosted models and handles most tasks. Reserve unbounded thinking for batch work
        and hard problems where waiting is fine. Use <C>none</C> wherever the prompt already
        contains the answer and the model only has to reshape it.
      </P>
      <Callout kind="note" title="Streaming">
        On a stream, the thinking stage is silent: the first visible token arrives when the model
        starts its answer. A stream that shows nothing for a while at high effort is working, not
        stalled.
      </Callout>
    </DocPage>
  );
}
