/**
 * What `inference.usage` does and does not know about who served a request,
 * and where it is missing rows outright.
 *
 * Two separate facts get confused if they are not written down, and both
 * make the panel report a number that is not true:
 *
 *   1. WHO SERVED IT. The column was `text NOT NULL DEFAULT 'openrouter'`
 *      from the era when OpenRouter really was the single upstream. Rows
 *      before the gateway began stamping the partner carry that default and
 *      mean "nobody recorded it". Rows AFTER it may be legitimately null,
 *      which means "no partner was involved" - our own pods, a cache hit,
 *      or an error raised before any upstream was called. Rolling those two
 *      together would file our own pods under a decommissioned vendor.
 *
 *   2. MISSING ROWS. The NOT NULL constraint rejected every event the
 *      consumer wrote with a null provider, Cloudflare Queues retried the
 *      batch three times and dropped it, and there is no dead-letter queue.
 *      Hosted-pod usage therefore stopped being recorded entirely for
 *      nearly two days. Those rows are gone and cannot be recovered.
 *
 * A window overlapping a gap is INCOMPLETE, and a total drawn from it is a
 * floor, not a figure. Zero rows there means "not recorded", never "no
 * usage" - and the difference is money that was served and not billed.
 */

/**
 * When the gateway began writing the real partner into usage.provider.
 * Measured, not assumed: the last row carrying the old default is
 * 2026-09-18 12:05:36.505Z and the first stamped row is 12:07:08.527Z.
 */
export const PROVIDER_STAMPING_STARTED_AT = Date.parse(
  "2026-09-18T12:07:08.527Z",
);

/** Rows the pipeline is known to have dropped, with what they covered. */
export type UsageGap = {
  id: string;
  fromISO: string;
  toISO: string;
  affects: string;
  cause: string;
  recoverable: boolean;
};

export const USAGE_GAPS: UsageGap[] = [
  {
    id: "provider-not-null-drop",
    // Bounded by the data: the last hosted-pod row written, and the first
    // one written after the column was made nullable.
    fromISO: "2026-09-18T12:05:36.505Z",
    toISO: "2026-09-20T09:47:12.027Z",
    affects:
      "hosted-pod requests, cache hits and errors raised before any upstream — plus any partner event that shared a batch with one",
    cause:
      "usage.provider was NOT NULL, so events with no partner were rejected; the batch was retried three times and dropped with no dead-letter queue",
    recoverable: false,
  },
];

/** Gaps overlapping [since, until]. `until` defaults to now. */
export function gapsOverlapping(since: Date | string, until?: Date | string): UsageGap[] {
  const a = typeof since === "string" ? Date.parse(since) : since.getTime();
  const b = until
    ? typeof until === "string"
      ? Date.parse(until)
      : until.getTime()
    : Date.now();
  return USAGE_GAPS.filter(
    (g) => Date.parse(g.fromISO) <= b && Date.parse(g.toISO) >= a,
  );
}

/** How a row with no partner name should be reported. */
export const NO_PARTNER = "(no partner)";
export const UNSTAMPED = "(unstamped)";

/**
 * Bucket a usage row by who served it.
 *
 * `null` after stamping began is a fact: no partner was involved. `null`
 * or the old default before it is an absence of a fact. They are never
 * merged, because one is our own infrastructure and the other is a gap in
 * the record.
 */
export function providerBucket(
  provider: string | null | undefined,
  createdAt: string | number | Date,
): string {
  const t =
    typeof createdAt === "number"
      ? createdAt
      : typeof createdAt === "string"
        ? Date.parse(createdAt)
        : createdAt.getTime();
  const stamped = Number.isFinite(t) && t >= PROVIDER_STAMPING_STARTED_AT;

  if (provider === null || provider === undefined || provider === "") {
    return stamped ? NO_PARTNER : UNSTAMPED;
  }
  // The old default only ever appears before the cutover; if one turns up
  // after it, something is writing the literal string and it is still not
  // evidence of a partner.
  if (provider === "openrouter" && !stamped) return UNSTAMPED;
  return provider;
}

/** True for buckets that name no partner, so callers can exclude them. */
export function isPartnerBucket(bucket: string): boolean {
  return bucket !== NO_PARTNER && bucket !== UNSTAMPED;
}
