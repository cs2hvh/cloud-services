/**
 * Hosted code-interpreter tool (S3.2a) — runs model-authored Python in an isolated
 * sandbox session and feeds stdout back into the loop.
 *
 * ⚠️ HARD GATE. This tool executes arbitrary code, so it is disabled unless BOTH:
 *   1. `SANDBOX_ENABLED=true` (default false everywhere), set only AFTER the
 *      security review signs off (nextstespsAI/13-agent-s3-sandbox-security-review.md), and
 *   2. a real SandboxPool is wired (the mock never runs real code).
 * When disabled it returns a clear "not available" result (and the dispatcher does
 * not even advertise it to the model — see dispatch.ts). This is the S3 gate in code.
 *
 * Metering: CPU-seconds (unit_label `cpu_second`, priced by cents_per_cpu_second),
 * so sandbox spend counts toward the mid-run cost ceiling (§9).
 */
import type { AgentTool, RunCtx, ToolResult } from "@ahura/agent-core";
import type { RunnerEnv } from "../env.js";
import { scrubUpstream } from "./web-search.js";
import { scrubInfraLeakage } from "./infra-scrub.js";
import { preview } from "./detail.js";
import type { SandboxPool } from "./sandbox/pool.js";

const MAX_OUTPUT_CHARS = 10_000;

const err = (message: string): ToolResult => ({
  output: { error: message },
  metering: { units: 0, unitLabel: "cpu_second" },
});

/**
 * Build the `code` tool. `pool` is injected (a real pool once S3 ships, the mock
 * in tests). With no pool the tool reports unavailable even if the flag is on —
 * belt-and-suspenders so a stray flag can't create an executor that isn't there.
 */
export function codeTool(env: RunnerEnv, pool?: SandboxPool): AgentTool {
  return {
    type: "code",
    async run(args: unknown, ctx: RunCtx): Promise<ToolResult> {
      if (!env.sandboxEnabled) {
        return err("code interpreter is not available (sandbox disabled)");
      }
      if (!pool) {
        return err("code interpreter is not available (no sandbox pool configured)");
      }

      const a = (args ?? {}) as { code?: unknown };
      const code = typeof a.code === "string" ? a.code : String(a.code ?? "");
      if (!code.trim()) return err("code interpreter requires a non-empty `code` string");

      // One session per run — do NOT tear it down per call, or state (variables,
      // imports, /tmp files) wouldn't persist across code steps. The runner
      // disposes the pool at run end (see lifecycle.ts → dispatcher.dispose()).
      const session = await pool.start({ runId: ctx.runId, orgId: ctx.orgId });
      try {
        const r = await session.exec(code, { timeoutMs: env.toolTimeoutMs });
        // §11: brand-scrub stdout/stderr before it reaches the model or run_steps.detail.
        // Both scrubs run — scrubUpstream (search-provider names, kept for
        // parity with every other tool) and scrubInfraLeakage (RunPod/K8s/our
        // own worker names) — this is arbitrary code execution output, the
        // highest-leakage surface in the platform per doc 00's own risk list.
        const stdout = scrubInfraLeakage(scrubUpstream(r.stdout)).slice(0, MAX_OUTPUT_CHARS);
        const stderr = scrubInfraLeakage(scrubUpstream(r.stderr)).slice(0, MAX_OUTPUT_CHARS);
        return {
          output: { stdout, stderr, exit_code: r.exit_code, ...(r.capped ? { capped: true } : {}) },
          metering: { units: r.cpu_seconds, unitLabel: "cpu_second" },
          // Trace preview: the code that ran + what it produced (§11-scrubbed, capped).
          detail: {
            input: preview(code),
            stdout: preview(stdout),
            ...(stderr.trim() ? { stderr: preview(stderr) } : {}),
            exit_code: r.exit_code,
            cpu_seconds: r.cpu_seconds,
            capped: r.capped ?? false,
          },
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return err(`code execution failed: ${scrubInfraLeakage(scrubUpstream(msg))}`);
      }
    },
  };
}
