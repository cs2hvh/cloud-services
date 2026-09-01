/**
 * The deploy orchestrator — the ONLY path that should create an app.
 *
 * WHY THIS EXISTS
 *
 * `scripts/v2/deploy-e2e.ts` applied Kubernetes objects directly and wrote no
 * database rows. Three of the four live hostnames were created that way, and
 * app-deploy-3 measured the consequence: they serve with no `paas.aliases` row,
 * so the reconciler cannot see them, promote and rollback have nothing to read,
 * and Master's dashboard describes one hostname in four while silently omitting
 * three.
 *
 * That is the same defect as the untracked cluster, one layer up: a script that
 * can create real infrastructure without recording it. Backfilling the three
 * rows would hide it while leaving the script able to do it again, so the fix
 * is that the recording path IS the deploy path.
 *
 * Every step writes its row BEFORE the thing it describes exists.
 */

import { detectFramework, detectPackageManager, DETECTION_FILES, type RepoFiles } from "./build/detect.ts";
import { generateDockerfile, servingPort, runtimeUid } from "./build/dockerfile.ts";
import { resolveNodeVersion, enginesNodeFrom } from "./build/node-version.ts";
import { resolveToken, type ConnectionRow } from "./providers/adapter.ts";
import {
  cloneTarget,
  defaultBranch as providerDefaultBranch,
  fileContents as providerFileContents,
  listDir as providerListDir,
  type GitProvider,
} from "./providers/source.ts";
import { leaseBuildVm, pollBuildResult, destroyBuildVm, type BuildRequest } from "./build/vm.ts";
import { presign, deleteObject, r2Keys } from "./build/r2.ts";
import { imageIsDurable } from "./build/registry.ts";
import { kube } from "./k8s/client.ts";
import { PAAS_NAMESPACE, REGISTRY_PUSH, publisherJob } from "./k8s/manifests.ts";
import { reconcileProject, kubeContextFromEnv, tenantNamespace } from "./reconciler.ts";
import { buildFailureMessage, customerError, GENERIC } from "./errors.ts";
import { db, teams, projects, environments, deployments, aliases, envVars, type DeploymentRow, type ProjectRow, type AliasRow } from "./db.ts";
import { decryptEnvValue, pgHexToBytes } from "./secrets.ts";
import { appHostname } from "./config.ts";
// getFileContents and getDefaultBranch moved to providers/source.ts when reads
// became per-provider; only the clone credential and the visibility check are
// still GitHub-specific.
import { buildCloneUrl, listInstallationRepos } from "./github/client.ts";
import { listInstallations } from "./github/app.ts";
import { assertLabelAvailable, previewLabel } from "./hostnames.ts";
import { upsertDnsRecord, listDnsRecords } from "./edge/cloudflare.ts";


const MARKER_FILES = [
  "Dockerfile", "package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock",
  // A monorepo manifest. Without probing it the build copied only the root
  // package.json and pnpm refused: a workspace dependency cannot resolve
  // against a directory that contains none of the workspace.
  "pnpm-workspace.yaml",
  // Both bun formats: .lockb is the binary one, .lock the newer text one. Probing
  // only the first made a bun repo look lockfile-less and take the slow path.
  "bun.lockb", "bun.lock",
  "requirements.txt", "pyproject.toml", "Pipfile", "manage.py", "go.mod", "Gemfile",
  // Anything that could be the module a Python server is started from. Their
  // presence is the whole signal — no contents needed.
  "app.py", "main.py", "wsgi.py", "asgi.py", "application.py", "server.py", "run.py",
  "pom.xml", "build.gradle", "build.gradle.kts", "composer.json", "Cargo.toml", "index.html",
  ...DETECTION_FILES,
];

/**
 * Which installation can read this repository?
 *
 * Resolved from the owner rather than passed in, so every caller of
 * inspectRepo gets authenticated reads without threading an id through. Null
 * means we hold no credential for that account — a different thing from the
 * repository having no marker files, and reported as such.
 */
async function installationForRepo(repo: string): Promise<number | null> {
  const owner = repo.split("/")[0]?.toLowerCase();
  if (!owner) return null;
  try {
    const found = (await listInstallations()).find(
      (i) => (i.account?.login ?? "").toLowerCase() === owner,
    );
    return found ? Number(found.id) : null;
  } catch {
    // Cannot ask. Treated as no credential, and the caller says so rather than
    // probing anonymously and blaming the repository for the result.
    return null;
  }
}

/**
 * The OAuth token for a GitLab or Bitbucket connection, or null.
 *
 * GitHub authenticates with a per-installation token minted on demand; the
 * other two hold a refreshable OAuth token on the installation row. This reads
 * it for the account that owns `repo`.
 *
 * NULL IS NOT AN ERROR. A public repository clones and reads with no token at
 * all, on every provider — that is what lets this path be proven end to end
 * without registering an OAuth app, and it is how the framework sweep ran.
 * Returning null and letting the anonymous path run is therefore correct, not a
 * silent failure.
 */
async function oauthTokenForRepo(
  provider: GitProvider,
  repo: string,
): Promise<string | null> {
  if (provider === "github") return null;
  const owner = repo.split("/")[0]?.toLowerCase();
  if (!owner) return null;

  try {
    // db is a PostgREST wrapper, not a supabase-js client — filters go in the
    // query string. This runs on the server with the service role, outside any
    // request, so there is no RLS session to scope it; the account_login match
    // below is what ties the row to the repository being deployed.
    const rows = await db.select<{
      account_login: string | null;
      access_token_ct: string | null;
      token_dek_id: string | null;
    }>(
      "installations",
      `select=provider,account_login,access_token_ct,token_dek_id,token_expires_at` +
        `&provider=eq.${provider}&deleted_at=is.null`,
    );

    const row = rows.find(
      (i) => String(i.account_login ?? "").toLowerCase() === owner,
    );
    if (!row) return null;

    const resolved = resolveToken(row as unknown as ConnectionRow);
    return "token" in resolved ? resolved.token : null;
  } catch {
    // Cannot ask. The anonymous path still works for a public repository, and
    // a private one fails at clone with git own message rather than here.
    return null;
  }
}

