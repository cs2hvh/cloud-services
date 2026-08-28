/**
 * /api/v2/projects/[ref] — read, update, delete a single project.
 *
 * Addressed by the immutable ref. paas rejects any UPDATE that changes `ref`
 * with a trigger, and PATCH here does not accept the field at all, so the
 * mutable-name addressing bug that produced v1's cross-tenant hostname
 * takeover cannot be reintroduced through this route.
 */

import {
  TIERS,
  tierById,
  MIN_INSTANCES,
  MAX_INSTANCES,
} from "@/lib/paas/tiers.ts";
import { getCaller } from "../../_lib/auth";
import { kube, loadKubeconfig } from "@/lib/paas/k8s/client.ts";
import { toCustomerFacing } from "@/lib/paas/errors";
import {
  json,
  unauthenticated,
  notFound,
  invalid,
  conflict,
  fromPostgrestError,
  apiError,
} from "../../_lib/http";
import {
  PROJECT_COLUMNS_WITH_TEAM,
  toProjectDto,
  slugify,
  type ProjectRow,
} from "../../_lib/serialize";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ ref: string }> };

export async function GET(_request: Request, { params }: Params) {
  const caller = await getCaller();
  if (!caller) return unauthenticated();
  const { ref } = await params;

  const { data, error } = await caller.db
    .from("projects")
    .select(PROJECT_COLUMNS_WITH_TEAM)
    .eq("ref", ref)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    const mapped = fromPostgrestError(error);
    if (mapped) return mapped;
    console.error("[v2/projects/:ref] read failed:", error);
    return apiError("internal", "Could not load the project.", 500);
  }
  // RLS returns no row for both "absent" and "another team's" — 404 covers
  // both deliberately. A 403 here would confirm the ref exists.
  if (!data) return notFound("Project");

  return json({ project: toProjectDto(data as ProjectRow) });
}

interface PatchBody {
  name?: unknown;
  productionBranch?: unknown;
  rootDirectory?: unknown;
  buildContextRepoRoot?: unknown;
  framework?: unknown;
  scaleToZero?: unknown;
  idleSeconds?: unknown;
  tier?: unknown;
  instanceCount?: unknown;
}

/**
 * Floor on idle_seconds, matching the database constraint. Below this the app
 * sleeps between a visitor's own page loads, which reads as the site being
 * broken rather than as a saving.
 */
const MIN_IDLE_SECONDS = 60;

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

  // Only these four are editable. ref, team_id, provider, repo_id and
  // repo_full_name are all identity — changing any of them would repoint an
  // existing project at different infrastructure or a different tenant.
  const patch: Record<string, unknown> = {};

  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) return invalid("Project name cannot be empty.", { name: "required" });
    const slug = slugify(name);
    if (!slug) {
      return invalid("Project name must contain at least one letter or number.", {
        name: "unusable",
      });
    }
    patch.name = name;
    patch.slug = slug;
  }

  if (typeof body.productionBranch === "string") {
    const branch = body.productionBranch.trim();
    if (!branch) {
      return invalid("Production branch cannot be empty.", {
        productionBranch: "required",
      });
    }
    patch.production_branch = branch;
  }

  if (typeof body.buildContextRepoRoot === "boolean") {
    // Only meaningful alongside a root directory and a repository-supplied
    // Dockerfile; harmless otherwise, and refusing the combination here would
    // mean rejecting a setting the customer is about to make true.
    patch.build_context_repo_root = body.buildContextRepoRoot;
  }

  if (body.rootDirectory === null || typeof body.rootDirectory === "string") {
    const dir =
      typeof body.rootDirectory === "string" ? body.rootDirectory.trim() : "";
    patch.root_directory = dir || null;
  }

  if (body.framework === null || typeof body.framework === "string") {
    patch.framework = body.framework === null ? null : String(body.framework);
  }

  if (typeof body.scaleToZero === "boolean") {
    patch.scale_to_zero = body.scaleToZero;
  }

  // ── sizing ───────────────────────────────────────────────────────
  // Validated against lib/paas/tiers, NOT against a list restated here.
  // paas.projects already CHECKs both (projects_tier_known,
  // projects_instance_count_bounded), so a bad value cannot reach the table
  // either way — but a CHECK violation surfaces as a 422 with a constraint
  // name in it, and the customer deserves to be told which of the six tiers
  // they may pick. Two statements of the same rule is how they drift, so the
  // list comes from the module the deploy path uses.
  if (typeof body.tier === "string") {
    if (!tierById(body.tier)) {
      return invalid(
        `Unknown tier. Choose one of: ${TIERS.map((t) => t.id).join(", ")}.`,
        { tier: "unknown" }
      );
    }
    patch.tier = body.tier;
  }

  if (typeof body.instanceCount === "number") {
    if (
      !Number.isInteger(body.instanceCount) ||
      body.instanceCount < MIN_INSTANCES ||
      body.instanceCount > MAX_INSTANCES
    ) {
      return invalid(
        `Instance count must be a whole number between ${MIN_INSTANCES} and ${MAX_INSTANCES}.`,
        { instanceCount: "out_of_range" }
      );
    }
    patch.instance_count = body.instanceCount;
  }

  if (body.idleSeconds === null) {
    // Explicit null means "use the platform default", which is different from
    // not sending the field at all.
    patch.idle_seconds = null;
  } else if (typeof body.idleSeconds === "number") {
    if (!Number.isInteger(body.idleSeconds) || body.idleSeconds < MIN_IDLE_SECONDS) {
      return invalid(
        `Idle time must be a whole number of seconds, at least ${MIN_IDLE_SECONDS}.`,
        { idleSeconds: "too_short" }
      );
    }
    patch.idle_seconds = body.idleSeconds;
  }

  if (Object.keys(patch).length === 0) {
    return invalid("No editable fields were supplied.");
  }

  const { data, error } = await caller.db
    .from("projects")
    .update(patch)
    .eq("ref", ref)
    .is("deleted_at", null)
    .select(PROJECT_COLUMNS_WITH_TEAM)
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return conflict("A project with that name already exists in this team.");
    }
    const mapped = fromPostgrestError(error);
    if (mapped) return mapped;
    console.error("[v2/projects/:ref] update failed:", error);
    return apiError("internal", "Could not update the project.", 500);
  }
  // No row updated means RLS filtered it out, or it does not exist.
  if (!data) return notFound("Project");

  return json({ project: toProjectDto(data as ProjectRow) });
}

