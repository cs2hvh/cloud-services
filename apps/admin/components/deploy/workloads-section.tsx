import type { WorkloadView } from "@/lib/paas/telemetry/operator";
import { Panel, Unavailable, Callout, FindingRow } from "./bits";

/** Kubernetes Deployments against paas.deployments — what fleet drift cannot see. */
export function WorkloadsSection({
  workloads,
}: {
  workloads: WorkloadView | { error: string };
}) {
  return (
    <Panel
      title="Workloads"
      subtitle="Kubernetes Deployments against paas.deployments, plus pod-capacity drift"
    >
      {"error" in workloads ? (
        <Unavailable error={workloads.error} />
      ) : (
        <>
          {workloads.capacity.significant && (
            <Callout tone="warning">
              <code>pod_allocated</code> reads {workloads.capacity.recorded} but{" "}
              the cluster runs a different count (drift{" "}
              {workloads.capacity.drift >= 0 ? "+" : ""}
              {workloads.capacity.drift}). Placement schedules against this
              number and LKE enforces the pod cap hard — it is scheduling
              against fiction.
            </Callout>
          )}

          <ul>
            {workloads.drift.findings
              .filter((f) => f.status !== "healthy")
              .map((f) => (
                <FindingRow
                  key={f.deploymentRef}
                  status={f.status}
                  label={f.deploymentRef}
                  detail={f.detail}
                  action={f.action || undefined}
                  aside={`${f.pods} pod${f.pods === 1 ? "" : "s"}`}
                />
              ))}
          </ul>
          {workloads.drift.findings.filter((f) => f.status !== "healthy")
            .length === 0 && (
            <p className="text-xs text-muted-foreground">
              Every workload has a matching control-plane row.
            </p>
          )}
        </>
      )}
    </Panel>
  );
}
