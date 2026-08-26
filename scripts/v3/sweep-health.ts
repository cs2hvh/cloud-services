/**
 * Are the sweeps actually running? The observers, watching themselves.
 *
 *   node --env-file=.env --env-file=.env.local scripts/v3/sweep-health.ts
 *   node --env-file=.env --env-file=.env.local scripts/v3/sweep-health.ts --json
 *
 * Every other script here reports on the platform. None reported on the
 * reporters, and a sweep that never runs produces silence that reads exactly
 * like a clean result. This was found by asking whether the CronJobs had ever
 * self-fired: four had, one had been failing every hour since it was installed,
 * and nothing anywhere would have said so.
 *
 * IT CHECKS TWO SEPARATE THINGS, because passing the first does not imply the
 * second:
 *
 *   DID IT RUN     from the CronJob's own lastScheduleTime / lastSuccessfulTime.
 *   WOULD A FINDING SURVIVE
 *                  from the deployed container command. Under the old
 *                  convention a drift script exited 1 for "found drift", which
 *                  Kubernetes marks as a failed Job — identical to a crash. A
 *                  fleet can be entirely green because nothing has been found
 *                  yet, and go red the moment anything is.
 *
 * So a green sweep without the exit-code translation is reported as untested
 * rather than healthy, and the report is not clean.
 *
 * READ-ONLY.
 */

import { EXIT_CLEAN, EXIT_FINDINGS, EXIT_CANNOT_RUN } from "../../lib/paas/telemetry/exit-codes.ts";
import { loadKubeconfig, kube } from "../../lib/paas/k8s/client.ts";
import { sweepHealthReport, type CronJobLike } from "../../lib/paas/telemetry/sweep-health.ts";

const KUBECONFIG = process.env.V2_KUBECONFIG ?? "C:/ahura-secrets/kubeconfig-v2-dev.yaml";
const PAAS_NAMESPACE = process.env.V2_PAAS_NAMESPACE ?? "ahura-system";
const JSON_OUT = process.argv.includes("--json");

const k = kube(loadKubeconfig(KUBECONFIG));
if (!(await k.healthz())) {
  console.error("cluster unreachable — cannot tell whether anything is running");
  process.exit(EXIT_CANNOT_RUN);
}

interface CJ {
  metadata: { name: string };
  spec?: {
    schedule?: string;
    suspend?: boolean;
    jobTemplate?: { spec?: { template?: { spec?: { containers?: Array<{ command?: string[] }> } } } };
  };
  status?: { lastScheduleTime?: string; lastSuccessfulTime?: string };
}

const list = await k.get<{ items: CJ[] }>(`/apis/batch/v1/namespaces/${PAAS_NAMESPACE}/cronjobs`, true);
if (!list) {
  console.error(`could not list CronJobs in ${PAAS_NAMESPACE} — nothing measured`);
  process.exit(EXIT_CANNOT_RUN);
}

// An empty list is a finding, not a clean result: it means no sweep is
// scheduled at all, so every domain they cover is unobserved. Reporting that
// as "0 problems" is the defect this whole module exists to catch.
if ((list.items ?? []).length === 0) {
  console.error(`no CronJobs in ${PAAS_NAMESPACE} — no sweep is scheduled, so nothing is being observed`);
  process.exit(EXIT_FINDINGS);
}

const jobs: CronJobLike[] = (list.items ?? []).map((c) => ({
  name: c.metadata.name,
  schedule: c.spec?.schedule ?? "",
  suspended: c.spec?.suspend ?? false,
  lastScheduleTime: c.status?.lastScheduleTime ?? null,
  lastSuccessfulTime: c.status?.lastSuccessfulTime ?? null,
  command: c.spec?.jobTemplate?.spec?.template?.spec?.containers?.[0]?.command ?? [],
}));

const report = sweepHealthReport(jobs, Date.now());

if (JSON_OUT) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.clean ? EXIT_CLEAN : EXIT_FINDINGS);
}

const line = "─".repeat(96);
console.log(`\nSweep health — ${report.sweeps.length} CronJob(s) in ${PAAS_NAMESPACE}`);
console.log(line);

for (const s of report.sweeps) {
  const age = s.minutesSinceSuccess === null ? "never" : `${s.minutesSinceSuccess.toFixed(0)}m ago`;
  console.log(
    `  ${s.status.toUpperCase().padEnd(16)} ${s.name.padEnd(22)} ${s.schedule.padEnd(18)} last success ${age}`,
  );
  console.log(`      ${s.detail}`);
}

console.log(`\n${line}`);
if (report.unobserved > 0) {
  console.log(
    `  ${report.unobserved} sweep(s) have never produced a result. Nothing they cover has been\n` +
      `  observed, so their silence is not evidence that anything is clean.`,
  );
}
if (report.untranslated > 0) {
  console.log(
    `\n  ${report.untranslated} sweep(s) would report a FINDING to the scheduler as a FAILURE.\n` +
      `  The deployed command has no exit-code translation, so exit 10 (ran and found\n` +
      `  something) is indistinguishable from a crash. Any green tick among these means\n` +
      `  only that nothing has been found yet.\n` +
      `\n  Fix: re-run scripts/v2/install-sweeps.ts --apply to ship the current source.\n` +
      `  That writes cron infrastructure, so it needs a human.`,
  );
}

if (report.clean) {
  console.log(`  Every sweep is running, and a finding from any of them would survive its exit code.\n`);
  process.exit(EXIT_CLEAN);
}
console.log();
process.exit(EXIT_FINDINGS);