/**
 * Read one file, or establish that it is not there.
 *
 * THIS USED TO FETCH raw.githubusercontent.com WITH NO CREDENTIAL, and a
 * private repository answers that with 404 — identical to a file that does not
 * exist. So every marker probe came back empty, detection concluded the
 * repository had no package.json or Dockerfile, and the customer was told to
 * add one they already had. 36 of the operator's own 49 repositories are
 * private: three quarters of them undeployable, with the blame pointed at
 * their code.
 *
 * Empty is not the same as unknown — the same distinction as everywhere else
 * in this codebase, in the place a customer meets first.
 *
 * getFileContents mints an installation token and, crucially, THROWS on any
 * status that is not 200 or 404, so a rate limit or a revoked token surfaces
 * as a failure rather than as an empty repository.
 */
async function probe(
  repo: string,
  branch: string,
  path: string,
  installationId: number | null,
  provider: GitProvider = "github",
  token: string | null = null,
): Promise<string | null> {
  // Per provider, and a public repository resolves with no token at all —
  // which is what keeps the proof scripts working against upstream samples,
  // on every provider rather than only on GitHub.
  return providerFileContents(provider, repo, path, branch, installationId, token);
}

/**
 * Read a repository's marker files.
 *
 * Probes rather than enumerating a tree: the anonymous GitHub API allows 60
 * requests an hour, which a handful of runs exhausts, and probing costs the
 * same on a 5-file repo as on a 50,000-file monorepo.
 */
export async function inspectRepo(
  repo: string,
  rootDirectory?: string | null,
  /**
   * Probe THIS branch instead of guessing between main and master.
   *
   * A preview builds a feature branch's commit, but detection decides HOW to
   * build it — framework, package manager, port, Dockerfile. Guessing main here
   * means a preview gets the right code and the wrong recipe: a branch that adds
   * a Dockerfile or changes its start script would build as whatever main is.
   * Silent, and it makes previews untrustworthy for exactly the changes people
   * open them to review.
   *
   * If the named branch has no marker files, detection fails loudly rather than
   * falling back to main — building the wrong recipe is worse than refusing.
   */
  explicitBranch?: string | null,
  /**
   * Which provider this repository lives on.
   *
   * LAST, and defaulted, so every existing caller keeps working unchanged —
   * inserting it third silently pushed explicitBranch along and a git ref
   * arrived where a provider was expected.
   */
  provider: GitProvider = "github",
): Promise<{ branch: string; files: RepoFiles; readable: boolean }> {
  const dir = rootDirectory ? `${rootDirectory.replace(/^\/+|\/+$/g, "")}/` : "";
  // GitHub App installations are a GitHub concept. GitLab and Bitbucket
  // authenticate with an OAuth token held on the installation row, and asking
  // installationForRepo about them would search the wrong provider's rows.
  const installationId = provider === "github" ? await installationForRepo(repo) : null;
  // Null for a public repository, which reads fine without one.
  const token = await oauthTokenForRepo(provider, repo);

  // THE DEFAULT BRANCH IS ASKED FOR, NOT INFERRED.
  //
  // This used to probe for README.md and package.json on `main` and fall back to
  // `master` when neither answered — which is wrong for every repository having
  // neither file at its root. A Go repository has no package.json, and plenty
  // have no root README: gothinkster/golang-gin-realworld-example-app has
  // neither, and was declared `master`.
  //
  // The guess then survived long enough to do damage, because
  // raw.githubusercontent.com STILL SERVES a branch GitHub has renamed —
  // `master/go.mod` returns 200 on a repository whose only branches are `main`
  // and two feature branches. Detection succeeded against a ref that does not
  // exist and the build died at `Remote branch master not found in upstream
  // origin`, after leasing a machine.
  const reported = await providerDefaultBranch(provider, repo, installationId, token);

  // A repository we can name the default branch of is one we can read. That is
  // a stronger signal than any file probe, and it is the question the refusal
  // message downstream depends on.
  let readable = reported !== null;

  // Falling back to the old guess only when the API would not answer. `main`
  // first, because a repository we cannot ask about is far more likely to be new
  // than to predate the rename.
  const branch = explicitBranch ?? reported ?? "main";

  // Only when the API would not answer — rate limiting, an outage, a repository
  // that needs an installation we do not have. A raw read of README.md is a
  // second, independent way to establish that the repository is readable, and
  // that distinction is what the refusal message downstream turns on: `we could
  // not read this` and `we read it and there is nothing here` need different
  // messages and different fixes. docker/awesome-compose was told to connect a
  // GitHub account it does not need, because we conflated them.
  if (!readable) {
    readable = (await probe(repo, branch, `${dir}README.md`, installationId, provider, token)) !== null;
  }

  const files: RepoFiles = { paths: [], contents: {} };

  // ONE LISTING INSTEAD OF FORTY PROBES, where the provider offers one.
  //
  // Bitbucket allows sixty anonymous REST calls per hour and this loop asks
  // for about forty files, so a single deploy consumed most of an hour's
  // budget and the next failed at detect with a 429. Listing the directory
  // answers 'which of these exist' in one call, and only the handful whose
  // CONTENTS detection actually reads are fetched afterwards.
  //
  // Null means the provider would not list — not that the directory is empty —
  // so the fallback is the original per-file probe rather than an empty result.
  const listed = await providerListDir(provider, repo, branch, dir, token);
  const present = listed === null ? null : new Set(listed);
  // A directory we could list is a repository we can read, which is the same
  // signal naming the default branch gives and costs nothing extra here.
  if (present !== null) readable = true;

  for (const f of [...new Set(MARKER_FILES)]) {
    // Nested paths cannot be answered by a single-directory listing, so those
    // still probe. Every marker today is a bare name; this is here so adding
    // one with a slash does not silently stop being detected.
    const nested = f.includes("/");
    if (present !== null && !nested && !present.has(f)) continue;

    // Only these are read for their CONTENTS. The rest are detected by
    // existence alone, which the listing has already established — so on a
    // provider that lists, a repository with a package.json and a lockfile
    // costs one listing and two reads rather than forty.
    const needsBody = (DETECTION_FILES as readonly string[]).includes(f);
    if (present !== null && !needsBody) {
      readable = true;
      files.paths.push(f);
      continue;
    }

    const body = await probe(repo, branch, `${dir}${f}`, installationId, provider, token);
    if (body === null) continue;
    // A repository whose default branch is master answers nothing on main, so
    // readability is confirmed here too rather than only above.
    readable = true;
    files.paths.push(f);
    if (needsBody) files.contents[f] = body;
  }
  // Reported so the caller can tell 'read it, found nothing' from 'could not
  // read it'. Those need different messages and different fixes — and the flag
  // used to be `installationId !== null`, which answers neither.
  return { branch, files, readable };
}

