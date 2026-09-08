import { Code } from "@/components/docs/code";
import { docsMetadata } from "@/components/docs/metadata";
import { C, Callout, DocPage, H2, Li, P, Table, Ul } from "@/components/docs/primitives";

export const metadata = docsMetadata({
  title: "Guardrails — Inference API — AhuraSense Docs",
  description:
    "Prompt-injection detection on the AhuraSense inference API: the warn, block and off policies, the response header, and what the detector looks for.",
  path: "/docs/inference/guardrails",
});

const HREF = "/docs/inference/guardrails";

export default function GuardrailsPage() {
  return (
    <DocPage
      href={HREF}
      eyebrow="Features"
      title="Guardrails"
      lede="Every request's prompt text is scanned for prompt-injection patterns before it reaches the model. By default the result is only reported back to you; you can ask the gateway to refuse instead, per request."
    >
      <H2>Policies</H2>
      <P>
        Set the policy with the <C>X-Ahura-Guardrail</C> request header.
      </P>
      <Table
        head={["Value", "Behaviour"]}
        rows={[
          [<C key="1">warn</C>, "Scan, annotate the response, never refuse. The default."],
          [<C key="2">block</C>, <>Scan; refuse with <C>400 guardrail_blocked</C> when a critical pattern matches. Softer matches are annotated only.</>],
          [<C key="3">off</C>, "Do not scan."],
        ]}
      />
      <P>
        The scan covers system and user messages on both the chat completions and the messages
        endpoints. It is a static, high-precision pattern set, tuned to miss a clever attempt
        rather than refuse a legitimate prompt that happens to mention ignoring instructions.
      </P>

      <H2>Reading the result</H2>
      <P>
        Every response carries <C>X-Ahura-Guardrail</C>:
      </P>
      <Ul>
        <Li><C>clean</C>: nothing matched.</Li>
        <Li><C>flagged</C>: something matched and the request went through (policy warn, or a soft match under block).</Li>
        <Li><C>blocked</C>: the request was refused. The body names the pattern ids.</Li>
      </Ul>
      <Code lang="json" title="400 guardrail_blocked">{`{
  "error": {
    "message": "Request blocked by prompt-injection guardrail (patterns: ignore_previous)",
    "type": "invalid_request_error",
    "code": "guardrail_blocked",
    "request_id": "…"
  }
}`}</Code>

      <H2>Rolling it out</H2>
      <P>
        Run with the default for a while and log the header. When you have seen how often{" "}
        <C>flagged</C> appears on real traffic and looked at what triggered it, switch the
        untrusted paths, such as anything that pastes user-uploaded text into a prompt, to{" "}
        <C>block</C>. Keep internal tooling on <C>warn</C> or <C>off</C>.
      </P>
      <Callout kind="note" title="What it is and is not">
        A blocked request is not billed. The detector reads your prompt at the edge and stores
        nothing from it; on a match, only the pattern ids are logged, never the prompt. It is a
        first line, not a substitute for treating model output as untrusted in your own code.
      </Callout>
    </DocPage>
  );
}
