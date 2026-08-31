import type { HostnameView } from "@/lib/paas/telemetry/operator";
import { Panel, Unavailable, Callout, FindingRow } from "./bits";

/** Cloudflare DNS against Ingress objects against paas.aliases. */
export function HostnamesSection({
  hostnames,
}: {
  hostnames: HostnameView | { error: string };
}) {
  return (
    <Panel
      title="Hostnames"
      subtitle="Cloudflare DNS against Ingress objects against paas.aliases"
    >
      {"error" in hostnames ? (
        <Unavailable error={hostnames.error} />
      ) : (
        <>
          {hostnames.drift.claimable > 0 && (
            <Callout tone="critical">
              <strong className="font-semibold">
                {hostnames.drift.claimable} claimable hostname(s).
              </strong>{" "}
              These resolve to the gateway with nothing routing them — the next
              Ingress to name one, in any tenant namespace, receives its
              traffic.
            </Callout>
          )}

          <ul>
            {hostnames.drift.findings
              .filter((f) => f.status !== "foreign")
              .map((f) => (
                <FindingRow
                  key={f.hostname}
                  status={f.status}
                  label={f.hostname}
                  detail={f.detail}
                  action={f.action || undefined}
                />
              ))}
          </ul>

          <p className="mt-3 text-xs text-muted-foreground">
            Gateway {hostnames.gatewayIp} · app domain {hostnames.appDomain} ·{" "}
            {hostnames.drift.findings.filter((f) => f.status === "foreign").length}{" "}
            foreign record(s) in the zone are never touched.
          </p>
        </>
      )}
    </Panel>
  );
}
