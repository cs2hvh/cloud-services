/**
 * /api/v2/projects/[ref]/aliases
 *
 * GET  — the hostnames this project serves and what each currently points at.
 * PATCH — promote or roll back: ONE update of aliases.deployment_id.
 *
 * Promote and rollback are the same operation in opposite directions, and
 * neither rebuilds anything. The image that is already in the registry is the
 * image that gets served; only the pointer moves. That is why rollback cannot
 * fail the way a rebuild can.
 *
 * It is not instant, though. Rolling back scales a stopped pod from 0 replicas
 * to 1, so the hostname answers seconds after this write returns.
 *
 * ON THE ELEVATED CALL AT THE END OF PATCH:
 *
 * The authorization decision and the tenant write both go through RLS, as
 * everywhere else in this directory. Only the cluster convergence is elevated,
 * and it uses reconcileProjectByRef() rather than promoteAndConverge() on
 * purpose — the latter would also perform the alias write with the service
 * role, moving a tenant-scoped write outside RLS, which is exactly the v1
 * pattern this codebase exists to avoid.
 *
 * Converging one project's Kubernetes objects to match rows already written
 * has no tenant boundary to enforce: it reads desired state this caller was
 * just authorized to set and touches no other tenant's rows. If that seam ever
 * gains tenant-scoped reads, this call must move behind an endpoint owned by
 * the infrastructure lane.
 */

import { reconcileProjectByRef } from "@/lib/paas/reconciler.ts";
import { isPlaceholderSha } from "../../../_lib/deployments";
import { getCaller } from "../../../_lib/auth";
import {
  json,
  unauthenticated,
  notFound,
  invalid,
  conflict,
  fromPostgrestError,
  apiError,
} from "../../../_lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ ref: string }> };

interface AliasRow {
  ref: string;
  hostname: string;
  kind: string;
  updated_at: string;
  deployments?: {
    ref: string;
    state: string;
    /**
     * NULLABLE, and this route used to type it `string`.
     *
     * The trigger route inserts git_sha: null deliberately — the build
     * resolves the real commit and a placeholder would put another
     * indistinguishable row in the list. So every redeploy has a null sha
     * between being queued and being built, and an alias pointed at one made
     * toAliasDto throw "Cannot read properties of null (reading 'slice')".
     * That is the same crash that took down the deployment list, in a second
     * serializer, reached by a different path.
     */
    git_sha: string | null;
    git_ref: string;
    ready_at: string | null;
  } | null;
}

const ALIAS_COLUMNS =
  "ref, hostname, kind, updated_at, " +
  "deployments:deployment_id (ref, state, git_sha, git_ref, ready_at)";

/**
 * The placeholder rule is IMPORTED, not restated.
 *
 * This route reimplemented `git_sha.slice(0, 7)` beside a copy of the row
 * shape, and the copy was wrong. deployments.ts already owns what a
 * meaningless sha is — null, all zeroes, or not hex — and already decides
 * what to show instead. A second implementation of that is how the two drift,
 * which is exactly what happened here.
 */
function toAliasDto(row: AliasRow) {
  const d = row.deployments;
  const placeholder = d ? isPlaceholderSha(d.git_sha) : true;
  return {
    ref: row.ref,
    hostname: row.hostname,
    url: `https://${row.hostname}`,
    kind: row.kind,
    updatedAt: row.updated_at,
    serving: d
      ? {
          ref: d.ref,
          state: d.state,
          sha: d.git_sha,
          shortSha: d.git_sha === null ? "" : d.git_sha.slice(0, 7),
          /** Safe to render. Falls back to the ref, never to an empty cell. */
          label: placeholder || d.git_sha === null ? d.ref : d.git_sha.slice(0, 7),
          isPlaceholder: placeholder,
          gitRef: d.git_ref,
          readyAt: d.ready_at,
        }
      : null,
  };
}

async function resolveProjectId(
  caller: NonNullable<Awaited<ReturnType<typeof getCaller>>>,
  ref: string
) {
  const { data } = await caller.db
    .from("projects")
    .select("id, ref, name")
    .eq("ref", ref)
    .is("deleted_at", null)
    .maybeSingle();
  return (data ?? null) as { id: string; ref: string; name: string } | null;
}

