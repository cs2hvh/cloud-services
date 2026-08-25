/**
 * Read more than 1,000 rows from PostgREST without silently losing the rest.
 *
 * THE TRAP: PostgREST enforces a maximum rows-per-response (1,000 on this
 * project) and applies it **without erroring**. `.limit(20000)` does not fail,
 * does not warn, and does not set any flag — it just returns 1,000 rows. Every
 * figure computed from that array is then wrong while looking entirely plausible.
 *
 * MEASURED, NOT THEORETICAL (2026-08-04). The AI Usage page asked for 20,000
 * rows over a 30-day window that contained 1,572. It received 1,000, reported
 * `truncated: false` — because its own check was `rows.length >= 20000` — and
 * under-stated platform spend by **34%**: 1,090 cents shown against 1,662 actual.
 * Total spend, margin, by-model, by-org and by-day were all computed from that
 * short array.
 *
 * This module exists because that mistake is invisible at small scale and
 * arrives without symptoms: the page keeps working, the numbers just quietly
 * stop being true once a window crosses 1,000 rows.
 *
 * THE RULE: never `.limit(n)` with n > 1,000 when you intend to read them all.
 * Page with `.range()` until a short page arrives, and report truncation from
 * the cap you chose — never from the length of what came back.
 *
 * Two callers already got this right and are the model: the traces route pages
 * because percentiles over a truncated sample are meaningless, and the overview
 * route sets its sample to exactly 1,000 and tests `length >= ORG_SAMPLE`, which
 * detects the cap correctly because the numbers coincide.
 */

/** PostgREST's per-response ceiling on this project. Not configurable from here. */
export const POSTGREST_MAX_ROWS = 1_000;

export interface PagedResult<T> {
  rows: T[];
  /**
   * True when `maxRows` was reached and more rows exist beyond it.
   *
   * This is a real, deliberate bound — not the accidental 1,000-row cap, which
   * this function exists to make impossible.
   */
  truncated: boolean;
  /** Set when a page failed; `rows` then holds whatever was read before it. */
  error: string | null;
  /** How many round trips it took. Useful for spotting a runaway window. */
  pages: number;
}

/**
 * Page a query to completion, or to `maxRows`, whichever comes first.
 *
 * `makeQuery` must apply `.range(from, to)` and every other filter, so this
 * function stays agnostic about schema, table and shape:
 *
 *     await readAllPaged<UsageRow>(
 *       (from, to) => supabase.schema("inference").from("usage")
 *         .select("cost_cents, created_at")
 *         .gte("created_at", since)
 *         .order("created_at", { ascending: false })
 *         .range(from, to)
 *         .returns<UsageRow[]>(),
 *       { maxRows: 20_000 }
 *     );
 */
export async function readAllPaged<T>(
  makeQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  opts: { maxRows: number; pageSize?: number }
): Promise<PagedResult<T>> {
  // A page larger than the server's ceiling would be silently shortened — the
  // exact failure this module prevents — so it is clamped here rather than
  // trusted to the caller.
  const pageSize = Math.min(opts.pageSize ?? POSTGREST_MAX_ROWS, POSTGREST_MAX_ROWS);
  const rows: T[] = [];
  let pages = 0;

  while (rows.length < opts.maxRows) {
    const from = rows.length;
    const to = Math.min(from + pageSize, opts.maxRows) - 1;
    const { data, error } = await makeQuery(from, to);
    pages++;

    // Return what we have plus the error. A partial read an operator knows about
    // beats an empty page, as long as it is never presented as complete.
    if (error) return { rows, truncated: false, error: error.message, pages };

    const batch = data ?? [];
    rows.push(...batch);

    // A short page means the result set is exhausted. This is the ONLY correct
    // termination test: a full page tells you nothing about whether more exist.
    if (batch.length < to - from + 1) return { rows, truncated: false, error: null, pages };
  }

  return { rows, truncated: true, error: null, pages };
}
