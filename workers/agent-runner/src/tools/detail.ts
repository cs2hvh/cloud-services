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

const DEFAULT_CAP = 600;

/** Cap + brand-scrub any value into a short string safe for the trace. */
export function preview(value: unknown, cap = DEFAULT_CAP): string {
  const raw = typeof value === "string" ? value : JSON.stringify(value ?? null);
  const scrubbed = scrubUpstream(raw ?? "");
  return scrubbed.length > cap ? `${scrubbed.slice(0, cap)}…(truncated)` : scrubbed;
}
