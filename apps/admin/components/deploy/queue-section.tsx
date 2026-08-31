import type { QueueView } from "@/lib/paas/telemetry/operator";
import {
  Panel,
  Unavailable,
  Callout,
  StatusChip,
  Table,
  seconds,
} from "./bits";

/**
 * The build queue, in flight separated from history — merged into one table,
 * a queue that has silently stopped moving looks identical to an idle one.
 */
export function QueueSection({ queue }: { queue: QueueView | { error: string } }) {
  return (
    <Panel
      title="Build queue"
      subtitle="paas.deployments in flight, and the last 24 hours"
    >
      {"error" in queue ? (
        <Unavailable error={queue.error} />
      ) : (
        <>
          {queue.note && <Callout tone="warning">{queue.note}</Callout>}

          {queue.inFlight.length > 0 ? (
            <Table head={["state", "project", "deployment", "sha", "age"]}>
              {queue.inFlight.map((d) => (
                <tr key={d.deployment} className="border-t border-border/60">
                  <td className="py-1.5 pr-4">
                    <StatusChip status={d.state} />
                  </td>
                  <td className="py-1.5 pr-4">{d.projectName ?? d.project ?? "(no project)"}</td>
                  <td className="py-1.5 pr-4">{d.deployment}</td>
                  <td className="py-1.5 pr-4">{d.sha ?? "?"}</td>
                  <td className="py-1.5">
                    {d.state === "queued"
                      ? `waiting ${seconds(d.waitingSeconds ?? 0)}`
                      : `running ${seconds(d.runningSeconds ?? 0)}`}
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <p className="text-xs text-muted-foreground">
              Nothing in flight. This does NOT prove a worker is running — a
              stopped queue and an idle one look the same from the database.
            </p>
          )}

          {queue.recent.length > 0 && (
            <div className="mt-4">
              <p className="mb-1 text-xs font-medium">
                Last {queue.windowHours}h
              </p>
              <Table head={["state", "project", "deployment", "branch", "error"]}>
                {queue.recent.slice(0, 12).map((d) => (
                  <tr key={d.deployment} className="border-t border-border/60">
                    <td className="py-1.5 pr-4">
                      <StatusChip status={d.state} />
                    </td>
                    <td className="py-1.5 pr-4">{d.projectName ?? d.project ?? "?"}</td>
                    <td className="py-1.5 pr-4">{d.deployment}</td>
                    <td className="py-1.5 pr-4">{d.branch}</td>
                    <td className="max-w-[360px] truncate py-1.5 text-red-300">
                      {d.state === "error" ? (d.error ?? d.errorCode ?? "no reason recorded") : ""}
                    </td>
                  </tr>
                ))}
              </Table>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
