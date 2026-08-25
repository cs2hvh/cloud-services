/**
 * Inline function-webhook tool (S2.3).
 *
 * Standard OpenAI-style function calling: the customer declares {name, parameters,
 * webhook_url} per request; when the model calls it, we POST the args to their
 * webhook and feed the response back into the loop. Nothing is stored server-side.
 *
 * Errors + timeouts are returned as tool output (not thrown) so the model can
 * react (retry / try another tool) instead of the run dying.
 */
import { createHmac } from "node:crypto";
import type { AgentTool, FunctionToolDecl, RunCtx, ToolResult } from "@ahura/agent-core";
import { assertSafeWebhookUrl, SsrfBlockedError } from "./ssrf.js";
import { preview } from "./detail.js";

/**
 * Sign the payload Stripe-style: `sha256(secret, "{timestamp}.{body}")`. The
 * timestamp is bound into the signature so a captured request can't be replayed
 * with a fresh signature — the customer rejects stale timestamps. Returns the
 * headers to attach (empty when no secret is configured).
 */
function signHeaders(secret: string | undefined, body: string): Record<string, string> {
  if (!secret) return {};
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return { "X-Ahura-Timestamp": timestamp, "X-Ahura-Signature": `sha256=${signature}` };
}

export function functionTool(
  decl: FunctionToolDecl,
  opts: { timeoutMs: number; allowPrivateWebhooks?: boolean }
): AgentTool {
  return {
    type: "function",
    async run(args: unknown, ctx: RunCtx): Promise<ToolResult> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
      const metering = { units: 1, unitLabel: "function_call" };
      try {
        // SSRF guard (§11): reject internal targets BEFORE any network call.
        await assertSafeWebhookUrl(decl.webhook_url, { allowPrivate: opts.allowPrivateWebhooks });
        const body = JSON.stringify({ name: decl.name, arguments: args, run_id: ctx.runId });
        const res = await fetch(decl.webhook_url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // Lets the customer correlate the call.
            "X-Ahura-Run-Id": ctx.runId,
            "X-Ahura-Tool-Name": decl.name,
            // HMAC signature over the exact body (only when a secret is set, §S2.3a).
            ...signHeaders(decl.secret, body),
          },
          body,
          signal: ctx.signal ?? controller.signal,
          // Forbid redirects so a 3xx to an internal host can't bypass the SSRF
          // pre-flight check (fetch rejects on any redirect).
          redirect: "error",
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          return {
            output: { error: `webhook returned HTTP ${res.status}`, body: txt.slice(0, 500) },
            metering,
            detail: { status: res.status, ok: false },
          };
        }
        const ct = res.headers.get("content-type") ?? "";
        const output = ct.includes("application/json")
          ? await res.json().catch(() => ({ error: "invalid JSON from webhook" }))
          : { text: (await res.text()).slice(0, 8000) };
        return {
          output,
          metering,
          // Trace preview: the args we sent + the response we got back (capped/scrubbed).
          detail: { input: preview(args, 300), output: preview(output, 400), status: res.status, ok: true },
        };
      } catch (err) {
        if (err instanceof SsrfBlockedError) {
          // Never reached the network — surface a clear, non-leaky error.
          return { output: { error: err.message }, metering, detail: { ok: false, blocked: true } };
        }
        const msg = err instanceof Error ? err.message : String(err);
        const timedOut = /abort/i.test(msg);
        return {
          output: { error: timedOut ? "webhook call timed out" : `webhook call failed: ${msg}` },
          metering,
          detail: { ok: false, timedOut },
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
