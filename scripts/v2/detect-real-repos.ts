/**
 * Runs framework detection against REAL public GitHub repositories.
 *
 * Fixture tests prove the logic; this proves it survives contact with real
 * repository layouts. Uses the anonymous public API (no credentials).
 *
 *   node --env-file=.env.local scripts/v2/detect-real-repos.ts
 */

import { detectFramework, detectPackageManager, DETECTION_FILES, type RepoFiles } from "../../lib/paas/build/detect.ts";

const UA = "ahuracloud-deploy-v2";

const TARGETS: Array<{ repo: string; expect: string; note: string; rootDirectory?: string }> = [
  { repo: "heroku/node-js-getting-started", expect: "express", note: "classic Express sample" },
  { repo: "sveltejs/template", expect: "nodejs", note: "legacy Svelte template (rollup)" },
  { repo: "docker/welcome-to-docker", expect: "dockerfile", note: "ships its own Dockerfile" },
  { repo: "gin-gonic/gin", expect: "go", note: "go.mod at root" },
  { repo: "spring-projects/spring-petclinic", expect: "java-maven", note: "pom.xml at root" },

  // A repo whose default branch holds only templates, no app. Correctly
  // unknown: we refuse to guess rather than emit a build that fails oddly.
  { repo: "nuxt/starter", expect: "unknown", note: "default branch is 'templates', no root manifest" },

  // Monorepo roots. Detection sees the ROOT manifest, which is the tooling
  // manifest, not the app's. This is why projects.root_directory exists.
  { repo: "vercel/next-learn", expect: "nextjs", note: "monorepo root happens to carry next" },
  { repo: "vitejs/vite", expect: "vite-react", note: "monorepo root carries vite (tooling, not an app)" },

  // Library repos can look like apps. Harmless — the build fails clearly
  // rather than deploying something wrong — but worth knowing it happens.
  { repo: "pallets/flask", expect: "flask", note: "library repo whose manifest mentions flask" },

  // Monorepo resolved via root_directory: this is the path a real user takes.
  {
    repo: "vercel/next-learn",
    rootDirectory: "dashboard/starter-example",
    expect: "nextjs",
    note: "monorepo WITH root_directory set — the supported path",
  },
];

async function ghPublic<T>(path: string): Promise<T | null> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": UA },
  });
  if (res.status === 404) return null;
  if (res.status === 403) throw new Error("rate limited by GitHub public API");
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return (await res.json()) as T;
}

async function rawFile(repo: string, path: string, ref: string): Promise<string | null> {
  const res = await fetch(`https://raw.githubusercontent.com/${repo}/${ref}/${path}`, {
    headers: { "User-Agent": UA },
  });
  return res.ok ? res.text() : null;
}

/**
 * Load a repo's file listing, optionally scoped to a subdirectory. Detection
 * must run relative to root_directory or every monorepo misdetects on the
 * tooling manifest at the repo root.
 */
async function loadRepo(repo: string, rootDirectory?: string): Promise<RepoFiles | null> {
  const meta = await ghPublic<{ default_branch: string }>(`/repos/${repo}`);
  if (!meta) return null;

  const dir = rootDirectory ? rootDirectory.replace(/^\/+|\/+$/g, "") : "";
  const tree = await ghPublic<Array<{ name: string; type: string }>>(
    `/repos/${repo}/contents${dir ? `/${dir}` : ""}`,
  );
  if (!tree || !Array.isArray(tree)) return null;

  const paths = tree.filter((e) => e.type === "file" || e.type === "dir").map((e) => e.name);
  const contents: Record<string, string> = {};
  for (const f of DETECTION_FILES) {
    if (!paths.includes(f)) continue;
    const body = await rawFile(repo, dir ? `${dir}/${f}` : f, meta.default_branch);
    if (body) contents[f] = body;
  }
  return { paths, contents };
}

const pad = (s: string, n: number) => (s.length >= n ? s : s + " ".repeat(n - s.length));

let pass = 0;
let fail = 0;

for (const t of TARGETS) {
  const label = t.rootDirectory ? `${t.repo}:${t.rootDirectory}` : t.repo;
  try {
    const files = await loadRepo(t.repo, t.rootDirectory);
    if (!files) {
      console.log(`${pad(label, 46)} SKIP  (not reachable)`);
      continue;
    }
    const d = detectFramework(files);
    const pm = detectPackageManager(files);
    const ok = d.framework === t.expect;
    if (ok) pass++;
    else fail++;
    console.log(
      `${ok ? "PASS" : "FAIL"}  ${pad(label, 46)} -> ${pad(d.framework, 15)} ` +
        `runtime=${pad(d.runtime, 7)} pm=${pad(pm, 5)} ${d.confidence}` +
        (ok ? "" : `   EXPECTED ${t.expect}`),
    );
    console.log(`        ${t.note}`);
    if (!ok) console.log(`        reason: ${d.reason}`);
  } catch (e) {
    console.log(`ERROR ${pad(label, 46)} ${(e as Error).message}`);
    fail++;
  }
}

console.log(`\n${pass} matched, ${fail} did not.`);
