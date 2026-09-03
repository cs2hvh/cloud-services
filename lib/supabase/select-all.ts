/**
 * Read EVERY row of a query, in pages.
 *
 * This Supabase project caps every PostgREST response at 1000 rows
 * (db-max-rows) no matter what limit is asked for — verified: a select with
 * `.limit(3000)` returned exactly 1000 rows and no error. So any read that
 * sums, counts, or iterates "all rows" over a table that has grown past that
 * quietly works on the first 1000: the Linode availability read made whole
 * regions look sold out this way, and a month total summed over 1000 rows is
 * simply a smaller number, not an error anyone sees.
 *
 * `buildQuery(from, to)` must return a fresh query for the inclusive row range
 * — a supabase-js builder ending in `.range(from, to)`, or anything else that
 * resolves to `{ data, error }`. The query MUST carry a total order (an
 * `.order()` on a unique column, or created_at plus id): PostgREST pages an
 * unordered query in whatever order the planner picks, and pages can then
 * overlap or skip rows while the table changes underneath.
 *
 * Throws on the first failed page rather than returning what it has so far —
 * a partial result is indistinguishable from a complete one to the caller.
 */

/** The shape of one resolved page. supabase-js builders satisfy this as-is. */
export interface PageResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

export interface SelectAllOptions {
  /**
   * Rows per page. Defaults to, and must not exceed, the server cap: the loop
   * stops at the first short page, and a page shorter than the cap only means
   * "last page" if the server could have filled it.
   */
  pageSize?: number;
  /** Throw once more than this many rows have been read — for reads that must never be this large. */
  maxRows?: number;
  /** Names the read in the thrown error, e.g. "audits.audit_logs". */
  label?: string;
}

/** db-max-rows on this project. Asking for more returns exactly this many. */
export const POSTGREST_MAX_ROWS = 1000;

export async function selectAll<T>(
  buildQuery: (from: number, to: number) => PromiseLike<PageResult<T>>,
  opts: SelectAllOptions = {}
): Promise<T[]> {
  const pageSize = opts.pageSize ?? POSTGREST_MAX_ROWS;
  const label = opts.label ?? "selectAll";
  if (!(pageSize > 0) || pageSize > POSTGREST_MAX_ROWS) {
    // A page larger than the cap comes back short every time, and a short
    // page is the loop's "done" signal — the read would stop after one page.
    throw new Error(`[${label}] pageSize must be 1..${POSTGREST_MAX_ROWS}, got ${pageSize}`);
  }

  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await buildQuery(from, to);
    // Prevents: a failed page returned as the rows read so far.
    if (error) throw new Error(`[${label}] rows ${from}-${to} failed: ${error.message}`);
    const page = data ?? [];
    rows.push(...page);
    if (opts.maxRows !== undefined && rows.length > opts.maxRows) {
      throw new Error(`[${label}] more than maxRows=${opts.maxRows} rows; refusing to read them all`);
    }
    if (page.length < pageSize) break;
  }
  return rows;
}
