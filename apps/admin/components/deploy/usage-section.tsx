import type { UsageView } from "@/lib/paas/telemetry/operator";
import { Panel, Unavailable, FindingRow, Table } from "./bits";

/** What is running right now, plus abuse/quota signals from the same read. */
export function UsageSection({ usage }: { usage: UsageView | { error: string } }) {
  return (
    <Panel
      title="Running now"
      subtitle="A point-in-time read, not accumulated usage — signals derive from the same observation"
    >
      {"error" in usage ? (
        <Unavailable error={usage.error} />
      ) : (
        <>
          {usage.signals.length > 0 && (
            <ul className="mb-4">
              {usage.signals.map((s, i) => (
                <FindingRow
                  key={`${s.kind}-${s.subject}-${i}`}
                  status={s.severity}
                  label={`${s.kind} · ${s.subject}`}
                  detail={s.detail}
                  action={s.action}
                  aside={`${s.value} vs ${s.threshold}`}
                />
              ))}
            </ul>
          )}

          {usage.apps.length > 0 ? (
            <Table head={["deployment", "project", "pods", "restarts", "running since"]}>
              {usage.apps.map((a) => (
                <tr key={a.appKey} className="border-t border-border/60">
                  <td className="py-1.5 pr-4">{a.appKey}</td>
                  <td className="py-1.5 pr-4 text-muted-foreground">{a.projectRef}</td>
                  <td className="py-1.5 pr-4">{a.pods}</td>
                  <td className="py-1.5 pr-4">{a.restarts}</td>
                  <td className="py-1.5">
                    {a.runningSince
                      ? new Date(a.runningSince).toUTCString().slice(5, 22)
                      : "—"}
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <p className="text-xs text-muted-foreground">
              No tenant pods running — every app is scaled to zero.
            </p>
          )}

          <p className="mt-3 text-xs text-muted-foreground">
            {usage.builds.builds} build(s) in 24h ·{" "}
            {(usage.builds.buildSeconds / 60).toFixed(1)} build minutes ·{" "}
            {usage.builds.inFlight} in flight. Warm fraction is not shown — it
            is an accumulation and cannot be derived from one observation.
          </p>
        </>
      )}
    </Panel>
  );
}
