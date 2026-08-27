/**
 * Turning charge rows into a statement a customer can check.
 *
 * Kept out of the route because this is the part that can be wrong in a way
 * nobody notices: the route's remaining job is auth and a query, both of which
 * fail loudly. An arithmetic mistake here produces a number that looks like a
 * bill and isn't one.
 *
 * EVERY FIGURE IS SUMMED FROM ROWS, never recomputed from the project's current
 * tier. The rows record what was ACTUALLY taken — including the tier and
 * instance count at the time — so re-deriving a total from today's tier would
 * restate history the moment somebody resized, and the restated figure would
 * disagree with the balance for reasons no one could trace.
 */
/** One billed hour, as stored. `amount_usd` arrives from PostgREST as a string. */
export interface ChargeRow {
  period_start: string;
  amount_usd: number | string | null;
  tier?: string | null;
  instances?: number | null;
}

export interface DaySummary {
  day: string;
  hours: number;
  amountUsd: number;
}

export interface UsageSummary {
  hoursBilled: number;
  totalUsd: number;
  byDay: DaySummary[];
  /**
   * Rows whose amount could not be read as a number. Never folded into the
   * total and never silently dropped: see `summariseCharges`.
   */
  unreadable: number;
}

/** Money, to the sixth decimal. Hourly rates are fractions of a cent. */
const round = (n: number): number => Math.round(n * 1e6) / 1e6;

/**
 * Sum charge rows into a per-day statement.
 *
 * A ROW WHOSE AMOUNT CANNOT BE READ IS COUNTED, NOT ADDED. `Number(null)` is 0
 * and `Number("abc")` is NaN, and both are worse than an error here: the zero
 * quietly understates a bill, and the NaN poisons every total it touches —
 * `Math.round(NaN)` is NaN, which serialises to JSON `null`, so the customer is
 * shown a blank where a figure should be and nothing anywhere reports a fault.
 *
 * So unreadable rows are excluded from the money and surfaced as a count. The
 * total stays a true sum of the rows it could read, and the caller can see that
 * it is not the whole story.
 */
export function summariseCharges(rows: readonly ChargeRow[]): UsageSummary {
  const byDay = new Map<string, { hours: number; amount: number }>();
  let total = 0;
  let billable = 0;
  let unreadable = 0;

  for (const row of rows) {
    // `Number("")` is 0, so blank is rejected before conversion — the same
    // distinction assessArrears draws: empty is not the same as zero.
    const raw = row.amount_usd;
    const amount = raw === null || raw === undefined || String(raw).trim() === "" ? NaN : Number(raw);

    if (!Number.isFinite(amount)) {
      unreadable++;
      continue;
    }

    // A day key needs a real date. A row we cannot place in time cannot appear
    // on a dated statement, so it is unreadable for the same reason.
    const day = String(row.period_start ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day))) {
      unreadable++;
      continue;
    }

    total += amount;
    billable++;
    const acc = byDay.get(day) ?? { hours: 0, amount: 0 };
    acc.hours += 1;
    acc.amount += amount;
    byDay.set(day, acc);
  }

  return {
    hoursBilled: billable,
    totalUsd: round(total),
    // Newest first, the order a person reads a statement in.
    byDay: [...byDay.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([day, v]) => ({ day, hours: v.hours, amountUsd: round(v.amount) })),
    unreadable,
  };
}
