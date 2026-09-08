import type { Metadata } from "next";
import { Code } from "@/components/docs/code";
import { A, C, Callout, DocPage, H2, Li, P, Table, Ul } from "@/components/docs/primitives";

export const metadata: Metadata = {
  title: "Caching — Inference API — AhuraSense Docs",
  description:
    "The AhuraSense inference API response cache: which requests it applies to, the headers that control it, and how cached answers are billed.",
};

const HREF = "/docs/inference/caching";

export default function CachingPage() {
  return (
    <DocPage
      href={HREF}
      eyebrow="Features"
      title="Caching"
      lede="The gateway remembers the answer to a deterministic request and returns it again when the same request comes back. Repeats are faster, and are billed at the cached-input rate instead of running the model twice."
    >
      <H2>When a request is cached</H2>
      <P>All of the following must hold. Otherwise the request goes to the model as usual.</P>
      <Ul>
        <Li>It is not streamed.</Li>
        <Li>
          <C>temperature</C> is <C>0</C>, or the request carries <C>X-Ahura-Cache: aggressive</C>.
        </Li>
        <Li>The model is served by a partner backend. Hosted models are not cached.</Li>
        <Li>Neither <C>X-Ahura-Cache: off</C> nor <C>Cache-Control: no-cache</C> is set.</Li>
      </Ul>
      <P>
        The cache key is a hash of <C>model</C>, <C>messages</C>, <C>tools</C>,{" "}
        <C>tool_choice</C>, <C>response_format</C>, <C>max_tokens</C>, <C>temperature</C>,{" "}
        <C>top_p</C> and <C>seed</C>. Anything else in the body, including <C>user</C>, is not
        part of it. Entries are scoped to your organization; another customer's identical request
        never sees your answer.
      </P>

      <H2>Controlling it</H2>
      <Table
        head={["Header", "Effect"]}
        rows={[
          [<C key="1">X-Ahura-Cache: off</C>, "Skip the cache for this request, reading and writing."],
          [<C key="2">Cache-Control: no-cache</C>, "Same as above, using the standard header."],
          [<C key="3">X-Ahura-Cache: aggressive</C>, "Cache even when temperature is not 0. Use only where a repeated creative answer is acceptable."],
          [<C key="4">X-Ahura-Cache-TTL: 900</C>, "How long, in seconds, the answer stays valid. Default 300; clamped to 60 to 3600."],
        ]}
      />
      <Code lang="bash" title="a cacheable request with a 15-minute TTL">{`curl https://api.ahurasense.com/v1/chat/completions \\
  -H "Authorization: Bearer $AHURA_API_KEY" \\
  -H "X-Ahura-Cache-TTL: 900" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"openai/gpt-5.4-mini","temperature":0,"messages":[{"role":"user","content":"Classify: \\"card declined twice\\""}]}'`}</Code>

      <H2>Reading the result</H2>
      <P>Every non-streamed response says what the cache did:</P>
      <Table
        head={["X-Ahura-Cache", "Meaning"]}
        rows={[
          [<C key="1">hit</C>, <>Served from the cache. <C>X-Ahura-Cache-Age</C> is the age in seconds.</>],
          [<C key="2">miss</C>, "Eligible, not found; the answer was generated and stored."],
          [<C key="3">non-deterministic</C>, "Not cached because temperature is above 0."],
          [<C key="4">bypass</C>, "You asked to skip it."],
          [<C key="5">streaming-skipped</C>, "Streamed responses are never cached."],
        ]}
      />

      <H2>Billing</H2>
      <P>
        A hit is recorded as a request whose prompt tokens were all cached, so the prompt is billed
        at the model's <C>cached_cents_per_mtok</C> rate rather than the input rate; the completion
        is billed at the output rate as usual. The usage row carries <C>cache_kind: l1</C> so you
        can see the effect per key on the{" "}
        <A href="/dashboard/services/inference/usage">usage page</A>.
      </P>

      <H2>Privacy</H2>
      <P>
        A cached entry is the response body, its content type and its token counts, stored for at
        most the TTL and never longer than an hour. Keys with zero data retention never read or
        write the cache. See <A href="/docs/inference/privacy">Privacy & data retention</A>.
      </P>
      <Callout kind="note" title="Semantic cache">
        A similarity-based cache that matches near-duplicate prompts exists as a per-key setting
        in the dashboard. It depends on an embeddings provider and is switched off platform-wide
        while none is configured, so the setting currently has no effect.
      </Callout>
    </DocPage>
  );
}
