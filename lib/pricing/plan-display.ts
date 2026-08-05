// Customer-facing plan naming.
//
// Upstream type labels ARE the provider's product names — "Nanode 1GB",
// "Linode 2GB", "Linode 90GB" — and docs/LINODE_COMPUTE.md forbids the
// provider appearing in any customer surface (dashboard, toasts, errors,
// emails). 15 of the 56 resold plans leak it verbatim, so the rename has to
// happen at the customer API boundary.
//
// Admin screens deliberately keep the upstream labels: operators need to match
// what they see against the provider console.
//
// The replacement words below are a neutral default, NOT a branding decision.
// Swap them once product picks the real names.

const LABEL_REPLACEMENTS: Array<[RegExp, string]> = [
    [/^nanode\b/i, "Starter"],
    [/^linode\b/i, "Standard"],
];

/** Slug prefix used to namespace resold plans in `servers.plan_slug`. */
const PLAN_SLUG_PREFIX = "linode:";

/**
 * Rewrite an upstream plan label for customer display.
 * "Linode 2GB" → "Standard 2GB", "Nanode 1GB" → "Starter 1GB".
 * Labels that never named the provider ("Dedicated 4GB") pass through.
 */
export function formatPlanLabel(label: string | null | undefined): string {
    const trimmed = (label ?? "").trim();
    if (!trimmed) return "";
    for (const [pattern, replacement] of LABEL_REPLACEMENTS) {
        if (pattern.test(trimmed)) return trimmed.replace(pattern, replacement);
    }
    return trimmed;
}

/**
 * Strip the internal namespace from a plan slug before showing it.
 * `linode:g6-standard-1` → `g6-standard-1`. Returns null for empty input so
 * callers can fall back to a spec summary.
 */
export function formatPlanSlug(slug: string | null | undefined): string | null {
    const trimmed = (slug ?? "").trim();
    if (!trimmed) return null;
    return trimmed.startsWith(PLAN_SLUG_PREFIX)
        ? trimmed.slice(PLAN_SLUG_PREFIX.length)
        : trimmed;
}
