/**
 * run_steps.detail preview helper.
 *
 * A tool's `detail` is the small, brand-scrubbed, size-capped snapshot the trace
 * UI renders so a customer can see WHAT a tool did (the code it ran + its output,
 * the search query + results, …) — not just that a step happened.
 *
 * §11 discipline: everything surfaced here is brand-scrubbed and hard-capped so a
 * huge or upstream-leaking payload never lands in run_steps.detail.
 */
import { scrubUpstream } from "./web-search.js";
import { scrubInfraLeakage } from "./infra-scrub.js";

const DEFAULT_CAP = 600;

/** Cap + brand-scrub any value into a short string safe for the trace. Runs
 *  BOTH scrubs — scrubUpstream (search-provider names) and scrubInfraLeakage
 *  (RunPod/K8s/our-own-worker-names) — since this is the one shared preview
 *  path every tool (code/function/mcp/web_search) routes through, and a
 *  future tool's output is exactly as likely to carry either kind of leak. */
export function preview(value: unknown, cap = DEFAULT_CAP): string {
  const raw = typeof value === "string" ? value : JSON.stringify(value ?? null);
  const scrubbed = scrubInfraLeakage(scrubUpstream(raw ?? ""));
  return scrubbed.length > cap ? `${scrubbed.slice(0, cap)}…(truncated)` : scrubbed;
}
