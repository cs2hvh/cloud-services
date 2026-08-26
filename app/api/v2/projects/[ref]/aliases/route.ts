/**
 * /api/v2/projects/[ref]/aliases
 *
 * GET  — the hostnames this project serves and what each currently points at.
 * PATCH — promote or roll back: ONE update of aliases.deployment_id.
 *
 * Promote and rollback are the same operation in opposite directions, and
 * neither rebuilds anything. The image that is already in the registry is the
 * image that gets served; only the pointer moves. That is why rollback is
 * instant and why it cannot fail the way a rebuild can.
 */

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
    git_sha: string;
    git_ref: string;
    ready_at: string | null;
  } | null;
}

const ALIAS_COLUMNS =
  "ref, hostname, kind, updated_at, " +
  "deployments:deployment_id (ref, state, git_sha, git_ref, ready_at)";

function toAliasDto(row: AliasRow) {
  return {
    ref: row.ref,
    hostname: row.hostname,
    url: `https://${row.hostname}`,
    kind: row.kind,
    updatedAt: row.updated_at,
    serving: row.deployments
      ? {
          ref: row.deployments.ref,
          state: row.deployments.state,
          sha: row.deployments.git_sha,
          shortSha: row.deployments.git_sha.slice(0, 7),
          gitRef: row.deployments.git_ref,
          readyAt: row.deployments.ready_at,
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

  return json({
    alias: toAliasDto(data as AliasRow),
    // Deliberately not "promoted" or "live". The DB pointer has moved; the
    // reconciler in the infrastructure lane is what makes traffic follow it.
    // Until that lands, this call changes intent, not routing.
    status: "alias_updated",
    note:
      "The alias now records this deployment. Traffic follows once the routing " +
      "reconciler applies it.",
  });
}
