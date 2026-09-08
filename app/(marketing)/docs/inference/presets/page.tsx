import type { Metadata } from "next";
import { Code } from "@/components/docs/code";
import { A, C, Callout, DocPage, H2, Li, Ol, P } from "@/components/docs/primitives";

export const metadata: Metadata = {
  title: "Presets — Inference API — AhuraSense Docs",
  description:
    "Presets on the AhuraSense inference API: named default models you can change in the dashboard without redeploying code.",
};

const HREF = "/docs/inference/presets";

export default function PresetsPage() {
  return (
    <DocPage
      href={HREF}
      eyebrow="Features"
      title="Presets"
      lede="A preset is a name that resolves to a model. Your code sends the name; the dashboard decides what it means. Move a whole application to a new model without a deploy, or run different environments on different models with one codebase."
    >
      <H2>Create one</H2>
      <Ol>
        <Li>
          Open <A href="/dashboard/services/inference/presets">Inference → Presets</A> and create
          a preset, for example <C>assistant-default</C>.
        </Li>
        <Li>Choose its model. The first model in the preset is the one requests get.</Li>
      </Ol>

      <H2>Use it</H2>
      <P>
        Send the name in <C>X-Ahura-Preset</C>. When the header is present, <C>model</C> in the
        body becomes optional; the preset’s model is used. If the body does name a model, the body
        wins.
      </P>
      <Code lang="bash" title="curl">{`curl https://api.ahurasense.com/v1/chat/completions \\
  -H "Authorization: Bearer $AHURA_API_KEY" \\
  -H "X-Ahura-Preset: assistant-default" \\
  -H "Content-Type: application/json" \\
  -d '{"messages":[{"role":"user","content":"Hello"}]}'`}</Code>
      <P>
        The response carries <C>X-Ahura-Preset</C> with the name that was applied and{" "}
        <C>X-Ahura-Model</C> with the model it resolved to, so a log line shows both.
      </P>
      <Code lang="python" title="OpenAI SDK">{`completion = client.chat.completions.create(
    model="",  # the preset supplies it; the SDK requires the field to exist
    messages=[{"role": "user", "content": "Hello"}],
    extra_headers={"X-Ahura-Preset": "assistant-default"},
)`}</Code>

      <H2>Propagation</H2>
      <P>
        Preset definitions are cached at the edge for up to five minutes, so a change in the
        dashboard reaches every request within that window. An unknown name returns{" "}
        <C>400 preset_not_found</C>. Presets belong to your organization; every key in it can use
        them, subject to the key’s own model allowlist.
      </P>

      <Callout kind="warn" title="Fallback chains and provider preferences are not applied">
        The preset editor lets you list several models and set provider preferences such as
        sorting by price or latency. Those settings are stored but not enforced by the gateway
        today: only the first model is used, and when a preset carries such settings the response
        includes <C>X-Ahura-Preset-Fallback: unsupported</C> so the gap is visible rather than
        silent. Failover across models is on the roadmap and will be announced in the changelog.
      </Callout>
    </DocPage>
  );
}
