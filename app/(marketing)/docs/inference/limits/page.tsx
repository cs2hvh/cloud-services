import type { Metadata } from "next";
import { Code } from "@/components/docs/code";
import { A, C, Callout, DocPage, H2, Li, P, Table, Ul } from "@/components/docs/primitives";

export const metadata: Metadata = {
  title: "Rate limits & spend caps — Inference API — AhuraSense Docs",
  description:
    "Requests per minute, burst, and monthly hard caps on the AhuraSense inference API, and the exact responses when you reach them.",
};

const HREF = "/docs/inference/limits";

export default function LimitsPage() {
  return (
    <DocPage
      href={HREF}
      eyebrow="Account"
      title="Rate limits & spend caps"
      lede="Two kinds of limit, both per key and both yours to set: how fast a key may call, and how much it may spend in a month. Neither is a surprise: the responses say which limit and how long to wait."
    >
      <H2>Rate limits</H2>
      <P>
        Each key has a requests-per-minute limit, 600 unless you change it, enforced with a token
        bucket at the edge. The bucket holds about six seconds of the key’s rate, with a floor of
        ten requests, so short bursts above the average pass and sustained traffic is held to the
        rate.
      </P>
      <Table
        head={["Limit", "Sustained", "Burst"]}
        rows={[
          ["60 rpm", "1 request / s", "10 requests"],
          ["600 rpm (default)", "10 requests / s", "60 requests"],
          ["6,000 rpm", "100 requests / s", "600 requests"],
        ]}
      />
      <P>
        Every response carries <C>X-Ahura-RateLimit-Remaining</C>, the requests left in the
        bucket right now. Over the limit, the gateway answers <C>429</C>:
      </P>
      <Code lang="json" title="429">{`{
  "error": {
    "message": "Rate limit exceeded",
    "type": "rate_limit_error",
    "code": "rate_limit_exceeded",
    "request_id": "…"
  }
}`}</Code>
      <P>
        With <C>Retry-After</C> in seconds. The OpenAI and Anthropic SDKs wait and retry on their
        own. Rate limits are per key, so two keys on the same organization do not share a bucket;
        give busy services their own key.
      </P>

      <H2>Spend caps</H2>
      <P>
        A hard cap is a monthly amount in your organization’s billing currency at which requests
        stop. It can be set on a key, on the organization, or both; whichever is reached first
        applies. Spend counts from the first of the calendar month, UTC, and resets on the next.
      </P>
      <Code lang="json" title="402">{`{
  "error": {
    "message": "Reached this API key’s monthly hard cap of 100.00 USD for 2026-09. Raise this key’s cap on the API Keys page, or use a different key.",
    "type": "billing_error",
    "code": "hard_cap_reached",
    "scope": "key",
    "spent_cents": 10012,
    "hard_cap_cents": 10000,
    "request_id": "…"
  }
}`}</Code>
      <Ul>
        <Li><C>hard_cap_reached</C>: the key’s own cap. Raise it under <A href="/dashboard/services/inference/api-keys">API keys</A>.</Li>
        <Li><C>org_hard_cap_reached</C>: the organization’s cap. Raise it under <A href="/dashboard/services/inference/settings">Inference settings</A>.</Li>
      </Ul>
      <P>
        A monthly budget is the softer sibling: a figure the dashboard shows spend against and
        alerts on, without ever blocking a request. Set both: a budget at the number you expect,
        a hard cap at the number you could not explain.
      </P>
      <P>
        <C>GET /v1/key</C> returns the calling key’s caps and the month’s spend, so a service can
        check its own headroom at startup. See{" "}
        <A href="/docs/inference/authentication#inspect-a-key">Authentication</A>.
      </P>

      <H2>Alerts</H2>
      <P>
        As monthly spend crosses 80% and 100% of a budget, or 90% and 100% of a hard cap, the
        organization is notified on the channels configured under{" "}
        <A href="/dashboard/services/inference/notifications">Inference → Notifications</A>: in
        the dashboard, by email, or to a webhook signed with HMAC-SHA256.
      </P>
      <Callout kind="note" title="Caps are checked before the model runs">
        A request refused for a cap or a rate limit never reaches a model and is never billed.
        The check reads a counter that is updated as usage is recorded, a few seconds behind, so
        a burst of concurrent requests can overshoot a cap by that much.
      </Callout>
    </DocPage>
  );
}
