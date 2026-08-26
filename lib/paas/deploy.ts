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
import { leaseBuildVm, pollBuildResult, destroyBuildVm, type BuildRequest } from "./build/vm.ts";
import { presign, getObject, deleteObject, r2Keys } from "./build/r2.ts";
import { imageIsDurable } from "./build/registry.ts";
import { kube } from "./k8s/client.ts";
import { PAAS_NAMESPACE, REGISTRY_PUSH, publisherJob } from "./k8s/manifests.ts";
import { reconcileProject, kubeContextFromEnv } from "./reconciler.ts";
import { teams, projects, environments, deployments, aliases, type DeploymentRow, type ProjectRow, type AliasRow } from "./db.ts";
import { appHostname } from "./config.ts";
import { assertLabelAvailable, previewLabel } from "./hostnames.ts";
import { upsertDnsRecord, listDnsRecords } from "./edge/cloudflare.ts";

const UA = "ahuracloud-deploy-v2";

const MARKER_FILES = [
  "Dockerfile", "package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb",
  "requirements.txt", "pyproject.toml", "Pipfile", "manage.py", "go.mod", "Gemfile",
  "pom.xml", "build.gradle", "build.gradle.kts", "composer.json", "index.html",
  ...DETECTION_FILES,
];

async function probe(repo: string, branch: string, path: string): Promise<string | null> {
  const r = await fetch(`https://raw.githubusercontent.com/${repo}/${branch}/${path}`, {
    headers: { "User-Agent": UA },
  });
  return r.ok ? r.text() : null;
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
): Promise<{ branch: string; files: RepoFiles }> {
  const dir = rootDirectory ? `${rootDirectory.replace(/^\/+|\/+$/g, "")}/` : "";
  const branch =
    (await probe(repo, "main", `${dir}README.md`)) !== null ||
    (await probe(repo, "main", `${dir}package.json`)) !== null
      ? "main"
      : "master";

  const files: RepoFiles = { paths: [], contents: {} };
  for (const f of [...new Set(MARKER_FILES)]) {
    const body = await probe(repo, branch, `${dir}${f}`);
    if (body === null) continue;
    files.paths.push(f);
    if ((DETECTION_FILES as readonly string[]).includes(f)) files.contents[f] = body;
  }
  return { branch, files };
}

export interface DeployOptions {
  repo: string;
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

  const { branch, files } = await inspectRepo(opts.repo, opts.rootDirectory);
  const detection = detectFramework(files);
  const pm = detectPackageManager(files);
  const port = servingPort(detection);
  say("detect", `${detection.framework} (${detection.runtime}) on ${branch}, port ${port}`);

  if (detection.framework === "unknown") {
    throw new Error(`cannot determine how to build ${opts.repo}: ${detection.reason}`);
  }

  const slug = opts.repo.split("/")[1].toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 38);
  let project = await projects.bySlug(team.id, slug);
  if (!project) {
    project = await projects.create({
      teamId: team.id,
      name: opts.repo,
      slug,
      provider: "github",
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
  if (opts.existingDeploymentRef) {
    const found = await deployments.byRef(opts.existingDeploymentRef);
    if (!found) throw new Error(`deployment ${opts.existingDeploymentRef} not found`);
    if (found.state !== "queued") {
      // Refusing rather than rebuilding is what stops two workers, or a worker
      // and a retry, from both building one commit.
      throw new Error(`deployment ${found.ref} is ${found.state}, not queued — refusing to rebuild it`);
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
  const dockerfile = generateDockerfile({
    detection,
    packageManager: pm,
    // Only public-prefixed keys become build args; runtime values are injected
    // from a Secret and must never enter an image layer.
    publicEnvKeys: [],
  });

  const req: BuildRequest = {
    deploymentRef: d.ref,
    cloneUrl: `https://github.com/${opts.repo}.git`,
    gitRef: branch,
    // Build the commit the ROW records, when it records one. A webhook-created
    // deployment knows its sha from the push event, and the branch may have
    // moved on by the time the worker gets here. "HEAD" means the branch tip,
    // which is right only when no particular commit was asked for.
    gitSha: d.git_sha ?? "HEAD",
    dockerfile,
    rootDirectory: opts.rootDirectory ?? null,
    imageName: `${project.ref}:${d.ref}`,
    buildArgs: {},
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
    const msg = result?.error ?? "build timed out";
    await deployments.setState(d.ref, { state: "error", errorCode: "build_failed", errorMessage: msg });
    throw new Error(`build failed for ${d.ref}: ${msg}`);
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
      errorMessage: "publisher job did not succeed",
    });
    throw new Error(`publish failed for ${d.ref}`);
  }

  // image_digest is write-once at the database level, so a late or duplicate
  // finalizer cannot rewrite it.
  await deployments.setState(d.ref, {
    state: "ready",
    readyAt: true,
    imageRepo: project.ref,
    imageDigest: result.imageDigest!,
  });
  say("publish", "ready");

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
    throw new Error(`hostname ${hostname} is already claimed by another project`);
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
  }

  return {
    project,
    deployment: (await deployments.byRef(d.ref))!,
    hostname: alias.hostname,
    actions: report.actions,
  };
}
