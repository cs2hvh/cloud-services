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

interface Target {
  repo: string;
  /** What this repository is meant to exercise, for the matrix row. */
  note: string;
  branch?: string;
  root?: string;
}

/**
 * Ordered by how likely a customer is to bring one, then by how much of the
 * build path each exercises. Node first because it is most of the market.
 */
const BATCHES: Record<string, Target[]> = {
  "node-1": [
    { repo: "vercel/next-learn", note: "Next.js, monorepo — exercises root_directory", root: "dashboard/starter-example" },
    { repo: "remix-run/indie-stack", note: "Remix, real stack with a build step" },
    { repo: "sveltejs/realworld", note: "SvelteKit, full RealWorld app" },
  ],
  "node-2": [
    { repo: "nuxt/starter", note: "Nuxt 3", branch: "v3" },
    { repo: "withastro/starlight", note: "Astro, docs site with a heavy build" },
    { repo: "expressjs/express", note: "Express — a LIBRARY, must refuse clearly rather than pretend" },
  ],
  "node-3": [
    { repo: "nestjs/typescript-starter", note: "NestJS, TypeScript build step" },
    { repo: "vitejs/vite", note: "Vite monorepo — large, exercises workspace handling" },
    { repo: "facebook/create-react-app", note: "CRA monorepo" },
  ],
  python: [
    { repo: "tiangolo/full-stack-fastapi-template", note: "FastAPI, real stack" },
    { repo: "django/djangoproject.com", note: "Django, a real production site" },
    { repo: "pallets/flask", note: "Flask — a LIBRARY, must refuse clearly" },
  ],
  go: [
    { repo: "gin-gonic/examples", note: "Gin" },
    { repo: "gohugoio/hugoDocs", note: "Hugo static site" },
  ],
  edges: [
    { repo: "docker/awesome-compose", note: "No single app at the root — must refuse clearly" },
    { repo: "github/gitignore", note: "No framework marker at all — must refuse clearly" },
  ],
};

const args = process.argv.slice(2);

if (args.includes("--list")) {
  for (const [name, targets] of Object.entries(BATCHES)) {
    console.log(`  ${name.padEnd(10)} ${targets.length} repo(s)`);
    for (const t of targets) console.log(`             ${t.repo} — ${t.note}`);
  }
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
    .map((repo) => ({ repo, note: "ad hoc" }));
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

function runProbe(t: Target): Promise<{ code: number; verdict: string; http: string }> {
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
      resolve({
        code: code ?? 1,
        verdict: m?.[1] ?? "FAIL",
        http: m?.[2] ?? "no answer",
      });
    });
  });
}

const results: Array<{ repo: string; note: string; verdict: string; http: string }> = [];

console.log(`\nBatch ${batchName ?? "ad hoc"} — ${targets.length} repository(ies), one at a time`);
console.log("═".repeat(84));

for (const t of targets) {
  console.log(`\n▶ ${t.repo}  (${t.note})`);
  const r = await runProbe(t);
  results.push({ repo: t.repo, note: t.note, verdict: r.verdict, http: r.http });
}

console.log("\n" + "═".repeat(84));
console.log("  Summary — paste into docs/v2/10-FRAMEWORK-MATRIX.md\n");
for (const r of results) {
  console.log(`  | ${r.repo} | ${r.note} | ${r.verdict} | ${r.http} |`);
}

const bad = results.filter((r) => r.verdict === "FAIL");
console.log(
  `\n  ${results.filter((r) => r.verdict === "PASS").length} served, ` +
    `${results.filter((r) => r.verdict === "APP-ERR").length} app-error, ${bad.length} platform failure(s).`,
);
if (bad.length) {
  console.log(`\n  Platform failures to diagnose — these are the point of the run:`);
  for (const r of bad) console.log(`    ${r.repo} (${r.note})`);
}

process.exit(bad.length ? EXIT_FINDINGS : EXIT_CLEAN);
