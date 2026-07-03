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
import type { AgentTool, FunctionToolDecl, RunCtx, ToolResult } from "@ahura/agent-core";

export function functionTool(decl: FunctionToolDecl, opts: { timeoutMs: number }): AgentTool {
  return {
    type: "function",
    async run(args: unknown, ctx: RunCtx): Promise<ToolResult> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
      const metering = { units: 1, unitLabel: "function_call" };
      try {
        const res = await fetch(decl.webhook_url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // Lets the customer correlate the call; HMAC signing is a follow-up
            // (needs a per-agent signing secret we don't model yet).
            "X-Ahura-Run-Id": ctx.runId,
            "X-Ahura-Tool-Name": decl.name,
          },
          body: JSON.stringify({ name: decl.name, arguments: args, run_id: ctx.runId }),
          signal: ctx.signal ?? controller.signal,
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
        return { output, metering, detail: { status: res.status, ok: true } };
      } catch (err) {
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
