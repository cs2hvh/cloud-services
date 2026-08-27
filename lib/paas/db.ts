/**
 * Control-plane database access for the `paas` schema.
 *
 * A thin PostgREST client rather than a driver, so every module in lib/paas
 * still runs under plain `node --test` with zero dependencies.
 *
 * THIS EXISTS BECAUSE OF A REAL FAILURE. The first version of the provisioning
 * scripts created live Linode resources — an LKE cluster, worker nodes, a
 * NodeBalancer, build VMs — and wrote NOTHING to `paas.clusters` or
 * `paas.build_vms`. The tables were designed precisely so infrastructure cannot
 * outlive its record, and then nothing wrote to them. That is the same shape as
 * the v1 defect that left five billing meters still active for apps that no
 * longer exist.
 *
 * The rule that follows: RECORD BEFORE YOU CREATE. A row with no cloud id is
 * harmless and reapable. A cloud resource with no row is money nobody knows
 * about.
 *
 * Uses the service role, so it is for reconcilers and provisioning scripts
 * ONLY. Anything acting on behalf of a user must go through an RLS-scoped
 * client instead — v1 used the service-role client for 100% of tenant queries
 * and reduced its own RLS to decoration.
 */

const SCHEMA = "paas";

function env(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`[paas/db] Missing ${name}`);
  return v.replace(/^"|"$/g, "");
}

function restUrl(): string {
  return `${env("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, "")}/rest/v1`;
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    "Accept-Profile": SCHEMA,
    "Content-Profile": SCHEMA,
    ...extra,
  };
}

export class DbError extends Error {
  status: number;
  body: string;
  constructor(message: string, status: number, body: string) {
    super(message);
    this.name = "DbError";
    this.status = status;
    this.body = body;
  }
}

