/**
 * Customer-facing error-message sanitizer for inference subsystem.
 *
 * Single source of truth used by:
 *  - dashboard read-time render (back-compat for older DB rows)
 *  - notifications fan-out (email + outbound webhook payload)
 *  - any server route that surfaces error_message to a caller
 *
 * Rules:
 *  - Never leak upstream provider names (RunPod, Upstash, Cloudflare,
 *    LKE / Linode, OpenRouter, R2).
 *  - Never leak internal mechanics (heartbeat, pod, kubectl, queue,
 *    cron, watchdog, scheduler).
 *  - Map known legacy patterns to friendly copy; else strip leaky
 *    terms from the original string.
 */
export function customerSafeErrorMessage(raw: string | null | undefined): string {
  if (!raw) return "";

  if (/heartbeat/i.test(raw)) {
    return "Training stopped responding and was cancelled. Re-run the job; if it repeats, try a different GPU size or contact support.";
  }
  if (/provisioning/i.test(raw) && /pod|gpu/i.test(raw)) {
    return "Could not start training. Try again in a moment, or pick a different GPU size if this persists.";
  }
  if (/pod\s+(exited|stopped|terminated|failed)/i.test(raw)) {
    return "Training stopped unexpectedly before completing. Re-run the job; if it fails again, try a different GPU size.";
  }

  return raw
    .replace(/\bRunPod\b/gi, "GPU compute")
    .replace(/\bUpstash\b/gi, "cache")
    .replace(/\bCloudflare\b/gi, "edge")
    .replace(/\bOpenRouter\b/gi, "model gateway")
    .replace(/\bkubectl\b/gi, "operator")
    .replace(/\bLKE\b/g, "cluster")
    .replace(/\bLinode\b/gi, "cluster")
    .replace(/\bpod\b/gi, "instance")
    .replace(/\bheartbeat\b/gi, "training activity")
    .replace(/\s{2,}/g, " ")
    .trim();
}
