import { Panel, Unavailable, Callout, StatusChip, Table, money } from "./bits";

/**
 * paas.drift_observations, read directly. The point-in-time drift views above
 * answer "what is wrong now"; this table records when a finding appeared and
 * how long it persisted.
 *
 * IT IS A SNAPSHOT, NOT A LIVE HISTORY. Rows are written and resolved only
 * when the drift aggregator (scripts/v3/drift-sweep.ts) is run by hand — the
 * hourly leaf sweeps report but persist nothing, deliberately, because
 * scheduling the aggregator would concentrate every platform credential in
 * one pod. So the section leads with when the table was last written: a stale
 * table that says it is stale is honest, one that doesn't is a lie — a reader
 * otherwise sees plausible ages and concludes the world still looks like
 * this.
 */
export interface DriftObservationRow {
  kind: string;
  resource_type: string;
  cloud_id: string | null;
  ref: string | null;
  hourly_usd: number | null;
  detail: string;
  observed_at: string;
  resolved_at: string | null;
}

export interface DriftHistory {
  /** Unbounded — open rows must never be silently truncated. */
  open: DriftObservationRow[];
  /** Recently resolved, capped. */
  resolved: DriftObservationRow[];
}

function age(fromIso: string, toIso?: string | null): string {
  const ms = (toIso ? Date.parse(toIso) : Date.now()) - Date.parse(fromIso);
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return `${Math.max(1, Math.floor(ms / 60_000))}m`;
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/** Latest write to the table — a resolve is a write too. */
function lastRecorded(history: DriftHistory): string | null {
  let max: string | null = null;
  for (const r of [...history.open, ...history.resolved]) {
    for (const t of [r.observed_at, r.resolved_at]) {
      if (t && (!max || t > max)) max = t;
    }
  }
  return max;
}

export function DriftHistorySection({
  history,
}: {
  history: DriftHistory | { error: string };
}) {
  return (
    <Panel
      title="Drift history"
      subtitle="paas.drift_observations — when each finding appeared and how long it has persisted"
    >
      {"error" in history ? (
        <Unavailable error={history.error} />
      ) : (
        <DriftTables history={history} />
      )}
    </Panel>
  );
}

function DriftTables({ history }: { history: DriftHistory }) {
  const { open, resolved } = history;
  const last = lastRecorded(history);

  return (
    <>
      <Callout tone="warning">
        Snapshot, not a live history — rows are written only when the drift
        aggregator is run by hand; the hourly sweeps report but persist
        nothing.{" "}
        {last ? (
          <>
            Last recorded{" "}
            <strong className="font-semibold">
              {new Date(last).toUTCString().slice(5, 22)} ({age(last)} ago)
            </strong>
            . Anything fixed or newly drifted since then is not reflected
            below.
          </>
        ) : (
          <>The table has never been written.</>
        )}
      </Callout>

      {open.length > 0 ? (
        <Table head={["kind", "resource", "id", "cost", "detail", "recorded"]}>
          {open.map((r) => (
            <tr
              key={`${r.kind}-${r.resource_type}-${r.cloud_id ?? r.ref}-${r.observed_at}`}
              className="border-t border-border/60"
            >
              <td className="py-1.5 pr-4">
                <StatusChip status={r.kind} />
              </td>
              <td className="py-1.5 pr-4">{r.resource_type}</td>
              <td className="py-1.5 pr-4">{r.cloud_id ?? r.ref ?? "—"}</td>
              <td className="py-1.5 pr-4">
                {r.hourly_usd === null ? "—" : `${money(r.hourly_usd, 4)}/hr`}
              </td>
              <td className="max-w-[360px] truncate py-1.5 pr-4 text-muted-foreground">
                {r.detail}
              </td>
              <td className="py-1.5 font-semibold">{age(r.observed_at)} ago</td>
            </tr>
          ))}
        </Table>
      ) : (
        <p className="text-xs text-muted-foreground">
          No open observations recorded
          {last === null &&
            " — and the table has never been written, so this says nothing about the world"}
          .
        </p>
      )}

      {resolved.length > 0 && (
        <div className="mt-4">
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Recently resolved
          </p>
          <Table head={["kind", "resource", "id", "detail", "was open"]}>
            {resolved.map((r) => (
              <tr
                key={`${r.kind}-${r.resource_type}-${r.cloud_id ?? r.ref}-${r.observed_at}`}
                className="border-t border-border/60 opacity-60"
              >
                <td className="py-1.5 pr-4">
                  <StatusChip status={r.kind} />
                </td>
                <td className="py-1.5 pr-4">{r.resource_type}</td>
                <td className="py-1.5 pr-4">{r.cloud_id ?? r.ref ?? "—"}</td>
                <td className="max-w-[360px] truncate py-1.5 pr-4 text-muted-foreground">
                  {r.detail}
                </td>
                <td className="py-1.5">{age(r.observed_at, r.resolved_at)}</td>
              </tr>
            ))}
          </Table>
        </div>
      )}
    </>
  );
}
