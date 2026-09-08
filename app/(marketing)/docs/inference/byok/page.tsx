import type { Metadata } from "next";
import { Code } from "@/components/docs/code";
import { A, C, Callout, DocPage, H2, Li, Ol, P, Ul } from "@/components/docs/primitives";

export const metadata: Metadata = {
  title: "Bring your own key — Inference API — AhuraSense Docs",
  description:
    "BYOK on the AhuraSense inference API: store your own provider key, encrypted, and bill upstream usage to your own account.",
};

const HREF = "/docs/inference/byok";

export default function ByokPage() {
  return (
    <DocPage
      href={HREF}
      eyebrow="Features"
      title="Bring your own key"
      lede="If you already have an account with a model provider, you can route requests through it. The gateway keeps everything else: your API keys, limits, caching, guardrails and usage records. Only the upstream bill moves to you."
    >
      <H2>How it works</H2>
      <Ol>
        <Li>
          Add the provider key under{" "}
          <A href="/dashboard/services/inference/byok-keys">Inference → BYOK keys</A>. It is
          encrypted with AES-256-GCM before it is stored and is decrypted only at the edge, for the
          duration of a request.
        </Li>
        <Li>
          Send <C>X-Ahura-Billing: byok</C> on the requests that should use it, and optionally{" "}
          <C>X-Ahura-BYOK-Provider</C> to name which stored key.
        </Li>
        <Li>
          The response carries <C>X-Ahura-Billing: byok</C> to confirm the path, and the usage
          record is marked <C>billed_to: byok</C> with a platform cost of zero.
        </Li>
      </Ol>
      <Code lang="bash" title="curl">{`curl https://api.ahurasense.com/v1/chat/completions \\
  -H "Authorization: Bearer $AHURA_API_KEY" \\
  -H "X-Ahura-Billing: byok" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"anthropic/claude-sonnet-5","messages":[{"role":"user","content":"Hello"}]}'`}</Code>

      <H2>Which providers</H2>
      <P>
        The gateway routes catalog models through one inference partner, so the key that can be
        forwarded today is a key for that partner, provider name <C>wokey</C>, which is also the
        default when <C>X-Ahura-BYOK-Provider</C> is absent. Keys for other providers can be
        stored for later, but a request naming one is refused with <C>400 byok_unavailable</C>{" "}
        rather than sent to the wrong vendor. Hosted models run on our own infrastructure and
        always bill to the platform.
      </P>

      <H2>What changes and what does not</H2>
      <Ul>
        <Li>Your AhuraSense API key, its allowlists, rate limit and hard caps still apply.</Li>
        <Li>Caching, guardrails and presets behave the same.</Li>
        <Li>Usage rows are still written, with tokens and latency, so your dashboard stays complete.</Li>
        <Li>The upstream provider bills your account for the tokens; AhuraSense bills nothing for the request.</Li>
      </Ul>
      <Callout kind="note" title="Invalidation">
        If the provider rejects the stored key, the request fails with{" "}
        <C>upstream_unavailable</C>. Replace the key in the dashboard; the old one is marked
        invalid and never sent again.
      </Callout>
    </DocPage>
  );
}