export interface DeployOptions {
  repo: string;
  /**
   * Which git provider `repo` lives on.
   *
   * Optional and defaulted to github: every caller written before multi-provider
   * means github, and every existing project row says github. The connect flows,
   * webhook receivers and provider columns for gitlab and bitbucket already
   * existed — this is the parameter that was missing, so a gitlab project could
   * be recorded and its pushes received and then the build would try to clone it
   * from github.com.
   */
  provider?: GitProvider;
  teamSlug?: string;
  rootDirectory?: string | null;
  /** Public hostname label. Defaults to `v2-<project slug>`. */
  hostnameLabel?: string;
  /** Point the DNS record at this gateway address. Skipped when absent. */
  gatewayIp?: string | null;
  onProgress?: (stage: string, detail: string) => void;
  /**
   * Build an ALREADY-RECORDED deployment instead of creating one.
   *
   * The webhook records a queued deployment and returns — a build takes minutes
   * and GitHub times a delivery out in ten seconds. The worker then calls this
   * with the ref it recorded, so the row a user is already watching is the row
   * that gets built, rather than a second one appearing beside it.
   *
   * The commit is already known for these (it came from the push event), so the
   * build's own rev-parse only fills a gap it cannot overwrite.
   */
  existingDeploymentRef?: string;
}

export interface DeployResult {
  project: ProjectRow;
  deployment: DeploymentRow;
  hostname: string;
  actions: Array<{ kind: string; target: string; detail: string }>;
}

/**
 * Build and deploy a repository, recording every step.
 *
 * Throws rather than half-succeeding. A failed build leaves a deployment row in
 * `error` state — which is the point: a failure anyone can see beats a
 * failure that leaves no trace.
 */
/**
 * What a caller must supply to enqueue a build for an already-recorded row.
 *
 * THE SPLIT THIS EXISTS TO ENFORCE
 *
 * Master needs a "redeploy" button. The enqueue is a TENANT-SCOPED WRITE and
 * belongs under RLS in their route; the build is a privileged operation and
 * belongs here. Handing them a function that does both would mean a route
 * writing paas.deployments with the service role — the exact thing the
 * elevation rule forbids, and now the thing boundary.test.ts fails on.
 *
 * So the seam is: THEY create the deployment row through RLS, and pass me the
 * ref. I never decide who may deploy; I only build what is already recorded.
 */
export interface EnqueuedBuild {
  deploymentRef: string;
  accepted: boolean;
  reason?: string;
}

/**
 * Accept an already-recorded deployment for building.
 *
 * Validates that the row is real and genuinely queued, and returns rather than
 * throwing so a caller can report a useful reason. Does NOT build — the worker
 * picks it up. An endpoint that accepted a trigger and then built inline would
 * time out and report success for a build nobody watched.
 */
export async function acceptQueuedDeployment(deploymentRef: string): Promise<EnqueuedBuild> {
  const d = await deployments.byRef(deploymentRef);
  if (!d) return { deploymentRef, accepted: false, reason: "no such deployment" };
  if (d.state !== "queued") {
    // Refusing rather than rebuilding is what stops a double-click, a retry and
    // a worker from all building one deployment.
    return { deploymentRef, accepted: false, reason: `deployment is ${d.state}, not queued` };
  }
  return { deploymentRef, accepted: true };
}

/**
 * Which of a project's aliases this build is allowed to repoint.
 *
 * THE RULE: A PREVIEW NEVER MOVES A PRODUCTION HOSTNAME.
 *
 * Pointing every alias at the new deployment was correct while a project's
 * hostnames all served the same build — production plus custom domains, where
 * leaving one behind serves two different builds depending on which URL you
 * used. It becomes a production outage the moment previews exist: a preview
 * build would repoint the production alias at itself, so pushing any feature
 * branch silently replaces production with that branch.
 *
 * A preview moves ONLY its own branch alias, matched on the exact hostname, so
 * two previews of one project cannot move each other either. A production build
 * moves production and custom domains and leaves every branch alias alone.
 *
 * Separated from the deploy path so it is testable without a build, because the
 * failure it prevents is not one anybody wants to discover from production.
 */
export function aliasesToPoint(
  allAliases: AliasRow[],
  isPreview: boolean,
  hostname: string,
): AliasRow[] {
  return isPreview
    ? allAliases.filter((a) => a.kind === "branch" && a.hostname === hostname)
    : allAliases.filter((a) => a.kind !== "branch");
}

interface KubeDeployment {
  spec?: { replicas?: number };
  status?: { readyReplicas?: number; replicas?: number };
}

/**
 * Why the pods for this deployment are not ready, in one line, or null while
 * they are simply still starting.
 *
 * Only states that will NOT resolve on their own are reported. "ContainerCreating"
 * and "Pending" during an image pull are the normal path and saying anything
 * about them would train people to ignore this line; CrashLoopBackOff,
 * ImagePullBackOff and an unschedulable pod will still be true in four minutes.
 */
async function podTrouble(
  k: ReturnType<typeof kube>,
  namespace: string,
  deploymentRef: string,
): Promise<string | null> {
  interface PodList {
    items: Array<{
      status?: {
        conditions?: Array<{ type: string; status: string; reason?: string; message?: string }>;
        containerStatuses?: Array<{
          restartCount: number;
          state?: Record<string, { reason?: string; message?: string; exitCode?: number }>;
          lastState?: Record<string, { reason?: string; exitCode?: number }>;
        }>;
      };
    }>;
  }

  let pods: PodList | null = null;
  try {
    pods = await k.get<PodList>(
      `/api/v1/namespaces/${namespace}/pods?labelSelector=ahura.cloud/deployment=${deploymentRef}`,
      true,
    );
  } catch {
    return null; // unreadable is not the same as unhealthy
  }

  for (const p of pods?.items ?? []) {
    const sched = (p.status?.conditions ?? []).find((c) => c.type === "PodScheduled");
    if (sched && sched.status === "False" && sched.reason === "Unschedulable") {
      // The scheduler's own words. "Insufficient memory" is the difference
      // between the customer's bug and ours, and guessing has been wrong.
      return `pod cannot be scheduled — ${(sched.message ?? "no reason given").slice(0, 200)}`;
    }
    for (const cs of p.status?.containerStatuses ?? []) {
      const waiting = cs.state?.waiting;
      if (waiting?.reason === "CrashLoopBackOff" || waiting?.reason === "ImagePullBackOff" ||
          waiting?.reason === "ErrImagePull" || waiting?.reason === "CreateContainerConfigError") {
        const exit = cs.lastState?.terminated?.exitCode;
        return `container ${waiting.reason}${exit !== undefined ? ` (exit ${exit})` : ""}` +
          `${cs.restartCount ? `, ${cs.restartCount} restarts` : ""}`;
      }
    }
  }
  return null;
}

