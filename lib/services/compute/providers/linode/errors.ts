// Customer-facing translation of upstream provider errors.
//
// Two rules, in order:
//   1. Never name the upstream provider. The service is resold, and
//      docs/LINODE_COMPUTE.md forbids the provider appearing in any customer
//      surface — dashboard, toasts, errors, or emails. Upstream reasons are
//      written for the account holder, not for our customers, so they leak the
//      name freely ("Linode busy.").
//   2. Turn the reasons customers actually hit into something actionable.
//      Everything else passes through scrubbed: upstream *validation* text
//      ("label must be...") is genuinely more useful than a generic fallback.

const PROVIDER_NAMES: Array<[RegExp, string]> = [
    [/\blinodes?\b/gi, "server"],
    [/\bakamai\b/gi, "the provider"],
];

/** Known upstream reasons → copy a customer can act on. */
const TRANSLATIONS: Array<[RegExp, string]> = [
    [
        /busy/i,
        "This server is busy with another operation. Please wait for it to finish, then try again.",
    ],
    [
        /stats are unavailable/i,
        "Metrics aren't available yet. They start appearing a few minutes after a server boots.",
    ],
    [/not found/i, "That resource is no longer available."],
];

/**
 * Make an upstream error message safe and useful for a customer.
 *
 * @param message  the raw upstream reason (may be empty)
 * @param fallback used when the upstream gave us nothing to work with
 */
export function sanitizeProviderMessage(message: string | undefined, fallback: string): string {
    const trimmed = (message ?? "").trim();
    if (!trimmed) return fallback;

    for (const [pattern, copy] of TRANSLATIONS) {
        if (pattern.test(trimmed)) return copy;
    }

    let scrubbed = trimmed;
    for (const [pattern, replacement] of PROVIDER_NAMES) {
        scrubbed = scrubbed.replace(pattern, replacement);
    }
    return scrubbed;
}
