/**
 * Run a batch of repositories through framework-probe, one at a time.
 *
 *   node --experimental-strip-types --env-file=.env --env-file=.env.local \
 *     scripts/v2/framework-batch.ts <batch-name>
 *   node ... scripts/v2/framework-batch.ts --repos owner/a,owner/b
 *   node ... scripts/v2/framework-batch.ts --list
 *
 * STRICTLY SEQUENTIAL, and that is the point rather than a limitation. Each
 * probe leases a real Linode, and a batch that fanned out would lease one per
 * repository at once — a bill and a quota wall, on a cluster that also has
 * customers on it. One at a time, torn down before the next starts, keeps the
 * footprint at exactly one build machine no matter how long the list is.
 *
 * THE BATCHES ARE REAL APPLICATIONS, not framework templates. A template proves
 * the detector recognises a name; a real application proves the build survives
 * a lockfile, a monorepo, a postinstall script, a native dependency and a build
 * step that takes four minutes. Those are what a customer actually brings.
 *
 * A FAILING REPOSITORY DOES NOT STOP THE BATCH. The whole point is to collect
 * failures, and a run that aborts on the first one collects exactly one.
 *
 * EXIT CODES: 0 everything served, 10 something did not, 1 could not run.
 */

import { spawn } from "node:child_process";
import { EXIT_CLEAN, EXIT_FINDINGS, EXIT_CANNOT_RUN } from "../../lib/paas/telemetry/exit-codes.ts";

// The list lives in framework-targets.ts so it can grow without touching the
// machinery that runs it, and so `--list` reads as a document.
import { BATCHES, type Target } from "./framework-targets.ts";

const args = process.argv.slice(2);

if (args.includes("--list")) {
  let total = 0;
  for (const [name, targets] of Object.entries(BATCHES)) {
    console.log(`
  ${name}`);
    for (const t of targets) {
      total++;
      const mark = t.expect === "refuse" ? "must refuse" : t.expect === "app-err" ? "build+route" : "must serve";
      const extra = [t.branch ? `@${t.branch}` : "", t.root ? `/${t.root}` : ""].filter(Boolean).join(" ");
      console.log(`    ${mark.padEnd(12)} ${t.repo.padEnd(52)} ${t.note}${extra ? "  " + extra : ""}`);
    }
  }
  console.log(`
  ${total} repositories across ${Object.keys(BATCHES).length} batches.`);
  console.log(`  "must refuse" entries are meant to be turned away clearly — a matrix`);
  console.log(`  without them only proves the easy half works.
`);
  process.exit(EXIT_CLEAN);
}

const reposFlag = args.indexOf("--repos");
// Only skip the value that belongs to --repos, and only when --repos is
// present. Comparing against args[reposFlag + 1] unconditionally made
// args[0] exclude itself when reposFlag was -1, so a bare batch name never
// parsed.
const reposValue = reposFlag >= 0 ? args[reposFlag + 1] : undefined;
const batchName = args.find((a) => !a.startsWith("--") && a !== reposValue);

let targets: Target[];
if (reposFlag >= 0) {
  targets = (args[reposFlag + 1] ?? "")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean)
    .map((repo) => ({ repo, note: "ad hoc", expect: "serve" as const }));
} else if (batchName && BATCHES[batchName]) {
  targets = BATCHES[batchName];
} else {
  console.error(`usage: framework-batch.ts <${Object.keys(BATCHES).join("|")}> | --repos a/b,c/d | --list`);
  process.exit(EXIT_CANNOT_RUN);
}

if (targets.length === 0) {
  console.error("nothing to run");
  process.exit(EXIT_CANNOT_RUN);
}

/**
 * Did the run do what the target said it would?
 *
 * A refusal is not a failure. withastro/starlight must be turned away, and
 * being turned away at detect — in seconds, without leasing a build machine —
 * is the whole point. Grading on the verdict alone reported that as a platform
 * failure next to genuine ones, which is how the astro batch came to be read
 * backwards.
 *
 * Serving when we should have refused is the interesting direction: a library
 * that deploys means detection accepted something it cannot support.
 */
