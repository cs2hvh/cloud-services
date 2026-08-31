import type { FleetView } from "@/lib/paas/telemetry/operator";
import { Panel, Unavailable, Callout, FindingRow, money } from "./bits";

/** Linode reality against paas.clusters / paas.build_vms, priced. */
export function FleetSection({ fleet }: { fleet: FleetView | { error: string } }) {
  return (
    <Panel
      title="Fleet"
      subtitle="Linode reality against paas.clusters and paas.build_vms, in both directions"
    >
      {"error" in fleet ? (
        <Unavailable error={fleet.error} />
      ) : (
        <>
          {fleet.drift.unpriced.length > 0 && (
            <Callout tone="warning">
              {fleet.drift.unpriced.length} resource(s) have no price in
              /linode/types, so cost totals are understated.
            </Callout>
          )}

          <ul>
            {fleet.drift.findings.map((f) => (
              <FindingRow
                key={`${f.kind}-${f.cloudId ?? f.ref}`}
                status={f.status}
                label={f.label}
                detail={f.detail}
                action={f.action || undefined}
                aside={f.hourly === null ? "unknown/hr" : `${money(f.hourly, 4)}/hr`}
              />
            ))}
          </ul>
          {fleet.drift.findings.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No infrastructure and no records.
            </p>
          )}

          <p className="mt-3 text-xs text-muted-foreground">
            {fleet.observed.lkeClusters} LKE cluster(s) ·{" "}
            {fleet.observed.instances} instance(s) ·{" "}
            {fleet.observed.nodeBalancers} NodeBalancer(s) ·{" "}
            {fleet.observed.clusterRows} cluster row(s) ·{" "}
            {fleet.observed.buildVmRows} build-VM row(s)
          </p>
        </>
      )}
    </Panel>
  );
}