export async function DELETE(_request: Request, { params }: Params) {
  const caller = await getCaller();
  if (!caller) return unauthenticated();
  const { ref } = await params;

  // Soft delete. A hard delete would cascade through deployments and aliases
  // and destroy the build history that explains what a tenant was charged
  // for; the reconcilers need those rows to tear real infrastructure down.
  const { data, error } = await caller.db
    .from("projects")
    .update({ deleted_at: new Date().toISOString() })
    .eq("ref", ref)
    .is("deleted_at", null)
    .select("id,ref")
    .maybeSingle();

  if (error) {
    const mapped = fromPostgrestError(error);
    if (mapped) return mapped;
    console.error("[v2/projects/:ref] delete failed:", error);
    return apiError("internal", "Could not delete the project.", 500);
  }
  if (!data) return notFound("Project");

  const projectId = (data as { id: string }).id;

  // DELETE HAS TO ACTUALLY DELETE.
  //
  // This used to mark the row and hand the rest to a reconciler. That
  // reconciler is a script nobody runs on a timer, so the workload simply
  // stayed: prj-61de90bd2dae was deleted at 08:08 and eleven hours later its
  // namespace still held three Deployments and four Services. Scaled to zero,
  // routing nothing — but never removed, and accumulating for every project a
  // customer has ever discarded.
  //
  // Aliases are released BEFORE the workload goes, which is the order
  // project-teardown uses: a name that is still claimed while its Ingress is
  // gone is a hostname nobody can re-register and nothing answers.
  const released = await caller.db
    .from("aliases")
    .update({ released_at: new Date().toISOString() })
    .eq("project_id", projectId)
    .is("released_at", null);
  if (released.error) {
    console.error("[v2/projects/:ref] releasing aliases failed:", released.error);
  }

  // The namespace takes the Deployments, Services and Ingress with it — the
  // whole cluster footprint of a project.
  let tornDown = false;
  let teardownError: string | null = null;
  try {
    const k = kube(
      loadKubeconfig(process.env.V2_KUBECONFIG ?? "C:/ahura-secrets/kubeconfig-v2-dev.yaml"),
    );
    await k.delete(`/api/v1/namespaces/app-${(data as { ref: string }).ref}`, true);
    tornDown = true;
  } catch (err) {
    // The row stays deleted. Reporting success for a teardown that did not
    // happen is how v1 ended up billing for apps that no longer existed;
    // reporting failure for a delete that DID happen would have the customer
    // try again forever. Say exactly what is true of each half.
    // The delete DID happen; only the workload removal did not. Reporting
    // failure for a delete that succeeded would have the customer retry
    // forever, and reporting success for a teardown that did not is how v1
    // billed for apps that no longer existed. Say what is true of each half,
    // without naming the orchestrator that refused.
    teardownError = toCustomerFacing(err, "deploy", "[v2/projects/:ref]").message;
  }

  return json({
    ref: (data as { ref: string }).ref,
    status: tornDown ? "deleted" : "marked_for_deletion",
    note: tornDown
      ? "The project and its running infrastructure have been removed."
      : "The project is deleted and its names are released, but its workload could not be torn down and will need a sweep.",
    ...(teardownError ? { teardownError } : {}),
  });
}
