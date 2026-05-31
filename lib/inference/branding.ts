/**
 * Single source of truth for customer-visible branded URLs, image
 * references, and support contact details. Every customer-facing
 * dashboard string that mentions a hostname, image URI, or email
 * should import from here.
 *
 * The defaults point at the ahurasense.com production domain. Override
 * per environment via the NEXT_PUBLIC_* vars below (e.g. a staging host);
 * see docs/inference/migration-ahurasense.md for the full
 * cs2hvh.com -> ahurasense.com migration runbook + rollback.
 *
 * All vars are NEXT_PUBLIC_* because they appear in client-rendered
 * snippets (curl examples, copy-pasteable docker commands, etc.).
 * Next.js inlines these at build time, so changing them requires
 * a redeploy.
 */

export const INFERENCE_API_BASE =
  process.env.NEXT_PUBLIC_INFERENCE_API_BASE ?? "https://api.ahurasense.com/v1";

export const INFERENCE_API_ORIGIN =
  process.env.NEXT_PUBLIC_INFERENCE_API_ORIGIN ?? "https://api.ahurasense.com";

export const DASHBOARD_URL =
  process.env.NEXT_PUBLIC_DASHBOARD_URL ?? "https://app.ahurasense.com";

export const SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@ahurasense.com";

/**
 * Public OCI image used by customers who self-serve FT adapters on
 * their own GPU instance. Shown in the dashboard's docker-command
 * snippet and copied verbatim into the customer's shell.
 *
 * Note: there is a parallel server-side env var `AHURA_SERVING_IMAGE_URI`
 * read by `lib/inference/serving-pod.ts` for the managed-serving path.
 * Operators should keep both env vars set to the same image so the
 * customer-visible copy and the actual provisioned image match.
 */
export const SERVING_IMAGE_URI =
  process.env.NEXT_PUBLIC_SERVING_IMAGE_URI ??
  "ghcr.io/cs2hvh/ahura-ft-serving-vllm:vllm-0.7.3";
