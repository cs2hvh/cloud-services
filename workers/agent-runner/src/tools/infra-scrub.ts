/**
 * Infra-identifier scrub for tool output surfaces (§11, doc 00 Phase-0 item 5:
 * "brand-scrub for binary/log/stream surfaces ... sandbox stdout policy").
 *
 * Found live (2026-07-15, Phase-0 billing audit): `code.ts`'s sandbox stdout/
 * stderr scrub, and `detail.ts`'s `preview()` (the ONE shared trace-preview
 * path every tool — code/function/mcp/web_search — routes through), both only
 * ever called `scrubUpstream` from web-search.ts, which strips exactly two
 * search-provider names (Brave/Exa) and nothing else. Nothing caught a stray
 * "RunPod"/"Cloudflare"/K8s-mechanics term surfacing in a stack trace, a
 * webhook's own error body, or an MCP server's (untrusted, per doc 14 §5)
 * response text. This mirrors lib/inference/error-messages.ts's
 * customerSafeErrorMessage() infra-identifier list — duplicated, not
 * imported, because agent-runner is a standalone Node package with no import
 * path into app/lib/* (same constraint mcp-crypto.ts documents for why it
 * duplicates lib/inference/crypto.ts's AES-GCM format instead of importing
 * it). Keep the two lists in sync by hand if either changes.
 */

/** Strip internal infra/vendor identifiers from arbitrary tool-output text.
 *  Unlike customerSafeErrorMessage(), this never replaces the whole string
 *  with a canned message — tool output (sandbox stdout, a webhook body, an
 *  MCP result) is real customer-relevant content, not a doomed error path;
 *  it just must never carry OUR upstream/infra names through it. */
export function scrubInfraLeakage(text: string): string {
  if (!text) return text ?? "";
  return text
    .replace(/\bRunPod\b/gi, "GPU compute")
    .replace(/\bUpstash\b/gi, "cache")
    .replace(/\bCloudflare\b/gi, "edge")
    .replace(/\bOpenRouter\b/gi, "model gateway")
    .replace(/hugging\s?face(\.co)?/gi, "model hub")
    .replace(/\baxolotl\b/gi, "training runtime")
    .replace(/ghcr\.io\/\S+/gi, "training image")
    .replace(/\bkubectl\b/gi, "operator")
    .replace(/\bvLLM\b/gi, "serving runtime")
    .replace(/\bLKE\b/g, "cluster")
    .replace(/\bLinode\b/gi, "cluster")
    .replace(/\bdeploy-runner\b/gi, "deploy worker")
    .replace(/\bft-runner\b/gi, "training worker")
    .replace(/\bagent-runner\b/gi, "agent worker")
    .replace(/\beval-runner\b/gi, "eval worker")
    .replace(/\bOPENROUTER_[A-Z_]+\b/g, "upstream config")
    .replace(/\bSUPABASE_[A-Z_]+\b/g, "internal config")
    .replace(/\.supabase\.co\b/gi, "")
    // K8s-shaped internal DNS (e.g. some-svc.ahura.svc.cluster.local) — the
    // exact shape a leaked error from an in-cluster call would carry.
    .replace(/[\w-]+\.[\w-]+\.svc\.cluster\.local\b/gi, "internal service")
    .replace(/\bAGENT_KERNEL_SENTINEL\b/g, "session token")
    .trim();
}