function meets(expect: Target["expect"], verdict: string, stage: string): boolean {
  if (expect === "serve") return verdict === "PASS";
  // Better than promised is still fine: if an app we expected to error on a
  // missing secret answers 200 anyway, the platform did its job.
  if (expect === "app-err") return verdict === "APP-ERR" || verdict === "PASS";
  if (expect === "refuse") return stage === "detect";
  if (expect === "build-err") return stage === "build";
  return false;
}

function runProbe(t: Target): Promise<{ code: number; verdict: string; http: string; stage: string }> {
  return new Promise((resolve) => {
    const argv = [
      "--experimental-strip-types",
      "--env-file=.env",
      "--env-file=.env.local",
      "scripts/v2/framework-probe.ts",
      t.repo,
    ];
    if (t.branch) argv.push("--branch", t.branch);
    if (t.root) argv.push("--root", t.root);

    const child = spawn(process.execPath, argv, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";

    const onData = (b: Buffer) => {
      const text = b.toString();
      out += text;
      for (const l of text.split("\n")) {
        // Pass through the shape of the run without the type-stripping noise.
        if (/MODULE_TYPELESS|Reparsing|eliminate|trace-warnings/.test(l)) continue;
        if (l.trim()) console.log(`    ${l.trimEnd()}`);
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);

    child.on("close", (code) => {
      const m = /RESULT\s+(\S+)\s+http=(\S+)/.exec(out);
      // A run that never reached the serve check prints `FAIL at <stage>`
      // instead, and that stage is the whole answer: stopping at detect is a
      // success for a target that must be refused and a failure for one that
      // must serve. Grading on the verdict alone called both of those FAIL.
      const f = /RESULT\s+FAIL at (\w+)/.exec(out);
      resolve({
        code: code ?? 1,
        verdict: m?.[1] ?? "FAIL",
        http: m?.[2] ?? "no answer",
        stage: f?.[1] ?? (m ? "serve" : "unknown"),
      });
    });
  });
}

// tsx compiles this to CommonJS, where a top-level await is a syntax error, so the
// run lives in an async entrypoint. Without it the batch died before deploying
// anything and still exited 0 — a green run that tested nothing.
async function main() {
  const results: Array<{ repo: string; note: string; verdict: string; http: string; expect: string; ok: boolean }> =
    [];

  console.log(`\nBatch ${batchName ?? "ad hoc"} — ${targets.length} repository(ies), one at a time`);
  console.log("═".repeat(84));

  for (const t of targets) {
    console.log(`\n▶ ${t.repo}  (${t.note})`);
    const r = await runProbe(t);
    results.push({ repo: t.repo, note: t.note, verdict: r.verdict, http: r.http, expect: t.expect, ok: meets(t.expect, r.verdict, r.stage) });
  }

  console.log("\n" + "═".repeat(84));
  console.log("  Summary — paste into docs/v2/10-FRAMEWORK-MATRIX.md\n");
  for (const r of results) {
    console.log(`  | ${r.repo} | ${r.note} | ${r.verdict} | ${r.http} | ${r.ok ? "as expected" : "UNEXPECTED — wanted " + r.expect} |`);
  }

  const bad = results.filter((r) => !r.ok);
  console.log(
    `\n  ${results.filter((r) => r.verdict === "PASS").length} served, ` +
      `${results.filter((r) => r.verdict === "APP-ERR").length} app-error, ${bad.length} unexpected outcome(s).`,
  );
  if (bad.length) {
    console.log(`\n  Unexpected outcomes — these are the point of the run:`);
    for (const r of bad) console.log(`    ${r.repo} — wanted ${r.expect}, got ${r.verdict} (${r.note})`);
  }

  process.exit(bad.length ? EXIT_FINDINGS : EXIT_CLEAN);
}

void main();
