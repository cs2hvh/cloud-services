import type { R2View } from "@/lib/paas/telemetry/operator";
import { Panel, Unavailable, bytes, money } from "./bits";

/** R2 against paas.deployments — nothing prunes this bucket. */
export function StorageSection({ storage }: { storage: R2View | { error: string } }) {
  return (
    <Panel
      title="Object storage"
      subtitle="R2 against paas.deployments — the bucket grows monotonically"
    >
      {"error" in storage ? (
        <Unavailable error={storage.error} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Mini label="Total" value={bytes(storage.drift.totalBytes)} />
            <Mini
              label="Reclaimable"
              value={bytes(storage.drift.reclaimableBytes)}
              bad={storage.drift.reclaimableBytes > 0}
            />
            <Mini label="Per month" value={money(storage.drift.totalMonthlyUsd, 4)} />
            <Mini label="Objects" value={String(storage.drift.findings.length)} />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Reclaimable is <code>image.tar</code> for ready deployments — a
            transfer artifact whose image already lives digest-pinned in the
            registry — plus artifacts of builds never published. Build logs are
            never counted, even orphaned ones: a missing row is not proof the
            app is gone.
          </p>
        </>
      )}
    </Panel>
  );
}

function Mini({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={`mt-0.5 font-mono text-lg ${bad ? "text-red-300" : ""}`}>
        {value}
      </div>
    </div>
  );
}
