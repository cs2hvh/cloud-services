/**
 * Deployment shapes shared by the list, detail and log routes.
 *
 * Deployments are immutable in paas: git_sha and image_digest are write-once
 * and terminal states (ready/error/canceled) cannot be changed. Nothing here
 * exposes a mutation, and the DTO is read-shaped on purpose — a UI that can
 * see an "edit" field will eventually grow a button for it.
 */

/**
 * These mirror Postgres enums (paas.deployment_state, paas.deployment_trigger).
 * A TypeScript union mirroring a database enum drifts silently: the compiler
 * has nothing to compare against, so a typo or a newly-added value passes
 * every test and fails at the database.
 *
 * cloud-services-73 shipped exactly that — a webhook writing trigger "push"
 * against an enum whose value is "git_push", typed as `string`, green
 * everywhere, and the first symptom would have been a customer's first push
 * returning 400 in production.
 *
 * boundary.test.ts checks these against the live enum, and SKIPS rather than
 * passes when the database is unreachable — a mirror check that quietly
 * succeeds without checking anything reports confidence it never established.
 */
export const DEPLOYMENT_STATES = [
  "queued",
  "building",
  "publishing",
  "ready",
  "error",
  "canceled",
] as const;

export const DEPLOYMENT_TRIGGERS = [
  "git_push",
  "pull_request",
  "manual",
  "redeploy",
  "rollback",
] as const;

export const TERMINAL_STATES = ["ready", "error", "canceled"] as const;
export type DeploymentState = (typeof DEPLOYMENT_STATES)[number];

export type DeploymentTrigger = (typeof DEPLOYMENT_TRIGGERS)[number];

export interface DeploymentRow {
  ref: string;
  state: DeploymentState;
  trigger: DeploymentTrigger;
  /**
   * Nullable since the deploy path became honest about commits it does not
   * know. The generated type claimed `string` for a while after the column
   * changed, which is exactly the sort of lie that makes .slice() look safe.
   */
  git_sha: string | null;
  git_ref: string;
  git_message: string | null;
  git_author: string | null;
  image_repo: string | null;
  image_digest: string | null;
  error_code: string | null;
  error_message: string | null;
  /**
   * Runtime facts captured AT BUILD TIME, not re-derived on deploy. Both
   * caused outages by living only in build-time detection: the reconciler
   * hardcoded port 3000 and killed a gunicorn app listening on 8000, and a
   * root image was rejected by runAsNonRoot with no uid to override it.
   *
   * They are per-deployment because rolling back must restore THAT build's
   * port and uid, not whatever detection would produce today.
   */
  container_port: number | null;
  run_as_user: number | null;
  /**
   * Non-null means asleep ON PURPOSE: idle, at zero replicas, waking on the
   * next request. Distinct from superseded, which is also zero replicas but is
   * an OLD build kept for rollback. Rendering them the same shows someone
   * their live production app as stopped.
   */
  scaled_to_zero_at: string | null;
  queued_at: string;
  started_at: string | null;
  ready_at: string | null;
  projects?: { ref: string; name: string; repo_full_name: string } | null;
  environments?: { ref: string; kind: string; name: string } | null;
}

export const DEPLOYMENT_COLUMNS =
  "ref, state, trigger, git_sha, git_ref, git_message, git_author, " +
  "image_repo, image_digest, error_code, error_message, " +
  "container_port, run_as_user, scaled_to_zero_at, " +
  "queued_at, started_at, ready_at";

export const DEPLOYMENT_COLUMNS_EXPANDED =
  `${DEPLOYMENT_COLUMNS}, ` +
  "projects:project_id (ref, name, repo_full_name), " +
  "environments:environment_id (ref, kind, name)";

export interface DeploymentDto {
  ref: string;
  state: DeploymentState;
  isTerminal: boolean;
  trigger: DeploymentTrigger;
  commit: {
    sha: string | null;
    shortSha: string;
    ref: string;
    message: string | null;
    author: string | null;
    /**
     * True when git_sha carries no information — the deploy path writes
     * "0000000" for anything not triggered by a real push. Every deployment in
     * production currently has it, so a UI keyed on the sha shows a list of
     * identical rows and a promote picker nobody can choose from. Callers must
     * fall back to the deployment ref when this is set.
     */
    isPlaceholder: boolean;
  };
  /** Ref when the sha is a placeholder, short sha otherwise. Safe to display. */
  label: string;
  /** What this build runs as. null means it was built before these were recorded. */
  runtime: { port: number | null; user: number | null };
  /** Timestamp it was put to sleep, or null. Feeds replicaStates. */
  scaledToZeroAt: string | null;
  image: { repo: string; digest: string } | null;
  error: { code: string | null; message: string } | null;
  timing: {
    queuedAt: string;
    startedAt: string | null;
    readyAt: string | null;
    /** Wall-clock ms from start to terminal state; null while still running. */
    durationMs: number | null;
  };
  project: { ref: string; name: string; repoFullName: string } | null;
  environment: { ref: string; kind: string; name: string } | null;
}

function durationMs(row: DeploymentRow): number | null {
  if (!row.started_at) return null;
  // A deployment that errored has no ready_at, so fall back to nothing rather
  // than measuring against now() — a failed build is not still running, and
  // showing a growing timer for it would be a lie.
  const end = row.ready_at;
  if (!end) return null;
  const ms = new Date(end).getTime() - new Date(row.started_at).getTime();
  return Number.isFinite(ms) && ms >= 0 ? ms : null;
}

/**
 * A sha that identifies nothing. Real values are 40 hex characters; the deploy
 * path writes "0000000" when it has no commit, and all-zero shas of any length
 * are the git convention for "none".
 */
export function isPlaceholderSha(sha: string | null): boolean {
  if (sha === null) return true;
  return !/^[0-9a-f]{7,40}$/i.test(sha) || /^0+$/.test(sha);
}

export function toDeploymentDto(row: DeploymentRow): DeploymentDto {
  const placeholder = isPlaceholderSha(row.git_sha);
  return {
    ref: row.ref,
    state: row.state,
    isTerminal: (TERMINAL_STATES as readonly string[]).includes(row.state),
    trigger: row.trigger,
    commit: {
      sha: row.git_sha,
      // Never .slice() a value the database may return as null.
      shortSha: row.git_sha === null ? "" : row.git_sha.slice(0, 7),
      ref: row.git_ref,
      message: row.git_message,
      author: row.git_author,
      isPlaceholder: placeholder,
    },
    // Never a row of identical zeros: the ref is unique per deployment even
    // when the commit is not recorded.
    label: placeholder || row.git_sha === null ? row.ref : row.git_sha.slice(0, 7),
    runtime: { port: row.container_port, user: row.run_as_user },
    scaledToZeroAt: row.scaled_to_zero_at,
    image:
      row.image_repo && row.image_digest
        ? { repo: row.image_repo, digest: row.image_digest }
        : null,
    error:
      row.state === "error"
        ? {
            code: row.error_code,
            // Never leave this empty: an errored deployment with no message is
            // the state users complain about most.
            message: row.error_message ?? "The build failed without a message.",
          }
        : null,
    timing: {
      queuedAt: row.queued_at,
      startedAt: row.started_at,
      readyAt: row.ready_at,
      durationMs: durationMs(row),
    },
    project: row.projects
      ? {
          ref: row.projects.ref,
          name: row.projects.name,
          repoFullName: row.projects.repo_full_name,
        }
      : null,
    environment: row.environments
      ? {
          ref: row.environments.ref,
          kind: row.environments.kind,
          name: row.environments.name,
        }
      : null,
  };
}
