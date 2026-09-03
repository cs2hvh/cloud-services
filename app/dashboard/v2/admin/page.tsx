/**
 * Operator view — fleet cost, hostname drift, and what is running.
 *
 * A server component that calls lib/paas/telemetry/operator.ts directly rather
 * than fetching its own API. The API routes exist for scripts and alerting;
 * making the page take an HTTP round trip to its own process would add a
 * failure mode and an auth hop for nothing.
 *
 * Every section renders independently. An operator dashboard is most useful
 * exactly when something is broken, so one unreachable dependency must not
 * blank the page — if Cloudflare is unreachable the cost figures still render,
 * and the hostname panel says why it is empty.
 *
 * Gated by requireAdmin(), which fails closed on every path. notFound() rather
 * than a 403 page: an operator surface that announces itself tells an attacker
 * what to go after.
 */

import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/supabase/auth";
import { operatorView, queueView } from "@/lib/paas/telemetry/operator";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const money = (n: number, places = 2) => `$${n.toFixed(places)}`;
const mb = (bytes: number) =>
  bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : `${(bytes / 1024 ** 2).toFixed(0)} MB`;

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-white/[0.07] bg-white border-white/[0.07]">
      <header className="border-b border-white/[0.07] px-4 py-3 border-white/[0.07]">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs text-white/40">{subtitle}</p> : null}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Unavailable({ error }: { error: string }) {
  return (
    <div className="rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
      <strong className="font-semibold">Unavailable.</strong> {error}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "bad" | "good" }) {
  const colour =
    tone === "bad"
      ? "text-red-300"
      : tone === "good"
        ? "text-emerald-600 dark:text-emerald-400"
        : "";
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-white/40">{label}</div>
      <div className={`mt-0.5 font-mono text-lg ${colour}`}>{value}</div>
    </div>
  );
}

function Finding({
  status,
  label,
  detail,
  action,
  cost,
}: {
  status: string;
  label: string;
  detail: string;
  action?: string;
  cost?: string;
}) {
  return (
    <li className="border-t border-white/[0.06] py-2.5 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide">
          {status}
        </span>
        <span className="font-mono text-sm">{label}</span>
        {cost ? <span className="ml-auto font-mono text-xs text-white/40">{cost}</span> : null}
      </div>
      <p className="mt-1 text-xs text-white/60">{detail}</p>
      {action ? <p className="mt-1 text-xs text-white/40">→ {action}</p> : null}
    </li>
  );
}

