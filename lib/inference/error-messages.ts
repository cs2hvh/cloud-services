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
/**
 * Re-exported so this module is a one-stop import for error handling in the
 * service layers, and so there is exactly ONE definition of the generic
 * message. It first shipped here as a second constant beside
 * SAFE_MESSAGES.server_error in lib/api/error-sanitizer.ts — two strings
 * meaning the same thing, which is the same duplication this file exists to
 * argue against. The definition now lives with the sanitiser.
 */
export { GENERIC_SERVICE_ERROR } from "@/lib/api/error-sanitizer";

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
  // Gated base model — checked before the generic-traceback catch-all because
  // the upstream 403 arrives wrapped in a Python traceback ("OSError: ...gated
  // repo...") that would otherwise be swallowed into a vaguer message.
  if (/gated repo|gated repository|is restricted|not in the authorized list|do not have (access|permission)/i.test(raw)) {
    return "This base model needs access approval before it can be fine-tuned. Try a different base, or contact support to enable it.";
  }
  // Out-of-memory — the base + method didn't fit the chosen GPU.
  if (/out of memory|cuda out of memory|outofmemory/i.test(raw)) {
    return "The model was too large for the selected GPU. Re-run on a larger GPU, use qLoRA, or pick a smaller base model.";
  }
  // Upstream JSON-schema validation dump. Scrubbing the provider name out of
  // these still leaves unreadable spec prose ("At #/paths/pods/post ... the
  // request body is defined as an object"), and none of it is actionable: the
  // customer chose from a list we rendered, so a rejected field means OUR
  // catalog is out of step with what the provider will accept.
  if (
    /does not meet the schema requirements|#\/paths\/|properties\/[\w/]+\/(enum|items)/i.test(raw)
  ) {
    return "That configuration was rejected — the selected GPU or image can't be deployed right now. Try a different GPU, or contact support if it persists.";
  }
  // Any raw Python traceback / stderr dump — never show internals or file paths.
  if (/traceback \(most recent call last\)|file "\/|\b(os|io|runtime|import|value|key|type)error\b|modulenotfounderror|assertionerror/i.test(raw)) {
    return "Training failed while running. Check your dataset format and hyperparameters, then re-run; contact support if it keeps failing.";
  }

  return raw
    // URLs first, before the vendor-name rules below. A bare
    // /\bRunPod\b/ pass over "https://rest.runpod.io/v1/pods" rewrites the
    // host in place and leaves "https://rest.GPU compute.io/v1/instances" —
    // which still discloses that an upstream exists, at what path, and is
    // gibberish to the reader. Strip the whole URL instead.
    .replace(/\bhttps?:\/\/\S+/gi, "the upstream service")
    // Bare hostnames that survive URL stripping (e.g. "at rest.runpod.io").
    .replace(/\b[\w-]+\.(runpod|wokey|openrouter|linode|upstash)\.\w+/gi, "the upstream service")
    .replace(/\bRunPod\b/gi, "GPU compute")
    .replace(/\bUpstash\b/gi, "cache")
    .replace(/\bCloudflare\b/gi, "edge")
    .replace(/\bOpenRouter\b/gi, "model gateway")
    .replace(/hugging\s?face(\.co)?/gi, "model hub")
    .replace(/\baxolotl\b/gi, "training runtime")
    .replace(/ghcr\.io\/\S+/gi, "training image")
    .replace(/(\/[\w.-]+){2,}\/?/g, " ") // absolute unix paths (e.g. /workspace/cache/...)
    .replace(/\bkubectl\b/gi, "operator")
    .replace(/\bvLLM\b/gi, "serving runtime")
    .replace(/\bLKE\b/g, "cluster")
    .replace(/\bLinode\b/gi, "cluster")
    .replace(/\bdeploy-runner\b/gi, "deploy worker")
    .replace(/\bft-runner\b/gi, "training worker")
    .replace(/\bOPENROUTER_PLATFORM_KEY\b/g, "platform upstream key")
    .replace(/\bOPENROUTER_[A-Z_]+\b/g, "upstream config")
    .replace(/\bpod\b/gi, "instance")
    .replace(/\bheartbeat\b/gi, "training activity")
    .replace(/\bwatchdog\b/gi, "monitor")
    .replace(/\s{2,}/g, " ")
    .trim();
}
