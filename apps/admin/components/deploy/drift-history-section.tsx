import { Panel, Unavailable, StatusChip, Table, money } from "./bits";

/**
 * paas.drift_observations, read directly. The point-in-time drift views above
 * answer "what is wrong now"; this table answers the one question they cannot:
 * when did it appear and how long has it persisted. Append-and-resolve, so
 * resolved rows stay visible instead of vanishing — a drift that keeps
 * reappearing and resolving is its own finding.
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

function age(fromIso: string, toIso?: string | null): string {
  const ms = (toIso ? Date.parse(toIso) : Date.now()) - Date.parse(fromIso);
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return `${Math.max(1, Math.floor(ms / 60_000))}m`;
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function DriftHistorySection({
  rows,
}: {
  rows: DriftObservationRow[] | { error: string };
}) {
  return (
    <Panel
      title="Drift history"
      subtitle="paas.drift_observations — when each finding appeared and how long it has persisted"
    >
      {"error" in rows ? (
        <Unavailable error={rows.error} />
      ) : (
        <DriftTables rows={rows} />
      )}
    </Panel>
  );
}

function DriftTables({ rows }: { rows: DriftObservationRow[] }) {
  // Longest-open first: duration is the fact this table exists to show.
  const open = rows
    .filter((r) => r.resolved_at === null)
    .sort((a, b) => Date.parse(a.observed_at) - Date.parse(b.observed_at));
  const resolved = rows.filter((r) => r.resolved_at !== null).slice(0, 20);

  return (
    <>
      {open.length > 0 ? (
        <Table head={["kind", "resource", "id", "cost", "detail", "open for"]}>
          {open.map((r) => (
            <Row key={`${r.kind}-${r.resource_type}-${r.cloud_id ?? r.ref}-${r.observed_at}`} r={r} />
          ))}
        </Table>
      ) : (
        <p className="text-xs text-muted-foreground">
          Nothing unresolved. {rows.length === 0 && "No observations recorded yet — check the sweeps section before reading this as clean."}
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

function Row({ r }: { r: DriftObservationRow }) {
  return (
    <tr className="border-t border-border/60">
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
      <td className="py-1.5 font-semibold">{age(r.observed_at)}</td>
    </tr>
  );
}