export async function deployFromRepo(opts: DeployOptions): Promise<DeployResult> {
  const say = opts.onProgress ?? (() => {});
  const k = kube(kubeContextFromEnv());

  // ── 1. desired state ──────────────────────────────────────────────────────
  const team = await teams.bySlug(opts.teamSlug ?? "ahura-demo");
  if (!team) {
    throw new Error(
      `team "${opts.teamSlug ?? "ahura-demo"}" not found. teams.created_by is FK'd to auth.users, ` +
        "so a team cannot be created from a script with no user context — seed one via SQL first.",
    );
  }

  // Resolve the recorded deployment FIRST when there is one, because its branch
  // decides what detection should look at. Reading it after detection is what
  // made every build — preview included — detect against main.
  const adopted = opts.existingDeploymentRef ? await deployments.byRef(opts.existingDeploymentRef) : null;
  if (opts.existingDeploymentRef && !adopted) {
    throw new Error(`deployment ${opts.existingDeploymentRef} not found`);
  }

  // Resolved ONCE and threaded through. Reading it separately at each of the
  // three places that need it is how the clone URL and the project row came to
  // disagree in the first place.
  const provider: GitProvider = opts.provider ?? "github";

  const { branch, files, readable } = await inspectRepo(
    opts.repo,
    opts.rootDirectory,
    adopted?.git_ref ?? null,
    provider,
  );
  const detection = detectFramework(files);
  const pm = detectPackageManager(files);
  const port = servingPort(detection);
  say("detect", `${detection.framework} (${detection.runtime}) on ${branch}, port ${port}`);

  if (detection.framework === "unknown") {
    // A repository we could not authenticate against looks EXACTLY like one
    // with no marker files, and telling somebody to add a Dockerfile they
    // already have is worse than saying nothing. Name the likelier cause.
    // NOT `we had no token`. github/gitignore and docker/awesome-compose are
    // public, were read perfectly well, and simply have nothing deployable at
    // their root — and both were told to connect a GitHub account, which would
    // not have helped and is not the problem.
    if (!readable) {
      // Customer-facing on purpose: they own the fix, and the distinction
      // between 'we could not read it' and 'we read it and found nothing' is
      // exactly what they need to act.
      throw customerError(
        "repo_unreadable",
        `We could not read ${opts.repo}. If it is private, connect the account that owns it and ` +
          `deploy again — we saw no files at all, which usually means we do not have access ` +
          `rather than that the repository is empty.`,
      );
    }
    throw customerError(
      "framework_undetected",
      `We could not work out how to build ${opts.repo}. ${detection.reason}`,
    );
  }

  // A PYTHON PROJECT WHOSE ENTRYPOINT WE WOULD BE INVENTING.
  //
  // The Python start commands are guesses dressed as certainties:
  // `gunicorn app:app` for Flask, and a wsgi.py hunt for Django. Neither is
  // read from the repository — they are what a Python app USUALLY looks like.
  // When the guess is wrong there is no good failure: pallets/flask spent a
  // build machine to fail installing itself, and tiangolo/full-stack-fastapi-
  // template built, published, routed, and then crash-looped on exit 2, which
  // reaches the customer as a 503 with no cause attached.
  //
  // Both are the same shape — a repository whose application is not at the
  // root — and both have the same answer, which we can give in a second
  // instead of in four minutes. If none of the usual entrypoints is at the
  // root, we do not know how to start this and should say so.
  const PYTHON_ENTRYPOINTS = [
    "manage.py", "app.py", "main.py", "wsgi.py", "asgi.py", "application.py", "server.py", "run.py",
  ];
  if (detection.runtime === "python" && !PYTHON_ENTRYPOINTS.some((f) => files.paths.includes(f))) {
    throw customerError(
      "no_entrypoint",
      `This looks like a ${detection.framework} app, but none of ${PYTHON_ENTRYPOINTS.join(", ")} is at ` +
        `the root, so there is nothing for us to start. If the app lives in a subdirectory, set the ` +
        `root directory to it in Settings; if this is a library rather than an app, it cannot be ` +
        `deployed here.`,
    );
  }

  // A STATIC FRAMEWORK WITH NOTHING TO BUILD AND NOTHING TO SERVE.
  //
  // The static Dockerfile has two shapes: build then copy the output, or — when
  // there is no build script — copy a pre-built directory straight out of the
  // repository. The second is right for a plain HTML site and wrong for
  // everything else, and when it is wrong Docker fails with
  //
  //     failed to calculate checksum of ref …: "/dist": not found
  //
  // which says nothing a customer can act on. withastro/starlight hit exactly
  // this: a workspace root whose build scripts live in its packages, so the
  // root has no build command and no dist to copy.
  //
  // An index.html at the root means it really is a pre-built site and the copy
  // is correct. Without one, refusing here costs nothing — the build was going
  // to fail a minute later with a worse message and a leased machine.
  if (detection.runtime === "static" && !detection.buildCommand && !files.paths.includes("index.html")) {
    throw customerError(
      "nothing_to_build",
      `This looks like a ${detection.framework} project, but it has no build script and no ` +
        `index.html we could serve as-is. If this is a monorepo, set the root directory to the app ` +
        `that builds; if it is a plain static site, commit an index.html at that root.`,
    );
  }

  const slug = opts.repo.split("/")[1].toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 38);

  // AN ADOPTED DEPLOYMENT ALREADY KNOWS ITS PROJECT. Use it, and never re-derive
  // one from the team slug.
  //
  // Re-deriving was correct while scripts were the only caller: they pass no
  // teamSlug, `ahura-demo` is the seeded team, and the lookup found what they
  // meant. The dashboard is the second caller, and its projects live in the
  // customer's OWN team — so the lookup missed, created a duplicate project in
  // ahura-demo, and split one app across two rows: the deployment stayed with
  // the customer's project while the alias and DNS were created against the
  // phantom one. The hostname then served 404, because it pointed at a project
  // with no ready deployment.
  //
  // Observed exactly that way on the first dashboard deploy. Third instance of
  // the same shape today — a default that fits the only case that exists is a
  // landmine for the case about to be added (see docs/v2/00-PROJECT.md §8).
  let project = adopted ? await projects.byId(adopted.project_id) : await projects.bySlug(team.id, slug);
  if (adopted && !project) {
    throw new Error(`deployment ${adopted.ref} references project ${adopted.project_id}, which does not exist`);
  }
  if (adopted && project) {
    say("project", `${project.ref} (from the deployment, not re-derived)`);
  }
  if (!project) {
    project = await projects.create({
      teamId: team.id,
      name: opts.repo,
      slug,
      provider,
      repoId: opts.repo,
      repoFullName: opts.repo,
      productionBranch: branch,
      rootDirectory: opts.rootDirectory ?? null,
      framework: detection.framework,
    });
    say("project", `created ${project.ref}`);
  } else {
    say("project", `reusing ${project.ref}`);
  }

  const env =
    (await environments.production(project.id)) ??
    (await environments.create({ projectId: project.id, kind: "production", name: "production" }));

  // A worker building an already-recorded deployment adopts that row rather
  // than creating a second one. The runtime facts are written now, because the
  // webhook could not know them — it had a commit, not a framework.
  let d: DeploymentRow;
  if (adopted) {
    const found = adopted;
    if (found.state !== "queued") {
      // Refusing rather than rebuilding is what stops two workers, or a worker
      // and a retry, from both building one commit.
      throw customerError(
        "not_queued",
      `That deployment has already ${found.state === "ready" ? "finished" : `moved on (${found.state})`}, ` +
          `so it cannot be built again. Start a new deployment instead.`,
      );
    }
    d = await deployments.setRuntimeFacts(found.ref, { containerPort: port, runAsUser: runtimeUid(detection) });
    say("deployment", `${d.ref} adopted (${d.trigger})`);
  } else {
  // The deployment row exists BEFORE any build resource is leased, so a crash
  // anywhere below leaves a visible record rather than an orphan.
  d = await deployments.create({
    projectId: project.id,
    environmentId: env.id,
    trigger: "manual",
    // NULL, not a placeholder. At this point the repository has not been cloned
    // and the commit is genuinely unknown; the build fills it in below once it
    // reports what it actually checked out.
    //
    // This used to write '0000000', which satisfies the sha regex and is
    // therefore indistinguishable from a real value. Master's promote picker
    // labels each option by short sha, so every manual deploy rendered as an
    // identical "0000000" and a user could not tell which build they were
    // pointing a hostname at.
    gitSha: null,
    gitRef: branch,
    // Persist the runtime facts. The reconciler builds pod specs from rows, so
    // a port or uid that lives only in detection means it has to guess — and it
    // guessed 3000 for everything, which crash-looped every app listening
    // elsewhere.
    containerPort: port,
    runAsUser: runtimeUid(detection),
  });
  say("deployment", `${d.ref} queued`);
  }

  // ── 2. build ──────────────────────────────────────────────────────────────
  await deployments.setState(d.ref, { state: "building", startedAt: true });
  // Whether the repository ACTUALLY ships a lockfile, from the marker files
  // detection already read. Every frozen-install flag is a hard error without
  // one, so assuming its presence made any lockfile-less repository unbuildable.
  // A WORKSPACE NEEDS ITS WHOLE TREE BEFORE INSTALL.
  //
  // pnpm-workspace.yaml, or a `workspaces` field in package.json, means the
  // root's dependencies point at sibling packages. Copying the root manifest
  // alone and installing gives
  // ERR_PNPM_WORKSPACE_PKG_NOT_FOUND — the dependency exists, the directory
  // it lives in does not. Found on vitejs/vite; vercel/commerce, docusaurus
  // and starlight are the same shape.
  const rootPackageJson = files.contents["package.json"] ?? "";
  let declaresWorkspaces = false;
  try {
    declaresWorkspaces = Boolean(JSON.parse(rootPackageJson || "{}")?.workspaces);
  } catch {
    // An unparseable package.json is not a workspace claim. Detection will
    // fail on it separately and more clearly than a JSON error here would.
  }
  const isWorkspace = files.paths.includes("pnpm-workspace.yaml") || declaresWorkspaces;

  // AND WHETHER INSTALLING RUNS A SCRIPT OF THE REPOSITORY'S OWN.
  //
  // `prisma generate` is the commonest postinstall there is, and it reads
  // prisma/schema.prisma — a file the manifest-only deps stage has not copied.
  // It then emits a client with no models in it, and the build dies much later
  // with a type error in the application's own source. Nothing in that message
  // points back at the install.
  let installRunsRepoScripts = false;
  try {
    const scripts = JSON.parse(rootPackageJson || "{}")?.scripts ?? {};
    installRunsRepoScripts = Boolean(scripts.postinstall || scripts.prepare);
  } catch {
    // Already handled where the workspace claim is read.
  }

  const hasLockfile =
    files.paths.includes("package-lock.json") ||
    files.paths.includes("pnpm-lock.yaml") ||
    files.paths.includes("yarn.lock") ||
    files.paths.includes("bun.lockb") ||
    files.paths.includes("bun.lock");

  // PUBLIC ENVIRONMENT VARIABLES HAVE TO REACH THE BUILD, because nothing
  // downstream can supply them.
  //
  // A NEXT_PUBLIC_ / VITE_ / PUBLIC_ value is read by the bundler and written
  // into the JavaScript it emits. There is no later step that can inject it:
  // by the time the container starts, the bundle is already written.
  //
  // The reconciler knows this and deliberately leaves public keys OUT of the
  // runtime Secret, on the stated grounds that they are "already baked into the
  // image as build args". Nothing baked them. This call site passed an empty
  // key list and empty build args, so a customer who set NEXT_PUBLIC_API_URL
  // got it in neither place and the value simply disappeared — the build
  // succeeded, the page loaded, and the fetch went to `undefined`.
  const publicEnv: Record<string, string> = {};
  // AND THE SERVER-SIDE ENVIRONMENT, WHICH THE BUILD ALSO NEEDS.
  //
  // Not everything is configured at boot. @t3-oss/env-nextjs validates during
  // `next build` and throws when DATABASE_URL is missing; a Next.js page that
  // reads a secret during static generation needs it before the container
  // exists at all. shadcn-ui/taxonomy could not be deployed here for exactly
  // that reason, no matter how completely its environment was filled in.
  //
  // These travel as a buildkit SECRET MOUNT, never as a build arg: a build arg
  // is recorded in the image and readable by anyone who can pull it.
  const buildSecrets: Record<string, string> = {};
  try {
    for (const row of await envVars.listForSync(project.id, d.environment_id)) {
      const value = decryptEnvValue(project.ref, row.key, pgHexToBytes(row.value_ct), row.dek_id);
      if (row.is_public) publicEnv[row.key] = value;
      else buildSecrets[row.key] = value;
    }
  } catch (e) {
    // A value we cannot decrypt must stop the build. Continuing bakes a missing
    // key into the bundle, and that failure surfaces in someone's browser with
    // nothing pointing back to here.
    // The underlying failure is a decryption or a database problem — ours,
    // and named in terms the customer cannot use. It reaches the log through
    // toCustomerFacing at the seam; it must not ride along in the message.
    throw new Error(
      `cannot read the public environment for ${project.ref}: ${(e as Error).message}`,
    );
  }

  // WHICH NODE, because a repository that pins one is pinning it for a reason:
  // a native addon with no prebuilt binary for a newer ABI, a dependency that
  // reads a V8 header that has since changed. Building those on the newest Node
  // fails deep inside node-gyp with a message naming a C++ header, which nobody
  // traces back to a base image they never chose. This hardcoded 22 and ignored
  // every pin the repository offered.
  const nodeChoice = resolveNodeVersion({
    enginesNode: enginesNodeFrom(rootPackageJson),
    nvmrc: files.contents[".nvmrc"] ?? null,
  });
  // Only where it means something. The choice is computed for every runtime
  // because it is cheap, but announcing "node 22" while building a Django app
  // is a false statement in a log the customer reads.
  if (detection.runtime === "node" || detection.runtime === "static") {
    say("detect", `node ${nodeChoice.major} — ${nodeChoice.reason}`);
  }

  const dockerfile = generateDockerfile({
    detection,
    packageManager: pm,
    hasLockfile,
    nodeVersion: String(nodeChoice.major),
    isWorkspace,
    installRunsRepoScripts,
    // Only public-prefixed keys become build args; runtime values are injected
    // from a Secret and must never enter an image layer.
    publicEnvKeys: Object.keys(publicEnv),
  });

  // A CLONE CREDENTIAL, for the same reason detection needed one.
  //
  // BuildRequest has carried a `gitToken` field documented "private
  // repositories only" since it was written, and nothing ever set it. The VM
  // cloned anonymously, so a private repository failed at `git clone` with no
  // more detail than that — after leasing a Linode and paying for it.
  //
  // SCOPED TO THIS ONE REPOSITORY. buildCloneUrl mints a token restricted to
  // the repository ids it is given, so a build VM that leaks its credential
  // leaks access to the repository it was already building rather than to
  // every repository the installation can see — 49 of them, in the case that
  // found this.
  //
  // The numeric id has to be looked up: paas.projects.repo_id holds the full
  // name despite its name, so it cannot be used for scoping.
  let gitToken: string | null = null;
  const clone = cloneTarget(provider, opts.repo);

  // GitHub App installations, and the visibility pre-check below, are GitHub
  // concepts. The other providers hold an OAuth token on the installation row
  // instead; a public repository on any of them needs no token at all, which is
  // what makes this path provable without an OAuth app registration.
  const buildInstallationId =
    provider === "github" ? await installationForRepo(opts.repo) : null;
  if (buildInstallationId !== null) {
    const visible = await listInstallationRepos(buildInstallationId);
    const match = visible.find((r) => r.full_name.toLowerCase() === opts.repo.toLowerCase());
    if (!match) {
      // Refuse before leasing a VM. Proceeding would spend money to reach a
      // clone failure whose real cause — the installation cannot see this
      // repository — appears nowhere in the build log.
      throw customerError(
        "repo_not_granted",
        `Your connected GitHub account cannot see ${opts.repo}. Grant it access to that ` +
          `repository and deploy again.`,
      );
    }
    gitToken = (await buildCloneUrl(buildInstallationId, { id: match.id, full_name: match.full_name })).token;
  } else if (provider !== "github") {
    // GitLab and Bitbucket: the OAuth token from the connection row, or null
    // for a public repository. The credential file is written only when there
    // is a token, so null simply means an anonymous clone.
    gitToken = await oauthTokenForRepo(provider, opts.repo);
  }

  const req: BuildRequest = {
    deploymentRef: d.ref,
    // Per provider. This line said github.com unconditionally, so a gitlab
    // project — which the connect flow, the webhook receiver and the provider
    // column all supported — would be cloned from a github URL that does not
    // exist.
    cloneUrl: clone.cloneUrl,
    gitUsername: clone.username,
    gitToken,
    gitRef: branch,
    // Build the commit the ROW records, when it records one. A webhook-created
    // deployment knows its sha from the push event, and the branch may have
    // moved on by the time the worker gets here. "HEAD" means the branch tip,
    // which is right only when no particular commit was asked for.
    gitSha: d.git_sha ?? "HEAD",
    dockerfile,
    rootDirectory: opts.rootDirectory ?? null,
    // A monorepo whose Dockerfile is committed in a subdirectory but written to
    // be built from the repository root — `docker build -f sub/Dockerfile .` —
    // cannot be expressed by a root directory alone: the files it needs are
    // outside every candidate context.
    buildContextRepoRoot: project.build_context_repo_root === true,
    imageName: `${project.ref}:${d.ref}`,
    // Values for the ARG lines the Dockerfile just declared. These are public by
    // definition — they end up readable in the shipped JavaScript either way — so
    // a build arg is the right carrier. A secret must never travel this path.
    buildArgs: publicEnv,
    // Mounted for the build step only, and in no layer afterwards.
    buildSecrets,
  };

  const vm = await leaseBuildVm(req, { record: true });
  say("build", `linode ${vm.linodeId} leased (row ${vm.ref})`);
  let result;
  try {
    result = await pollBuildResult(d.ref, {
      onTick: (ms) => say("build", `${Math.round(ms / 1000)}s`),
    });
  } finally {
    // Destroyed on EVERY path out, including a throw.
    await destroyBuildVm(vm.linodeId, vm.ref).catch(() => {});
  }

  if (!result || result.status !== "success") {
    const raw = result?.error ?? null;
    // Two audiences, two strings. The customer gets a sentence they can act on
    // when the failure is theirs, and a generic one plus a reference when it is
    // ours; the operator gets the original, in the log and in the throw.
    const shown = buildFailureMessage(raw);
    await deployments.setState(d.ref, {
      state: "error",
      errorCode: shown.code,
      errorMessage: shown.message,
    });
    throw customerError(shown.code, shown.message);
  }
  say("build", `image ${result.imageDigest}`);

  // Record the commit the build actually checked out. Only when the build
  // reported one — an empty or malformed value stays null rather than becoming
  // a plausible-looking string, which is the whole reason '0000000' was a bug.
  // The column is write-once, so this can fill the unknown but never rewrite it.
  if (result.gitSha && /^[0-9a-f]{7,40}$/.test(result.gitSha)) {
    await deployments.setState(d.ref, { gitSha: result.gitSha });
    say("build", `commit ${result.gitSha.slice(0, 7)}`);
  }

  // ── 3. publish ────────────────────────────────────────────────────────────
  await deployments.setState(d.ref, { state: "publishing" });
  const jobName = `pub-${d.ref}`;
  await k.delete(`/apis/batch/v1/namespaces/${PAAS_NAMESPACE}/jobs/${jobName}?propagationPolicy=Background`);
  await new Promise((r) => setTimeout(r, 2000));
  await k.apply(
    `/apis/batch/v1/namespaces/${PAAS_NAMESPACE}/jobs/${jobName}`,
    publisherJob({
      deploymentRef: d.ref,
      presignedTarUrl: presign("GET", r2Keys.imageTar(d.ref), 1800),
      imageRef: `${REGISTRY_PUSH}/${project.ref}:${d.ref}`,
    }),
  );

  const deadline = Date.now() + 8 * 60_000;
  let published = false;
  while (Date.now() < deadline) {
    let job = null;
    try {
      job = await k.get<{ status?: { succeeded?: number; failed?: number } }>(
        `/apis/batch/v1/namespaces/${PAAS_NAMESPACE}/jobs/${jobName}`,
        true,
      );
    } catch {
      /* transient API blip: keep polling rather than abandoning a paid-for build */
    }
    if (job?.status?.succeeded) { published = true; break; }
    if (job?.status?.failed) break;
    say("publish", "…");
    await new Promise((r) => setTimeout(r, 5000));
  }

  if (!published) {
    await deployments.setState(d.ref, {
      state: "error",
      errorCode: "publish_failed",
      // "publisher" is an internal component and names nothing the customer
      // can act on. They need to know it is ours and that retrying is the
      // right next step.
      errorMessage: GENERIC.build,
    });
    throw new Error(`publish failed for ${d.ref}`);
  }

  // image_digest is write-once at the database level, so a late or duplicate
  // finalizer cannot rewrite it.
  //
  // NOT `ready` HERE. Publishing means the image reached the registry — it says
  // nothing about whether anything runs it, and the workload does not even
  // exist yet: routing and convergence are two steps below. Marking ready here
  // meant a deployment reported ready while its pod was Pending for want of
  // memory, and again while it crash-looped on a missing module. Both times the
  // customer saw a ready badge and a dead site, which is worse than an error,
  // because an error is actionable. `ready` is now set after the rollout is
  // observed at the end of this function.
  await deployments.setState(d.ref, {
    imageRepo: project.ref,
    imageDigest: result.imageDigest!,
  });
  say("publish", "image published");

  // ── 3b. reclaim the transfer artifact ─────────────────────────────────────
  //
  // image.tar exists to move bytes from a build VM that holds no registry
  // credentials to a publisher that does. Once skopeo has finished, it is a
  // second copy of something already stored durably — and nothing was deleting
  // it, so 8 deployments had left 592 MB, 65% of the bucket, growing with
  // deploy frequency.
  //
  // Deleted HERE rather than by a scheduled reaper, on app-deploy-3's argument:
  // the reaper's licence to delete comes from a human reading its plan, and an
  // unattended hourly version is wrong 24 times a day the first time its
  // classification is wrong. This is the same delete with the safety established
  // at the one moment it is cheapest to establish — we have just published, and
  // can read the registry's own storage to confirm it.
  //
  // Wrapped whole: a deploy that succeeded must not fail because cleanup did.
  // A tarball nobody deleted costs a fraction of a cent; a failed deploy costs a
  // customer their release.
  try {
    const durability = await imageIsDurable(project.ref, result.imageDigest!);
    if (durability.durable) {
      await deleteObject(r2Keys.imageTar(d.ref));
      say("reclaim", `image.tar deleted — ${durability.reason}`);
    } else {
      // Kept, deliberately and loudly. The reaper will report it later, and a
      // human decides. Silence here would look identical to a successful
      // reclaim in the logs.
      say("reclaim", `image.tar KEPT — ${durability.reason}`);
    }
  } catch (err) {
    say("reclaim", `image.tar KEPT — cleanup failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── 4. route ──────────────────────────────────────────────────────────────
  //
  // WHICH ENVIRONMENT IS THIS BUILD FOR? Everything below depends on it, and
  // getting it wrong is not a routing inconvenience — it is production serving
  // a feature branch.
  //
  // Derived from the recorded deployment's environment rather than passed in.
  // The build worker calls this with only a deployment ref, so an option would
  // have defaulted, and the default would have been "production" — which is
  // exactly the bug: a preview build taking the production hostname because
  // nobody told it otherwise.
  const buildEnv = d.environment_id ? await environments.byId(d.environment_id) : null;
  const isPreview = buildEnv?.kind === "preview";

  // A preview's hostname is minted from the branch; production keeps the
  // project label. `previewLabel` hashes the FULL branch name, so two branches
  // whose labels truncate to the same prefix still get distinct hostnames.
  const label = isPreview
    ? previewLabel(project.slug, d.git_ref ?? buildEnv!.name)
    : (opts.hostnameLabel ?? `v2-${project.slug}`).slice(0, 40);

  // Refuse names the business already uses. The alias check below only asks
  // "does another PROJECT hold this?" — it cannot see that `api` and `www` are
  // live production records in the same zone, because they have no paas.aliases
  // row. Without this, a tenant could claim the company's own hostname: not a
  // naming collision but a takeover, and reachable by anyone who can create a
  // project.
  assertLabelAvailable(label);

  const hostname = appHostname(label);

  // Refuse to claim a hostname another project already holds. The unique index
  // would reject it anyway; failing here says why.
  const clash = await aliases.byHostname(hostname);
  if (clash && clash.project_id !== project.id) {
    throw customerError(
      "hostname_taken",
      `${hostname} is already in use by another app. Rename this app to get a different address.`,
    );
  }

  const allAliases = await aliases.forProject(project.id);
  const production = allAliases.find((a) => a.kind === "production");

  // WHICH ALIASES THIS BUILD IS ALLOWED TO MOVE.
  //
  // Pointing EVERY alias at the new deployment was right while a project's
  // hostnames all served the same build: production plus custom domains, where
  // leaving one behind serves two different builds depending on the URL used.
  //
  // It is catastrophically wrong once previews exist. A preview build would
  // repoint the PRODUCTION alias at itself, so pushing any feature branch
  // replaces production with that branch. Latent rather than live — no preview
  // has ever been built — but reachable the moment the webhook started
  // recording preview deployments, which it now does.
  //
  // So the rule is by environment, not by project: a preview moves only its own
  // branch alias, and a production build moves production and custom domains
  // while leaving every branch alias alone.
  const existing = aliasesToPoint(allAliases, isPreview, hostname);

  const toPoint = [...existing];

  if (isPreview) {
    if (!existing.length) {
      const created = await aliases.create({ projectId: project.id, hostname, kind: "branch" });
      say("route", `alias ${created.ref} -> ${hostname} (preview of ${d.git_ref ?? buildEnv!.name})`);
      toPoint.push(created);
    }
  } else if (!production) {
    const created = await aliases.create({ projectId: project.id, hostname, kind: "production" });
    say("route", `alias ${created.ref} -> ${hostname} (production)`);
    toPoint.push(created);
  } else if (!existing.some((a) => a.hostname === hostname)) {
    // An explicitly requested hostname that this project does not yet hold.
    // Earlier this was silently ignored when a production alias already
    // existed, which is how a live hostname stayed untracked: the deploy
    // "succeeded" and the requested URL was never recorded at all.
    const created = await aliases.create({ projectId: project.id, hostname, kind: "custom" });
    say("route", `alias ${created.ref} -> ${hostname} (additional)`);
    toPoint.push(created);
  }

  for (const a of toPoint) await aliases.point(a.ref, d.id);
  const alias = toPoint.find((a) => a.hostname === hostname) ?? production!;

  // ── 5. converge ───────────────────────────────────────────────────────────
  const report = await reconcileProject(kubeContextFromEnv(), project, { appDomain: "" });
  for (const a of report.actions) say("converge", `${a.kind} ${a.target} — ${a.detail}`);

  // ── 5b. does it actually run? ─────────────────────────────────────────────
  //
  // The workload exists now, which is not the same as serving. A pod can sit
  // Pending because the node has no memory left, or come up and crash-loop on
  // its first line — and until this check existed, both reported `ready`.
  //
  // What we wait for is the Deployment's own readiness count, because that is
  // the same condition the Service uses to decide whether to send traffic. If
  // it never gets there, the deploy failed, and saying so with the reason is
  // the whole point.
  const ns = tenantNamespace(project);
  const rolloutDeadline = Date.now() + 4 * 60_000;
  let rollout: { ok: boolean; reason: string } = { ok: false, reason: "rollout did not start" };

  while (Date.now() < rolloutDeadline) {
    let live: KubeDeployment | null = null;
    try {
      live = await k.get<KubeDeployment>(`/apis/apps/v1/namespaces/${ns}/deployments/${d.ref}`, true);
    } catch {
      /* transient API blip: keep polling rather than failing a good deploy */
    }

    const desired = live?.spec?.replicas ?? null;
    // Deliberately asleep is not a failure. An app with scale to zero on can be
    // converged at zero replicas, and waiting for a pod that nothing intends to
    // start would turn a working configuration into a failed deploy.
    if (desired === 0) { rollout = { ok: true, reason: "scaled to zero — nothing to wait for" }; break; }

    const ready = live?.status?.readyReplicas ?? 0;
    if (desired !== null && ready >= desired && ready > 0) {
      rollout = { ok: true, reason: `${ready}/${desired} replicas ready` };
      break;
    }

    // Name the reason WHILE waiting, not only at the end — a four-minute silence
    // followed by "timed out" hides a pod that said CrashLoopBackOff at second
    // twenty.
    const why = await podTrouble(k, ns, d.ref);
    if (why) {
      say("rollout", why);
      rollout = { ok: false, reason: why };
    } else {
      say("rollout", `${ready}/${desired ?? "?"} ready…`);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }

  if (!rollout.ok) {
    await deployments.setState(d.ref, {
      state: "error",
      errorCode: "rollout_failed",
      errorMessage:
        "Your app was built and published, but it did not start. Check Runtime logs for what it " +
        "printed as it exited.",
    });
    throw new Error(`rollout failed for ${d.ref}: ${rollout.reason}`);
  }
  say("rollout", rollout.reason);

  // ── 6. DNS, last ──────────────────────────────────────────────────────────
  // After convergence, so a record never points at a hostname that cannot yet
  // serve. publish-app.ts already refuses to overwrite a record pointing
  // elsewhere; the same rule applies here.
  if (opts.gatewayIp) {
    const existing = (await listDnsRecords(alias.hostname)).filter((r) => r.name === alias.hostname);
    if (existing.length && existing.some((r) => r.content !== opts.gatewayIp)) {
      say("dns", `REFUSED: ${alias.hostname} already points at ${existing[0].content}`);
    } else {
      const rec = await upsertDnsRecord({
        type: "A",
        name: alias.hostname,
        content: opts.gatewayIp,
        proxied: true,
      });
      say("dns", `${rec.name} -> ${rec.content} proxied`);
    }
  } else {
    // LOUD, because the deploy otherwise reports complete success while leaving
    // a hostname that resolves to nothing. Everything else here succeeded — the
    // image published, the alias row exists, the Ingress routes — so the only
    // symptom is NXDOMAIN, which looks like a DNS problem rather than a deploy
    // that skipped a step.
    //
    // Reachable in the real path, not just in scripts: the build worker reads
    // the gateway address from the LoadBalancer's status, and that is null while
    // the address is still being assigned. An absent input silently turning a
    // step into a no-op is the same failure this codebase keeps finding; here it
    // ends in an app nobody can reach.
    say("dns", `SKIPPED — no gateway address given, so ${alias.hostname} will not resolve`);
  }

  // ── 7. ready, and only now ────────────────────────────────────────────────
  //
  // Everything the word promises is true at this point and not before: the
  // image is published, the alias points at this deployment, the workload has
  // converged, and a pod is actually serving.
  await deployments.setState(d.ref, { state: "ready", readyAt: true });
  say("ready", `${alias.hostname} is serving`);

  return {
    project,
    deployment: (await deployments.byRef(d.ref))!,
    hostname: alias.hostname,
    actions: report.actions,
  };
}
