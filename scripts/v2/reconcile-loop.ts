/**
 * The reconcile loop — the level-triggered half of convergence.
 *
 *   node --env-file=.env --env-file=.env.local scripts/v2/reconcile-loop.ts [--once] [--dry-run] [--interval=30]
 *
 * WHY THIS EXISTS
 *
 * The reconciler was written and then had no caller. `promote()` wrote the
 * alias and returned; the Kubernetes work in `reconcileProject()` was invoked
 * only by a proof script. So an alias write from the UI moved the database
 * pointer and NOTHING reached the cluster until a human ran a script by hand.
 * The claim "promote and rollback are one database write" was true; the claim
 * "traffic follows" quietly was not. A peer session caught it by grepping for
 * callers rather than taking my word for it.
 *
 * Convergence now has two triggers because they fail differently:
 *
 *   EDGE  — promoteAndConverge() runs immediately after a write. Fast, but lost
 *           if the process dies mid-call.
 *   LEVEL — this loop re-derives desired state from scratch on an interval.
 *           Slower, but it cannot lose work.
 *
 * Neither alone is enough: edge-only diverges silently whenever a call fails,
 * level-only makes every promote look broken for up to one interval.
 *
 * Safe to run continuously. Every action is idempotent, so a pass that changes
 * nothing costs a handful of GETs.
 */

import { reconcileAll, kubeContextFromEnv } from "../../lib/paas/reconciler.ts";
import { db } from "../../lib/paas/db.ts";

const ONCE = process.argv.includes("--once");
const DRY = process.argv.includes("--dry-run");
const intervalArg = process.argv.find((a) => a.startsWith("--interval="));
const INTERVAL_MS = Math.max(10, Number(intervalArg?.split("=")[1] ?? 30)) * 1000;

if (!(await db.reachable())) {
  console.log("paas schema unreachable — refusing to run.");
  console.log("Reconciling against an unreadable desired state would read every project as");
  console.log("having no aliases, and scale live workloads to zero. Failing closed.");
  process.exit(1);
}

// Fail fast if the kubeconfig is wrong, rather than on the first write.
try {
  kubeContextFromEnv();
} catch (e) {
  console.log(`kubeconfig unusable: ${(e as Error).message}`);
  process.exit(1);
}

console.log(
  `\nReconcile loop — ${DRY ? "DRY RUN, " : ""}${ONCE ? "single pass" : `every ${INTERVAL_MS / 1000}s`}\n` +
    "─".repeat(76),
);

let pass = 0;
let consecutiveFailures = 0;

async function runPass(): Promise<void> {
  pass += 1;
  const started = Date.now();
  try {
    const reports = await reconcileAll(kubeContextFromEnv(), { dryRun: DRY });
    consecutiveFailures = 0;

    // Only report what CHANGED. A loop that prints a wall of "noop" every
    // interval trains everyone to ignore it, and then the one pass that
    // mattered scrolls past unread.
    const changed = reports.filter((r) => r.actions.some((a) => a.kind !== "noop"));
    const errored = reports.filter((r) => r.actions.some((a) => a.kind === "error"));

    if (changed.length || errored.length) {
      const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
      console.log(`\n[${ts}] pass ${pass} — ${reports.length} project(s), ${changed.length} changed`);
      for (const r of changed) {
        for (const a of r.actions) {
          if (a.kind === "noop") continue;
          console.log(`  ${a.kind.padEnd(11)} ${r.project.padEnd(20)} ${a.target.padEnd(22)} ${a.detail}`);
        }
      }
    } else if (pass === 1) {
      console.log(`pass 1 — ${reports.length} project(s), all converged. Quiet from here unless something changes.`);
    }
  } catch (e) {
    consecutiveFailures += 1;
    console.log(`\npass ${pass} FAILED (${consecutiveFailures} in a row): ${(e as Error).message.slice(0, 240)}`);
    // Keep going. A transient API outage must not stop convergence forever —
    // that is precisely when desired and actual state drift apart.
    if (consecutiveFailures >= 10) {
      console.log("10 consecutive failures. Something is systematically wrong; stopping so it gets noticed.");
      process.exit(1);
    }
  } finally {
    const ms = Date.now() - started;
    if (ms > 15_000) console.log(`  (pass took ${(ms / 1000).toFixed(1)}s)`);
  }
}

await runPass();
if (ONCE) process.exit(0);

let stopping = false;
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    if (stopping) process.exit(1);
    stopping = true;
    console.log(`\n${sig} — finishing the current pass, then stopping.`);
  });
}

while (!stopping) {
  await new Promise((r) => setTimeout(r, INTERVAL_MS));
  if (stopping) break;
  await runPass();
}
console.log("stopped.");
