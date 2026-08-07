/**
 * Who a usage row is attributed to when no customer API key made the request.
 *
 * `inference.usage.api_key_id` is NOT NULL but carries no foreign key. Several
 * paths legitimately have no key to name:
 *
 *   - the media-job watchdog settling a job the customer stopped polling
 *   - the batch processor (inference.batches has no api_key_id column at all)
 *   - anything running on the gateway's on-behalf-of identity
 *
 * Passing `null` there does not fail loudly — it throws 23502 inside a
 * try/catch that logs and continues, so the work completes and the usage row is
 * simply never written. That is how a recovered video was delivered free, and
 * the same shape is in the batch processor.
 *
 * The gateway already settled on a sentinel for exactly this and has written it
 * to hundreds of rows (OBO_API_KEY_ID in
 * workers/inference/src/lib/on-behalf-of.ts). This module is the Next-side
 * mirror so the two halves of the platform agree on one value instead of each
 * inventing its own — it is deliberately duplicated rather than imported,
 * because that module is Worker-side and cannot be pulled into Next.
 *
 * KEEP IN SYNC with workers/inference/src/lib/on-behalf-of.ts.
 */

/**
 * Attribution for usage a real customer key did not make.
 *
 * Not a real row in inference.api_keys — joins against it will not resolve, and
 * that is intended: it marks "platform-side work for this org" rather than
 * pretending some key was responsible.
 */
export const NO_CUSTOMER_KEY_ID = "00000000-0000-0000-0000-0000000000a9";

/**
 * Resolve the api_key_id for a usage row.
 *
 * Use this rather than `?? NO_CUSTOMER_KEY_ID` at each call site, so the
 * "empty string is not a key either" case cannot be reintroduced one caller at
 * a time.
 */
export function usageApiKeyId(keyId: string | null | undefined): string {
  const trimmed = typeof keyId === "string" ? keyId.trim() : "";
  return trimmed.length > 0 ? trimmed : NO_CUSTOMER_KEY_ID;
}