export default async function OperatorPage() {
  const admin = await requireAdmin();
  if (!admin.ok) notFound();

  const view = await operatorView();
  const { fleet, hostnames, workloads, storage, usage } = view;

  // Independently, and never allowed to blank the page. An operator dashboard
  // is most useful exactly when something is broken, so a failed queue read
  // renders as a queue panel that says why rather than as no dashboard.
  let queue: Awaited<ReturnType<typeof queueView>> | { error: string };
  try {
    queue = await queueView();
  } catch (e) {
    queue = { error: (e as Error).message.slice(0, 200) };
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Platform operations</h1>
        <p className="mt-1 text-xs text-white/40">
          Live read. Generated {new Date(view.generatedAt).toUTCString()}. Nothing on this page
          changes anything.
        </p>
      </header>

      {/*
        FIRST, because it is the question this page could not answer. Fleet,
        hostnames, workloads and storage all compare recorded state against
        reality; none of them said whether anything was building or whether the
        last thing failed, so the only way to see a build was to read a worker's
        stdout on whichever machine was running it.
      */}
      <Panel title="Build queue" subtitle="paas.deployments in flight, and the last 24 hours">
        {"error" in queue ? (
          <Unavailable error={queue.error} />
        ) : (
          <>
            <div className="flex flex-wrap gap-4">
              <Stat label="Queued" value={String(queue.counts.queued)} />
              <Stat label="Building" value={String(queue.counts.building)} />
              <Stat label="Ready 24h" value={String(queue.counts.ready24h)} />
              <Stat label="Failed 24h" value={String(queue.counts.failed24h)} />
            </div>

            {queue.note ? (
              <p className="mt-3 text-xs font-medium text-amber-600 dark:text-amber-500">{queue.note}</p>
            ) : null}

            {queue.inFlight.length > 0 ? (
              <div className="mt-3">
                <p className="text-xs font-medium">In flight</p>
                <ul className="mt-1 space-y-1">
                  {queue.inFlight.map((d) => (
                    <li key={d.deployment} className="font-mono text-xs text-white/60">
                      {d.state} · {d.project ?? "(no project)"} · {d.deployment} · {d.sha ?? "?"} ·{" "}
                      {d.state === "queued" ? `waiting ${d.waitingSeconds}s` : `running ${d.runningSeconds ?? 0}s`}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-3 text-xs text-white/40">
                Nothing in flight. This does NOT prove a worker is running — a stopped queue and an
                idle one look the same from the database.
              </p>
            )}

            {queue.recent.filter((d) => d.state === "error").length > 0 ? (
              <div className="mt-3">
                <p className="text-xs font-medium">Recent failures</p>
                <ul className="mt-1 space-y-1">
                  {queue.recent
                    .filter((d) => d.state === "error")
                    .slice(0, 6)
                    .map((d) => (
                      <li key={d.deployment} className="text-xs text-white/60">
                        <span className="font-mono">{d.project ?? "?"}</span> · {d.deployment} ·{" "}
                        <span className="text-red-300">{d.error ?? d.errorCode ?? "no reason recorded"}</span>
                      </li>
                    ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </Panel>

      <Panel
        title="Fleet"
        subtitle="Linode reality against paas.clusters and paas.build_vms, in both directions"
      >
        {"error" in fleet ? (
          <Unavailable error={fleet.error} />
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Standing" value={`${money(fleet.monthly.standing)}/mo`} />
              <Stat
                label="Unaccounted"
                value={`${money(fleet.drift.unaccountedHourly, 4)}/hr`}
                tone={fleet.drift.unaccountedHourly > 0 ? "bad" : "good"}
              />
              <Stat label="Clusters" value={String(fleet.observed.lkeClusters)} />
              <Stat label="Instances" value={String(fleet.observed.instances)} />
            </div>

            {fleet.drift.unpriced.length > 0 ? (
              <p className="mb-3 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                {fleet.drift.unpriced.length} resource(s) have no price in /linode/types, so the
                totals above are understated.
              </p>
            ) : null}

            <ul>
              {fleet.drift.findings.map((f) => (
                <Finding
                  key={`${f.kind}-${f.cloudId ?? f.ref}`}
                  status={f.status}
                  label={f.label}
                  detail={f.detail}
                  action={f.action || undefined}
                  cost={f.hourly === null ? "unknown/hr" : `${money(f.hourly, 4)}/hr`}
                />
              ))}
            </ul>
            {fleet.drift.findings.length === 0 ? (
              <p className="text-xs text-white/40">No infrastructure and no records.</p>
            ) : null}
          </>
        )}
      </Panel>

      <Panel
        title="Hostnames"
        subtitle="Cloudflare DNS against Ingress objects against paas.aliases"
      >
        {"error" in hostnames ? (
          <Unavailable error={hostnames.error} />
        ) : (
          <>
            {hostnames.drift.claimable > 0 ? (
              <p className="mb-3 rounded border border-red-500/25 bg-red-500/[0.08] p-2 text-xs text-red-200 dark:bg-red-950">
                <strong className="font-semibold">
                  {hostnames.drift.claimable} claimable hostname(s).
                </strong>{" "}
                These resolve to the gateway with nothing routing them. The next Ingress to name
                one — in any tenant namespace — receives its traffic.
              </p>
            ) : null}

            <ul>
              {hostnames.drift.findings
                .filter((f) => f.status !== "foreign")
                .map((f) => (
                  <Finding
                    key={f.hostname}
                    status={f.status}
                    label={f.hostname}
                    detail={f.detail}
                    action={f.action || undefined}
                  />
                ))}
            </ul>

            <p className="mt-3 text-xs text-white/40">
              {hostnames.drift.findings.filter((f) => f.status === "foreign").length} record(s) in
              the zone are not the platform&apos;s and are never touched.
            </p>
          </>
        )}
      </Panel>

      <Panel
        title="Workloads"
        subtitle="Kubernetes Deployments against paas.deployments. The layer fleet drift cannot see."
      >
        {"error" in workloads ? (
          <Unavailable error={workloads.error} />
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Pods" value={String(workloads.drift.observedPods)} />
              <Stat
                label="Unaccounted"
                value={String(workloads.drift.unaccountedPods)}
                tone={workloads.drift.unaccountedPods > 0 ? "bad" : "good"}
              />
              <Stat label="pod_allocated" value={String(workloads.capacity.recorded)} />
              <Stat
                label="Drift"
                value={`${workloads.capacity.drift >= 0 ? "+" : ""}${workloads.capacity.drift}`}
                tone={workloads.capacity.significant ? "bad" : undefined}
              />
            </div>

            {workloads.capacity.significant ? (
              <p className="mb-3 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                Placement reads <code>pod_allocated</code> to decide where the next app goes, and
                LKE enforces the pod cap hard. This number is scheduling against fiction.
              </p>
            ) : null}

            <ul>
              {workloads.drift.findings
                .filter((f) => f.status !== "healthy")
                .map((f) => (
                  <Finding
                    key={f.deploymentRef}
                    status={f.status}
                    label={f.deploymentRef}
                    detail={f.detail}
                    action={f.action || undefined}
                    cost={`${f.pods} pod${f.pods === 1 ? "" : "s"}`}
                  />
                ))}
            </ul>
          </>
        )}
      </Panel>

      <Panel title="Object storage" subtitle="R2 against paas.deployments. Nothing prunes this bucket.">
        {"error" in storage ? (
          <Unavailable error={storage.error} />
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Total" value={mb(storage.drift.totalBytes)} />
              <Stat
                label="Reclaimable"
                value={mb(storage.drift.reclaimableBytes)}
                tone={storage.drift.reclaimableBytes > 0 ? "bad" : "good"}
              />
              <Stat label="Per month" value={money(storage.drift.totalMonthlyUsd, 4)} />
              <Stat
                label="Objects"
                value={String(storage.drift.findings.length)}
              />
            </div>
            <p className="text-xs text-white/40">
              Reclaimable is <code>image.tar</code> for ready deployments — a transfer artifact
              whose image already lives digest-pinned in the registry — plus artifacts of builds
              that were never published. Build logs are never counted, even orphaned ones: a
              missing row is not proof the app is gone.
            </p>
          </>
        )}
      </Panel>

      <Panel title="Running now" subtitle="A point-in-time read, not accumulated usage">
        {"error" in usage ? (
          <Unavailable error={usage.error} />
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Apps" value={String(usage.apps.length)} />
              <Stat label="Pods" value={String(usage.apps.reduce((n, a) => n + a.pods, 0))} />
              <Stat label="Builds 24h" value={String(usage.builds.builds)} />
              <Stat
                label="Build minutes"
                value={(usage.builds.buildSeconds / 60).toFixed(1)}
              />
            </div>

            {usage.signals.length > 0 ? (
              <ul className="mb-4">
                {usage.signals.map((s, i) => (
                  <Finding
                    key={`${s.kind}-${s.subject}-${i}`}
                    status={s.severity}
                    label={`${s.kind} · ${s.subject}`}
                    detail={s.detail}
                    action={s.action}
                  />
                ))}
              </ul>
            ) : null}

            <table className="w-full text-left text-xs">
              <thead className="text-white/40">
                <tr>
                  <th className="pb-1 font-medium">deployment</th>
                  <th className="pb-1 font-medium">project</th>
                  <th className="pb-1 font-medium">pods</th>
                  <th className="pb-1 font-medium">restarts</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {usage.apps.map((a) => (
                  <tr key={a.appKey} className="border-t border-white/[0.06]">
                    <td className="py-1.5">{a.appKey}</td>
                    <td className="py-1.5 text-white/40">{a.projectRef}</td>
                    <td className="py-1.5">{a.pods}</td>
                    <td className="py-1.5">{a.restarts}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="mt-3 text-xs text-white/40">
              Warm fraction is not shown. It is an accumulation over time and cannot be derived
              from one observation — computing it here would either invent a number or repeat
              v1&apos;s defect of metering only when someone opens a page. It appears once the
              sampler persists samples.
            </p>
          </>
        )}
      </Panel>
    </main>
  );
}
