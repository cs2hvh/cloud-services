import type { Metadata } from "next";
import { Code } from "@/components/docs/code";
import {
  A,
  C,
  Callout,
  DocPage,
  Endpoint,
  H2,
  Li,
  P,
  Strong,
  Table,
  Ul,
} from "@/components/docs/primitives";

export const metadata: Metadata = {
  title: "Authentication — Inference API — AhuraSense Docs",
  description:
    "API keys for the AhuraSense inference API: the header, what a key can be restricted to, revocation, and the request and response headers.",
};

const HREF = "/docs/inference/authentication";

export default function AuthenticationPage() {
  return (
    <DocPage
      href={HREF}
      eyebrow="Inference API"
      title="Authentication"
      lede="Every request is authenticated with an API key that belongs to your organization. Keys carry their own limits, so one key can be scoped to one app, one model set, one budget."
    >
      <H2>Create a key</H2>
      <P>
        Open <A href="/dashboard/services/inference/api-keys">Inference → API keys</A> and create
        one. Keys look like <C>ahu_live_</C> followed by 32 characters. The full key is shown
        exactly once; afterwards the dashboard shows only its prefix and last four characters. We
        store a SHA-256 hash, never the key itself, so a lost key cannot be recovered, only
        replaced.
      </P>

      <H2>Send it</H2>
      <P>
        Put the key in the <C>Authorization</C> header as a bearer token. The <C>x-api-key</C>{" "}
        header is accepted too, which is what the Anthropic SDKs send.
      </P>
      <Code lang="bash" title="headers">{`Authorization: Bearer ahu_live_…
# or, equivalently
x-api-key: ahu_live_…`}</Code>
      <Callout kind="warn" title="Keep it server-side">
        A key can spend your balance. Do not ship it in a browser bundle or a mobile app; call the
        API from your backend, or create a key with a tight model allowlist, IP allowlist and hard
        cap for anything less trusted.
      </Callout>

      <H2>What a key can be restricted to</H2>
      <P>
        Each setting is per key and can be changed at any time from the dashboard. Changes reach
        the edge within a minute.
      </P>
      <Table
        head={["Setting", "Effect", "When it bites"]}
        rows={[
          [<Strong key="a">Allowed models</Strong>, "The key may call only the listed model ids.", <><C>403 model_not_allowed</C></>],
          [<Strong key="b">IP allowlist</Strong>, "CIDR ranges the key may be used from.", <><C>401</C> from any other address</>],
          [<Strong key="c">Expiry</Strong>, "A date after which the key stops working.", <><C>401</C> API key expired</>],
          [<Strong key="d">Rate limit</Strong>, "Requests per minute for this key. Default 600.", <><C>429 rate_limit_exceeded</C></>],
          [<Strong key="e">Monthly hard cap</Strong>, "Spend in the calendar month at which requests stop.", <><C>402 hard_cap_reached</C></>],
          [<Strong key="f">Monthly budget</Strong>, "A soft figure shown against spend in the dashboard. Never blocks.", "Alerts only"],
          [<Strong key="g">Zero data retention</Strong>, "Prompts and completions are never stored; the cache is skipped.", <A key="g-link" href="/docs/inference/privacy">Privacy</A>],
        ]}
      />
      <P>
        The organization can also carry a hard cap; the tighter of the two applies. See{" "}
        <A href="/docs/inference/limits">Rate limits & spend caps</A>.
      </P>

      <H2>Revoke a key</H2>
      <P>
        Revoking a key in the dashboard takes effect at the edge within 60 seconds. Requests with
        a revoked key get <C>401 invalid_api_key</C>, the same response as an unknown key, so a
        revoked key confirms nothing to whoever holds it.
      </P>

      <H2 id="inspect-a-key">Inspect a key</H2>
      <Endpoint method="GET" path="/v1/key" />
      <P>
        Returns the calling key’s scope and this month’s spend for its organization. Useful for
        a health check at startup, or to show a customer their remaining budget.
      </P>
      <Code lang="bash" title="request">{`curl https://api.ahurasense.com/v1/key \\
  -H "Authorization: Bearer $AHURA_API_KEY"`}</Code>
      <Code lang="json" title="response">{`{
  "key_id": "e435ceab-…",
  "org_id": "70cecc89-…",
  "zdr_enabled": false,
  "allowed_models": null,
  "billing": "platform",
  "usage": {
    "month": "2026-09",
    "spent_cents": 412,
    "monthly_budget_cents": 5000,
    "hard_cap_cents": 10000
  }
}`}</Code>
      <Ul>
        <Li>
          <C>allowed_models</C> is <C>null</C> when the key may call every model.
        </Li>
        <Li>
          <C>billing</C> is how the request is charged: <C>platform</C>, against your AhuraSense
          balance.
        </Li>
        <Li>
          <C>spent_cents</C> is the organization’s month-to-date spend, across all its keys.
        </Li>
      </Ul>

      <H2>Request headers</H2>
      <P>All optional. Each is explained on the page it belongs to.</P>
      <Table
        head={["Header", "Values", "Purpose"]}
        rows={[
          [<C key="1">X-Ahura-Request-Id</C>, "any string", "Your own correlation id. Echoed back; we generate one when absent."],
          [<C key="4">X-Ahura-Preset</C>, "preset name", <>Use a named default model. <A href="/docs/inference/presets">Presets</A>.</>],
          [<C key="5">X-Ahura-Guardrail</C>, <><C>off</C> | <C>warn</C> | <C>block</C></>, <>Prompt-injection policy for this request. <A href="/docs/inference/guardrails">Guardrails</A>.</>],
          [<C key="6">X-Ahura-Cache</C>, <><C>off</C> | <C>aggressive</C></>, <>Skip or widen the response cache. <A href="/docs/inference/caching">Caching</A>.</>],
          [<C key="7">X-Ahura-Cache-TTL</C>, "60 to 3600", "Seconds a cached answer stays valid."],
          [<C key="8">Cache-Control</C>, <C key="8-value">no-cache</C>, "Standard way to skip the cache."],
        ]}
      />

      <H2>Response headers</H2>
      <Table
        head={["Header", "Meaning"]}
        rows={[
          [<C key="1">X-Ahura-Request-Id</C>, "The request id. Quote it in support requests."],
          [<C key="2">X-Ahura-Model</C>, "The catalog id that served the request and that usage is recorded under."],
          [<C key="3">X-Ahura-Billing</C>, <>How the request was charged: <C>platform</C>.</>],
          [<C key="4">X-Ahura-Routing</C>, <><C>managed</C> when the model runs on AhuraSense GPU infrastructure rather than a partner backend. Absent otherwise.</>],
          [<C key="5">X-Ahura-Cache</C>, <><C>hit</C>, <C>miss</C>, <C>bypass</C>, <C>streaming-skipped</C> or <C>non-deterministic</C>.</>],
          [<C key="6">X-Ahura-Cache-Age</C>, "Seconds since a cached answer was produced. Only on hits."],
          [<C key="7">X-Ahura-Guardrail</C>, <><C>clean</C>, <C>flagged</C> or <C>blocked</C>.</>],
          [<C key="8">X-Ahura-Preset</C>, "The preset that was applied, when one was."],
          [<C key="9">X-Ahura-RateLimit-Remaining</C>, "Requests left in the current bucket."],
          [<C key="10">Retry-After</C>, <>Seconds to wait. Sent with <C>429</C> and with <C>503</C>.</>],
        ]}
      />
    </DocPage>
  );
}
