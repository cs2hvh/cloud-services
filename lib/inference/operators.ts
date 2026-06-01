/**
 * AhuraCloud platform operators — staff who run the platform, as
 * distinct from customers (who run on top of it).
 *
 * "Operator" gates access to infra-detail surfaces (the detailed
 * diagnostics page, raw remediation hints, secret rotation runbooks).
 * Customer org owners/admins do NOT count as operators — they're
 * still on the customer side of the brand boundary and shouldn't
 * see internal provider names.
 *
 * Source of truth is the env var INFERENCE_OPERATOR_EMAILS — a
 * comma-separated list of full email addresses. Easy to grow without
 * a schema change; trivially auditable via .env diff.
 *
 * Future direction: move to a dedicated inference.operators table
 * once we have more than a handful of staff. For now an env var keeps
 * the trust boundary simple — no DB row to forget to revoke.
 */

let cached: Set<string> | null = null;

function load(): Set<string> {
  if (cached) return cached;
  const raw = process.env.INFERENCE_OPERATOR_EMAILS ?? "";
  cached = new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
  return cached;
}

export function isPlatformOperator(email: string | null | undefined): boolean {
  if (!email) return false;
  return load().has(email.trim().toLowerCase());
}
