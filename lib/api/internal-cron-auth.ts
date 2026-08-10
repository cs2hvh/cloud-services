import { timingSafeEqual } from "crypto";

/**
 * Authorisation for cron-only internal endpoints.
 *
 * Two credentials are accepted, because two things drive these routes:
 *
 *   Authorization: Bearer <CRON_SECRET>       — a system crontab
 *   X-Ahura-Internal-Token: <BATCH_PROCESSOR_TOKEN>
 *                                             — the Cloudflare worker, which
 *                                               already sends this header to
 *                                               every other control-plane sweep
 *
 * Accepting both means the existing worker schedule can drive these without
 * anyone remembering a crontab line. That mattered: every provider sync was
 * guarded by CRON_SECRET alone and nothing invoked it, so linode_types went
 * 6 days without a refresh, gpu_inventory_snapshots 2.5 days, and gpu_catalog
 * 41 days — while the pages built on them presented the data as current.
 *
 * Both are full-strength shared secrets compared in constant time. This widens
 * who can trigger a sweep, not how weakly it is checked.
 *
 * This replaced four byte-identical copies of the Bearer check, which is how
 * the second credential came to be missing from all of them at once.
 */
function matches(provided: string | null | undefined, expected: string | undefined): boolean {
  if (!provided || !expected) return false;
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

export function authorizeInternalCron(req: {
  headers: { get(name: string): string | null };
}): boolean {
  const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") || "")?.[1];
  if (matches(bearer, process.env.CRON_SECRET)) return true;
  return matches(
    req.headers.get("x-ahura-internal-token"),
    process.env.BATCH_PROCESSOR_TOKEN
  );
}
