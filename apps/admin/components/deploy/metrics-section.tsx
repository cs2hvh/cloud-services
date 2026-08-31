import type { MetricsView } from "@/lib/paas/telemetry/operator";
import { Panel, Unavailable, Callout, Table, bytes } from "./bits";

/** Per-app CPU and memory from metrics.k8s.io. Throws upstream when absent. */
export function MetricsSection({
  metrics,
}: {
  metrics: MetricsView | { error: string };
}) {
  return (
    <Panel
      title="Metrics"
      subtitle="Per-app CPU and memory from metrics.k8s.io — zeros are never faked"
    >
      {"error" in metrics ? (
        <Unavailable error={metrics.error} />
      ) : (
        <>
          {metrics.unreadable > 0 && (
            <Callout tone="warning">
              {metrics.unreadable} pod(s) had unreadable usage — totals are
              understated by those pods.
            </Callout>
          )}

          {metrics.deployments.length > 0 ? (
            <Table head={["deployment", "namespace", "pods", "cpu", "memory"]}>
              {metrics.deployments.map((d) => (
                <tr key={`${d.namespace}/${d.deploymentRef}`} className="border-t border-border/60">
                  <td className="py-1.5 pr-4">{d.deploymentRef}</td>
                  <td className="py-1.5 pr-4 text-muted-foreground">{d.namespace}</td>
                  <td className="py-1.5 pr-4">{d.pods}</td>
                  <td className="py-1.5 pr-4">
                    {d.cpuCores === null ? "unreadable" : `${(d.cpuCores * 1000).toFixed(0)}m`}
                  </td>
                  <td className="py-1.5">
                    {d.memoryBytes === null ? "unreadable" : bytes(d.memoryBytes)}
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <p className="text-xs text-muted-foreground">
              No tenant pods are reporting usage.
            </p>
          )}
        </>
      )}
    </Panel>
  );
}
