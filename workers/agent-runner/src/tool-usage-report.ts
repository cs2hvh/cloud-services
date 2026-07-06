/**
 * Tool-usage reporting client (2026-07-06) — the agent-runner side of the
 * agent-tool-usage ingress bridge (workers/inference/src/routes/agent-tool-usage.ts).
 *
 * agent-runner already computes tool cost locally (lifecycle.ts's priceStep,
 * for the mid-run cost ceiling) and persists it to agentcore.run_steps for the
 * trace — but as a plain Node process it can't reach the CF USAGE_EVENTS queue
 * directly, so that cost never reached the real metering pipeline. This posts
 * the already-computed step to the gateway's HTTP ingress, which re-shapes it
 * into a UsageEvent and enqueues it — same pipeline as every other billed SKU.
 *
 * Fire-and-forget by design: a reporting failure must never fail the run or
 * even delay it (the trace/ceiling already have the authoritative numbers via
 * run_steps). Errors are logged, not thrown — same posture as persisted-pool.ts's
 * row-insert failure handling.
 */
import type { RunnerEnv } from "./env.js";

/** Every agent/* catalog row (20260701000003 web_search/code/function,
 *  20260703000002 file_search + the single shared agent/memory row) that has a
 *  computeUnitCost() case (added in 20260706000001's usage.ts changes) —
 *  anything else would insert a zero-priced, orphaned usage row, so it's left
 *  out until both a catalog row and a consumer case exist for it. */
const REPORTABLE_UNIT_LABELS: Record<
  string,
  "web_search" | "code" | "function" | "file_search" | "memory_write" | "memory_search"
> = {
  web_search: "web_search",
  cpu_second: "code",
  function_call: "function",
  file_search: "file_search",
  memory_write: "memory_write",
  memory_search: "memory_search",
};

export interface ReportableStep {
  unitLabel: string | null | undefined;
  units: number | null | undefined;
  status: "success" | "error";
}

export async function reportToolUsage(
  env: RunnerEnv,
  orgId: string,
  requestId: string,
  step: ReportableStep
): Promise<void> {
  if (!step.unitLabel) return;
  const toolType = REPORTABLE_UNIT_LABELS[step.unitLabel];
  if (!toolType) return;
  const units = step.units ?? 0;
  if (units <= 0) return;

  try {
    const res = await fetch(`${env.inferenceBaseUrl}/agent-tool-usage`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.inferencePlatformKey}`,
        "Content-Type": "application/json",
        "X-Ahura-On-Behalf-Of-Org": orgId,
      },
      body: JSON.stringify({
        toolType,
        unitLabel: step.unitLabel,
        units,
        requestId,
        status: step.status,
      }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error(
        JSON.stringify({
          level: "error",
          scope: "tool-usage-report",
          message: "Ingress rejected tool usage",
          orgId,
          toolType,
          status: res.status,
          body: txt.slice(0, 200),
        })
      );
    }
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        scope: "tool-usage-report",
        message: "Failed to report tool usage",
        orgId,
        toolType,
        err: err instanceof Error ? err.message : String(err),
      })
    );
  }
}
