import type { Metadata } from "next";
import { A, C, Callout, DocPage, H2, Li, P, Table, Ul } from "@/components/docs/primitives";

export const metadata: Metadata = {
  title: "Privacy & data retention — Inference API — AhuraSense Docs",
  description:
    "What the AhuraSense inference API stores per request, how zero data retention keys change that, and how keys and secrets are protected.",
};

const HREF = "/docs/inference/privacy";

export default function PrivacyPage() {
  return (
    <DocPage
      href={HREF}
      eyebrow="Account"
      title="Privacy & data retention"
      lede="The short version: we store what is needed to bill and to support you, we do not store your prompts and answers beyond a short cache you control, and we never train on your data."
    >
      <H2>What is stored per request</H2>
      <Table
        head={["Data", "Retention", "Purpose"]}
        rows={[
          ["Usage record: token counts, model, key, status, latency, cost, request id", "Kept", "Billing and your usage dashboard"],
          ["Cached response body, for eligible non-streamed requests", "Up to the cache TTL, at most 1 hour", "Serving repeats from the cache"],
          ["Guardrail match: pattern id and a short excerpt, on a match only", "Audit log", "Explaining a flagged or blocked request"],
          ["Audit events for changes to keys, presets, BYOK keys and settings", "Kept", "Accountability for your account"],
        ]}
      />
      <P>
        Prompts and completions are not written to the usage record or to any log. Gateway logs
        hold request ids, status codes and timings, not message content.
      </P>

      <H2>Zero data retention</H2>
      <P>
        Turn on zero data retention for a key under{" "}
        <A href="/dashboard/services/inference/api-keys">Inference → API keys</A>. Requests made
        with that key:
      </P>
      <Ul>
        <Li>Never read from or write to the response cache.</Li>
        <Li>Never take part in any similarity cache.</Li>
        <Li>Still produce a usage record, because the request is still billed. The record carries no content.</Li>
      </Ul>
      <P>
        <C>GET /v1/key</C> reports <C>zdr_enabled</C> so a service can verify the setting it is
        running under.
      </P>

      <H2>Where a request goes</H2>
      <P>
        The gateway runs at the edge and forwards your request to the backend that serves the
        model: AhuraSense GPU infrastructure for hosted models, an inference partner for the rest
        of the catalog. The backend receives the prompt in order to generate the answer and is
        bound by our subprocessor terms. The <A href="/subprocessors">subprocessor list</A> and{" "}
        <A href="/dpa">data processing agreement</A> are published on this site.
      </P>

      <H2>Keys and secrets</H2>
      <Ul>
        <Li>API keys are stored as SHA-256 hashes. The plaintext is shown once, at creation, and cannot be retrieved.</Li>
        <Li>Provider keys you bring are encrypted with AES-256-GCM at rest and decrypted only at the edge for the duration of a request.</Li>
        <Li>Every connection uses TLS 1.3, terminated at the edge.</Li>
        <Li>All customer data is isolated per organization at the database level; there is no cross-tenant read path.</Li>
      </Ul>

      <H2>Training</H2>
      <P>We do not train models on customer prompts, completions or data, and we do not permit our partners to.</P>

      <Callout kind="note" title="Security review">
        Procurement and security teams can find the fuller account, including what we are and are
        not certified for, under <A href="/trust">Trust & compliance</A>.
      </Callout>
    </DocPage>
  );
}
