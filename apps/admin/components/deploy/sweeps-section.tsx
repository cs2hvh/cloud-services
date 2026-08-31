import type { SweepView } from "@/lib/paas/telemetry/operator";
import { Panel, Unavailable, Callout, StatusChip, Table } from "./bits";

/**
 * The observers, observed. A sweep that never runs produces silence, and
 * silence renders exactly like a clean result — this section exists so it
 * cannot.
 */
export function SweepsSection({ sweeps }: { sweeps: SweepView | { error: string } }) {
  return (
    <Panel
      title="Sweeps"
      subtitle="Are the CronJobs feeding every view above actually running?"
    >
      {"error" in sweeps ? (
        <Unavailable error={sweeps.error} />
      ) : (
        <>
          {sweeps.report.unobserved > 0 && (
            <Callout tone="warning">
              {sweeps.report.unobserved} sweep domain(s) have never been
              observed at all — their silence must not be read as clean.
            </Callout>
          )}
          {sweeps.report.untranslated > 0 && (
            <Callout tone="warning">
              {sweeps.report.untranslated} sweep(s) report findings in a way the
              scheduler reads as a crash.
            </Callout>
          )}

          <Table head={["sweep", "status", "schedule", "last success"]}>
            {sweeps.report.sweeps.map((s) => (
              <tr key={s.name} className="border-t border-border/60">
                <td className="py-1.5 pr-4">{s.name}</td>
                <td className="py-1.5 pr-4">
                  <StatusChip status={s.status} />
                </td>
                <td className="py-1.5 pr-4 text-muted-foreground">{s.schedule}</td>
                <td className="py-1.5">
                  {s.minutesSinceSuccess === null
                    ? "never"
                    : `${s.minutesSinceSuccess}m ago`}
                </td>
              </tr>
            ))}
          </Table>
        </>
      )}
    </Panel>
  );
}