export async function GET(_request: Request, { params }: Params) {
  const caller = await getCaller();
  if (!caller) return unauthenticated();
  const { ref } = await params;

  const project = await resolveProjectId(caller, ref);
  if (!project) return notFound("Project");

  const { data, error } = await caller.db
    .from("aliases")
    .select(ALIAS_COLUMNS)
    .eq("project_id", project.id)
    .order("kind", { ascending: true });

  if (error) {
    const mapped = fromPostgrestError(error);
    if (mapped) return mapped;
    console.error("[v2/aliases] list failed:", error);
    return apiError("internal", "Could not load aliases.", 500);
  }

  return json({
    project: { ref: project.ref, name: project.name },
    aliases: (data as AliasRow[]).map(toAliasDto),
  });
}

interface PatchBody {
  alias?: unknown;
  deployment?: unknown;
}

export async function PATCH(request: Request, { params }: Params) {
  const caller = await getCaller();
  if (!caller) return unauthenticated();
  const { ref } = await params;

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return invalid("Request body must be JSON.");
  }

  const aliasRef = typeof body.alias === "string" ? body.alias.trim() : "";
  const deploymentRef =
    typeof body.deployment === "string" ? body.deployment.trim() : "";
  if (!aliasRef || !deploymentRef) {
    return invalid("Both `alias` and `deployment` are required.", {
      alias: aliasRef ? "ok" : "required",
      deployment: deploymentRef ? "ok" : "required",
    });
  }

  const project = await resolveProjectId(caller, ref);
  if (!project) return notFound("Project");

  // Both the alias and the deployment must belong to THIS project. Without
  // this, a caller with access to two projects could point one project's
  // hostname at the other's image — the cross-tenant takeover in a milder
  // form, and one RLS alone would allow since both rows are visible to them.
  const { data: aliasRow } = await caller.db
    .from("aliases")
    .select("id, ref, hostname, kind")
    .eq("ref", aliasRef)
    .eq("project_id", project.id)
    .maybeSingle();
  if (!aliasRow) return notFound("Alias");

  const { data: deploymentRow } = await caller.db
    .from("deployments")
    .select("id, ref, state, git_sha")
    .eq("ref", deploymentRef)
    .eq("project_id", project.id)
    .maybeSingle();
  if (!deploymentRow) return notFound("Deployment");

  const deployment = deploymentRow as {
    id: string;
    ref: string;
    state: string;
    git_sha: string;
  };

  // Only a deployment that actually built can serve traffic. Pointing a
  // hostname at a queued or errored deployment would take the site down, and
  // the schema does not stop it — this is the guard.
  if (deployment.state !== "ready") {
    return conflict(
      `Deployment ${deployment.ref} is "${deployment.state}", not "ready". ` +
        "Only a deployment that finished building can serve traffic."
    );
  }

  const { data, error } = await caller.db
    .from("aliases")
    .update({ deployment_id: deployment.id })
    .eq("id", (aliasRow as { id: string }).id)
    .select(ALIAS_COLUMNS)
    .maybeSingle();

  if (error) {
    const mapped = fromPostgrestError(error);
    if (mapped) return mapped;
    console.error("[v2/aliases] promote failed:", error);
    return apiError("internal", "Could not update the alias.", 500);
  }
  if (!data) return notFound("Alias");

  // The alias write above is the source of truth and is durable. Convergence
  // is attempted now so the change shows up in seconds rather than at the next
  // loop interval, but failing here is NOT a failed promote: the
  // level-triggered loop re-derives desired state and repairs it.
  let convergeError: string | null = null;
  try {
    await reconcileProjectByRef(project.ref);
  } catch (e) {
    convergeError = (e as Error).message.slice(0, 300);
    console.error("[v2/aliases] converge after promote failed:", e);
  }

  return json({
    alias: toAliasDto(data as AliasRow),
    status: convergeError ? "promoted_converging" : "promoted",
    note: convergeError
      ? "The alias is updated and durable. Applying it to the cluster did not " +
        "succeed on this attempt; the reconciliation loop will finish the job."
      : "Rolling back scales a stopped pod up, so the hostname answers within " +
        "a few seconds rather than immediately.",
  });
}