async function req<T>(method: string, path: string, body?: unknown, prefer?: string): Promise<T> {
  const res = await fetch(`${restUrl()}/${path}`, {
    method,
    headers: headers(prefer ? { Prefer: prefer } : {}),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new DbError(`[paas/db] ${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`, res.status, text);
  }
  return (text ? JSON.parse(text) : null) as T;
}

export const db = {
  select: <T>(table: string, query = "") => req<T[]>("GET", `${table}?${query}`),
  insert: <T>(table: string, row: unknown) =>
    req<T[]>("POST", table, row, "return=representation"),
  update: <T>(table: string, query: string, patch: unknown) =>
    req<T[]>("PATCH", `${table}?${query}`, patch, "return=representation"),
  delete: (table: string, query: string) => req<null>("DELETE", `${table}?${query}`),
  /**
   * Call a SECURITY DEFINER function. Promoted here from an inline copy in
   * drift-sweep.ts once a second caller appeared — app-deploy-3 was right not
   * to extend this module for one use, and right that the second use should.
   */
  rpc: <T>(fn: string, args: Record<string, unknown> = {}) => req<T>("POST", `rpc/${fn}`, args),
  /** Prove the schema is reachable before a script starts creating resources. */
  async reachable(): Promise<boolean> {
    try {
      await req("GET", "clusters?select=ref&limit=1");
      return true;
    } catch {
      return false;
    }
  },
};

// ── clusters ────────────────────────────────────────────────────────────────

export interface ClusterRow {
  id: string;
  ref: string;
  name: string;
  region: string;
  lke_cluster_id: number | null;
  k8s_version: string | null;
  state: "provisioning" | "ready" | "draining" | "retired";
  pod_capacity: number;
  pod_allocated: number;
  accepts_new: boolean;
}

export const clusters = {
  list: () => db.select<ClusterRow>("clusters", "select=*&order=created_at"),

  byLkeId: async (lkeClusterId: number): Promise<ClusterRow | null> =>
    (await db.select<ClusterRow>("clusters", `select=*&lke_cluster_id=eq.${lkeClusterId}`))[0] ?? null,

  /**
   * Record a cluster BEFORE asking Linode to create one. `lke_cluster_id` is
   * filled in afterwards, so a crash between the two leaves a row with no cloud
   * id — visible, harmless, and cleanable — rather than a cluster nobody knows
   * about.
   */
  async reserve(input: { name: string; region: string; podCapacity?: number }): Promise<ClusterRow> {
    const [row] = await db.insert<ClusterRow>("clusters", {
      name: input.name,
      region: input.region,
      state: "provisioning",
      pod_capacity: input.podCapacity ?? 1000,
    });
    return row;
  },

  attach: async (ref: string, lkeClusterId: number, k8sVersion: string) =>
    (await db.update<ClusterRow>("clusters", `ref=eq.${ref}`, {
      lke_cluster_id: lkeClusterId,
      k8s_version: k8sVersion,
    }))[0],

  markReady: async (ref: string) =>
    (await db.update<ClusterRow>("clusters", `ref=eq.${ref}`, { state: "ready" }))[0],

  markRetired: async (ref: string) =>
    (await db.update<ClusterRow>("clusters", `ref=eq.${ref}`, {
      state: "retired",
      accepts_new: false,
    }))[0],
};

// ── build VMs ───────────────────────────────────────────────────────────────

export type BuildVmState = "requested" | "provisioning" | "running" | "releasing" | "destroyed" | "leaked";

export interface BuildVmRow {
  id: string;
  ref: string;
  deployment_id: string | null;
  linode_id: number | null;
  region: string;
  instance_type: string;
  state: BuildVmState;
  expires_at: string;
  destroyed_at: string | null;
  last_error: string | null;
}

export const buildVms = {
  /**
   * Reserve the row BEFORE leasing the instance. `expires_at` is set here, not
   * later: the reaper must be able to bound a VM's life even if every
   * subsequent step fails.
   */
  async reserve(input: {
    region: string;
    instanceType: string;
    expiresAt: Date;
    deploymentId?: string | null;
  }): Promise<BuildVmRow> {
    const [row] = await db.insert<BuildVmRow>("build_vms", {
      region: input.region,
      instance_type: input.instanceType,
      expires_at: input.expiresAt.toISOString(),
      deployment_id: input.deploymentId ?? null,
      state: "requested",
    });
    return row;
  },

  attach: async (ref: string, linodeId: number) =>
    (await db.update<BuildVmRow>("build_vms", `ref=eq.${ref}`, {
      linode_id: linodeId,
      state: "provisioning",
    }))[0],

  setState: async (ref: string, state: BuildVmState, lastError?: string) =>
    (await db.update<BuildVmRow>("build_vms", `ref=eq.${ref}`, {
      state,
      ...(state === "destroyed" ? { destroyed_at: new Date().toISOString() } : {}),
      ...(lastError ? { last_error: lastError.slice(0, 2000) } : {}),
    }))[0],

  /** Rows still claiming a live instance past their deadline. */
  expired: (now = new Date()) =>
    db.select<BuildVmRow>(
      "build_vms",
      `select=*&expires_at=lt.${now.toISOString()}&state=in.(requested,provisioning,running,releasing)`,
    ),

  live: () =>
    db.select<BuildVmRow>(
      "build_vms",
      "select=*&state=in.(requested,provisioning,running,releasing)&order=created_at",
    ),
};

// ── teams, projects, deployments, aliases ───────────────────────────────────
//
// These are TENANT tables. Everything here uses the service role and is for
// reconcilers and provisioning scripts only. Anything acting on behalf of a
// user must go through an RLS-scoped client instead — v1 used the service-role
// client for 100% of tenant queries and reduced its own RLS to decoration.

export interface TeamRow { id: string; ref: string; slug: string; name: string }
export interface ProjectRow {
  id: string; ref: string; team_id: string; name: string; slug: string;
  provider: "github" | "gitlab" | "bitbucket";
  repo_id: string; repo_full_name: string; installation_id: number | null;
  production_branch: string; root_directory: string | null; framework: string | null;
  /**
   * Scale-to-zero settings. These columns were added by the scale-to-zero
   * migration and this type was not updated with them, so `idle-sweep.ts` read
   * both fields off a type that did not declare either — the reads worked at
   * runtime because PostgREST returns the columns regardless, and the compiler
   * had nothing to check them against.
   *
   * That is worse than it sounds for these two specifically: the sweep decides
   * whether to put an app to sleep, and the whole unit-economics argument rests
   * on it. A rename on either side would have surfaced as an app that silently
   * stopped being eligible for sleep, with no error anywhere.
   *
   * `idle_seconds` is nullable in the schema — null means "use the platform
   * default", not "zero".
   */
  scale_to_zero: boolean;
  idle_seconds: number | null;
  /**
   * Instance sizing. Both NOT NULL with defaults in the schema, so a row always
   * carries them — the reconciler reads these to build the pod's resources, and
   * before they existed every app got the same 100m/256Mi regardless of what it
   * was sold.
   *
   * `tier` is a closed set constrained in the database and mirrored in
   * `lib/paas/tiers.ts`; `tiers.test.ts` asserts that mirror against the priced
   * document, and `db.schema.test.ts` asserts this interface against the live
   * columns. Adding a tier means touching all three deliberately.
   */
  tier: string;
  instance_count: number;
  /**
   * When the FIRST charge failed for lack of credit, or null.
   *
   * NULL means "never failed", and it is the only value that means that — a
   * blank or unparseable value is `unknown` to `lib/paas/arrears.ts`, which
   * neither suspends nor resumes. Set once by `paas.mark_arrears`, cleared by a
   * successful `paas.charge_project_hour`.
   */
  arrears_since: string | null;
}
export interface EnvironmentRow { id: string; ref: string; project_id: string; kind: string; name: string; created_at: string }
/**
 * Mirrors the paas.deployment_trigger enum EXACTLY.
 *
 * The webhook route was written with "push" and the enum value is "git_push",
 * so every real delivery would have failed with a 400 from PostgREST at the
 * moment a customer first pushed. A bare `string` here let a typo through
 * typechecking and into production; this makes the compiler the thing that
 * catches it, and the test below pins it against the live database.
 */
export type DeploymentTrigger = "git_push" | "pull_request" | "manual" | "redeploy" | "rollback";

export interface DeploymentRow {
  id: string; ref: string; project_id: string; environment_id: string;
  state: "queued" | "building" | "publishing" | "ready" | "error" | "canceled";
  trigger: DeploymentTrigger; git_sha: string | null; git_ref: string;
  image_repo: string | null; image_digest: string | null;
  error_code: string | null; error_message: string | null;
  container_port: number | null; run_as_user: number | null;
  queued_at: string; started_at: string | null; ready_at: string | null;
  /** Non-null means asleep ON PURPOSE — the reconciler must not scale it up. */
  scaled_to_zero_at: string | null;
}
export interface AliasRow {
  id: string; ref: string; project_id: string; hostname: string;
  kind: "production" | "branch" | "deployment" | "custom";
  deployment_id: string | null;
}

export const teams = {
  bySlug: async (slug: string) =>
    (await db.select<TeamRow>("teams", `select=*&slug=eq.${slug}`))[0] ?? null,
  create: async (input: { slug: string; name: string; createdBy: string }) =>
    (await db.insert<TeamRow>("teams", {
      slug: input.slug, name: input.name, created_by: input.createdBy,
    }))[0],
};

export const projects = {
  list: () => db.select<ProjectRow>("projects", "select=*&deleted_at=is.null&order=created_at"),
  byRef: async (ref: string) =>
    (await db.select<ProjectRow>("projects", `select=*&ref=eq.${ref}`))[0] ?? null,

  /**
   * By primary key — for resolving the project a DEPLOYMENT already names.
   *
   * The build worker previously re-derived the project from (team slug, repo
   * slug), which silently created a duplicate in the wrong team when the
   * deployment came from the dashboard rather than a script.
   */
  byId: async (id: string) =>
    (await db.select<ProjectRow>("projects", `select=*&id=eq.${id}`))[0] ?? null,

  /**
   * Resolve a project from a repository full name, for webhook delivery.
   * Deleted projects are excluded: a push to a repo whose project was removed
   * must not resurrect it.
   */
  byRepoFullName: async (fullName: string) =>
    (await db.select<ProjectRow>(
      "projects",
      `select=*&repo_full_name=eq.${encodeURIComponent(fullName)}&deleted_at=is.null`,
    ))[0] ?? null,
  bySlug: async (teamId: string, slug: string) =>
    (await db.select<ProjectRow>(
      "projects", `select=*&team_id=eq.${teamId}&slug=eq.${slug}&deleted_at=is.null`,
    ))[0] ?? null,
  create: async (input: {
    teamId: string; name: string; slug: string;
    provider: "github" | "gitlab" | "bitbucket";
    repoId: string; repoFullName: string; installationId?: number | null;
    productionBranch?: string; rootDirectory?: string | null; framework?: string | null;
  }) =>
    (await db.insert<ProjectRow>("projects", {
      team_id: input.teamId, name: input.name, slug: input.slug,
      provider: input.provider, repo_id: input.repoId, repo_full_name: input.repoFullName,
      installation_id: input.installationId ?? null,
      production_branch: input.productionBranch ?? "main",
      root_directory: input.rootDirectory ?? null,
      framework: input.framework ?? null,
    }))[0],
};

export const environments = {
  forProject: (projectId: string) =>
    db.select<EnvironmentRow>("environments", `select=*&project_id=eq.${projectId}`),
  byId: async (id: string) =>
    (await db.select<EnvironmentRow>("environments", `select=*&id=eq.${id}`))[0] ?? null,
  production: async (projectId: string) =>
    (await db.select<EnvironmentRow>(
      "environments", `select=*&project_id=eq.${projectId}&kind=eq.production`,
    ))[0] ?? null,
  create: async (input: { projectId: string; kind: string; name: string }) =>
    (await db.insert<EnvironmentRow>("environments", {
      project_id: input.projectId, kind: input.kind, name: input.name,
    }))[0],

  /**
   * The preview environment for a branch, created on first sight.
   *
   * Named after the RAW branch, not a sanitised label. `unique (project_id,
   * name)` then means one environment per branch as the database sees it —
   * `feature/foo` and `feature-foo` stay distinct, where keying on a sanitised
   * label would silently merge them into one environment serving two branches.
   * The hostname is where sanitising belongs, and `previewLabel` already carries
   * a hash of the full branch so the collision cannot reappear there either.
   *
   * The insert races: two pushes to a new branch arrive together, both find
   * nothing, both insert. That unique constraint is what resolves it — the loser
   * gets a 409 and re-selects the winner's row, rather than both proceeding and
   * leaving two environments, two aliases, and two pods for one branch.
   */
  forBranch: async (projectId: string, branch: string): Promise<EnvironmentRow> => {
    const existing = await db.select<EnvironmentRow>(
      "environments",
      `select=*&project_id=eq.${projectId}&name=eq.${encodeURIComponent(branch)}`,
    );
    if (existing[0]) return existing[0];

    try {
      return (await db.insert<EnvironmentRow>("environments", {
        project_id: projectId, kind: "preview", name: branch,
      }))[0];
    } catch (e) {
      if (!(e instanceof DbError) || e.status !== 409) throw e;
      const raced = await db.select<EnvironmentRow>(
        "environments",
        `select=*&project_id=eq.${projectId}&name=eq.${encodeURIComponent(branch)}`,
      );
      // A 409 means a row exists; if we cannot then read it, something other
      // than the race is wrong and guessing would be worse than failing.
      if (!raced[0]) throw e;
      return raced[0];
    }
  },
};

export const deployments = {
  byRef: async (ref: string) =>
    (await db.select<DeploymentRow>("deployments", `select=*&ref=eq.${ref}`))[0] ?? null,

  /**
   * Find an existing deployment for a commit. GitHub retries webhook
   * deliveries, and without this a retry builds the same commit again — double
   * spend, and two deploys of one commit racing each other to the alias.
   */
  byProjectAndSha: async (projectId: string, sha: string) =>
    (await db.select<DeploymentRow>(
      "deployments",
      `select=*&project_id=eq.${projectId}&git_sha=eq.${sha}&order=queued_at.desc&limit=1`,
    ))[0] ?? null,

  /**
   * The same question, scoped to one environment — and the correct key now that
   * previews exist.
   *
   * Project+sha was right while every push built production, and became wrong
   * the moment a second environment could want the same commit. Branching is
   * exactly that case: `git checkout -b feature-x && git push -u origin
   * feature-x` sends a push whose sha is the head of the production branch, the
   * commit already deployed. Deduping on project+sha finds it and answers
   * "already recorded" — so the preview is never created, and the failure is
   * silent, because returning 200 to GitHub is what a successful retry looks
   * like. Not an edge case: it is the first push of every new branch cut from
   * the production head.
   *
   * Same commit, same environment is a retry. Same commit, different
   * environment is a different deployment.
   */
  /** Every deployment recorded in one environment, newest first. */
  forEnvironment: (environmentId: string) =>
    db.select<DeploymentRow>(
      "deployments",
      `select=*&environment_id=eq.${environmentId}&order=queued_at.desc`,
    ),

  byEnvironmentAndSha: async (environmentId: string, sha: string) =>
    (await db.select<DeploymentRow>(
      "deployments",
      `select=*&environment_id=eq.${environmentId}&git_sha=eq.${sha}&order=queued_at.desc&limit=1`,
    ))[0] ?? null,

  /**
   * Write the runtime facts a build discovered onto an already-recorded row.
   *
   * These are NOT covered by the immutability trigger, and deliberately so: a
   * webhook records a commit before anything has looked at the repository, so
   * the port and uid are genuinely unknown until detection runs. They are
   * written once here, before the pod that consumes them exists.
   */
  setRuntimeFacts: async (ref: string, facts: { containerPort?: number; runAsUser?: number }) =>
    (await db.update<DeploymentRow>("deployments", `ref=eq.${ref}`, {
      ...(facts.containerPort != null ? { container_port: facts.containerPort } : {}),
      ...(facts.runAsUser != null ? { run_as_user: facts.runAsUser } : {}),
    }))[0],

  /**
   * Clear the sleep flag. Called when the reconciler observes that the
   * activator woke this deployment — the activator itself has no database
   * credential, by design.
   */
  clearSleep: async (ref: string) =>
    (await db.update<DeploymentRow>("deployments", `ref=eq.${ref}`, { scaled_to_zero_at: null }))[0],

  /** Queued deployments oldest first — the build worker's work list. */
  queued: (limit = 10) =>
    db.select<DeploymentRow>(
      "deployments",
      `select=*&state=eq.queued&order=queued_at.asc&limit=${limit}`,
    ),
  forProject: (projectId: string, limit = 50) =>
    db.select<DeploymentRow>(
      "deployments", `select=*&project_id=eq.${projectId}&order=queued_at.desc&limit=${limit}`,
    ),
  /** Ready deployments, newest first — the rollback candidate list. */
  readyForProject: (projectId: string, limit = 20) =>
    db.select<DeploymentRow>(
      "deployments",
      `select=*&project_id=eq.${projectId}&state=eq.ready&order=ready_at.desc&limit=${limit}`,
    ),
  create: async (input: {
    projectId: string; environmentId: string; trigger: DeploymentTrigger;
    gitSha: string | null; gitRef: string; gitMessage?: string | null;
    containerPort?: number; runAsUser?: number;
  }) =>
    (await db.insert<DeploymentRow>("deployments", {
      project_id: input.projectId, environment_id: input.environmentId,
      trigger: input.trigger, git_sha: input.gitSha, git_ref: input.gitRef,
      git_message: input.gitMessage ?? null, state: "queued",
      container_port: input.containerPort ?? null,
      run_as_user: input.runAsUser ?? null,
    }))[0],
  /**
   * Advance state. The DB trigger refuses to move a terminal deployment or to
   * rewrite an image_digest, so an out-of-order or duplicate finalization is
   * rejected by the database rather than silently overwriting — which is
   * exactly what v1's two racing finalizers did to each other.
   */
  setState: async (ref: string, patch: {
    state?: DeploymentRow["state"];
    imageRepo?: string; imageDigest?: string; gitSha?: string;
    errorCode?: string; errorMessage?: string;
    startedAt?: boolean; readyAt?: boolean;
  }) =>
    (await db.update<DeploymentRow>("deployments", `ref=eq.${ref}`, {
      ...(patch.state ? { state: patch.state } : {}),
      ...(patch.imageRepo ? { image_repo: patch.imageRepo } : {}),
      ...(patch.imageDigest ? { image_digest: patch.imageDigest } : {}),
      // Write-once in the database: null may become a value, a value may never
      // change. So this fills in a commit the build discovered without ever
      // being able to rewrite recorded provenance.
      ...(patch.gitSha ? { git_sha: patch.gitSha } : {}),
      ...(patch.errorCode ? { error_code: patch.errorCode } : {}),
      ...(patch.errorMessage ? { error_message: patch.errorMessage.slice(0, 2000) } : {}),
      ...(patch.startedAt ? { started_at: new Date().toISOString() } : {}),
      ...(patch.readyAt ? { ready_at: new Date().toISOString() } : {}),
    }))[0],
};

export const aliases = {
  all: () => db.select<AliasRow>("aliases", "select=*&order=created_at"),
  forProject: (projectId: string) =>
    db.select<AliasRow>("aliases", `select=*&project_id=eq.${projectId}`),
  production: async (projectId: string) =>
    (await db.select<AliasRow>(
      "aliases", `select=*&project_id=eq.${projectId}&kind=eq.production`,
    ))[0] ?? null,
  byHostname: async (hostname: string) =>
    (await db.select<AliasRow>("aliases", `select=*&hostname=eq.${hostname.toLowerCase()}`))[0] ?? null,
  create: async (input: {
    projectId: string; hostname: string; kind: AliasRow["kind"]; deploymentId?: string | null;
  }) =>
    (await db.insert<AliasRow>("aliases", {
      project_id: input.projectId, hostname: input.hostname.toLowerCase(),
      kind: input.kind, deployment_id: input.deploymentId ?? null,
    }))[0],
  /**
   * Promotion AND rollback are both this one call. No rebuild, no retag, no new
   * image. v1's rollback re-pointed a mutable Docker Hub tag that nothing
   * pruned or guaranteed still existed.
   */
  point: async (ref: string, deploymentId: string) =>
    (await db.update<AliasRow>("aliases", `ref=eq.${ref}`, { deployment_id: deploymentId }))[0],
};

export interface EnvVarRow {
  id: string;
  project_id: string;
  environment_id: string | null;
  key: string;
  value_ct: string;   // PostgREST renders bytea as \x<hex>
  dek_id: string;
  is_public: boolean;
}

export const envVars = {
  /**
   * Keys and metadata ONLY — never value_ct. This is what a listing endpoint
   * should use. v1's public API returned every DECRYPTED value in one
   * unaudited response, bypassing its own dashboard's per-key reveal controls.
   */
  listKeys: (projectId: string) =>
    db.select<Omit<EnvVarRow, "value_ct" | "dek_id">>(
      "env_vars",
      `select=id,project_id,environment_id,key,is_public&project_id=eq.${projectId}&order=key`,
    ),

  /**
   * WITH ciphertext. Only the reconciler should call this, to build the runtime
   * Secret. It is not an endpoint and must never become one.
   */
  listForSync: (projectId: string, environmentId: string) =>
    db.select<EnvVarRow>(
      "env_vars",
      `select=*&project_id=eq.${projectId}&or=(environment_id.eq.${environmentId},environment_id.is.null)&order=key`,
    ),

  upsert: async (input: {
    projectId: string;
    environmentId?: string | null;
    key: string;
    valueCtHex: string;
    dekId: string;
    isPublic: boolean;
  }) =>
    (await db.insert<EnvVarRow>("env_vars", {
      project_id: input.projectId,
      environment_id: input.environmentId ?? null,
      key: input.key,
      value_ct: input.valueCtHex,
      dek_id: input.dekId,
      is_public: input.isPublic,
    }))[0],

  remove: (projectId: string, key: string) =>
    db.delete("env_vars", `project_id=eq.${projectId}&key=eq.${key}`),
};
