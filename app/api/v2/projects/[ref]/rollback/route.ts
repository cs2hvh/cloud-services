/**
 * POST /api/v2/projects/{ref}/rollback — put a previous deployment back in
 * front of the whole live site.
 *
 * WHY THIS EXISTS ALONGSIDE PATCH /aliases. That route repoints ONE alias, and
 * that is the right contract for pinning a single custom domain. It is the
 * wrong one for a rollback: a project's production and custom aliases are the
 * same live site, so moving only production leaves every custom domain serving
 * the version you just decided was broken. The dashboard rolled back
 * `v2-docker.ahurasense.com` and left `app.ahurasense.ai` behind, and nothing
 * reported a problem because each alias was individually consistent.
 *
 * THE WRITE IS ONE RPC, not three statements from here. Waking the target and
 * repointing the aliases must not come apart: between them the site is either
 * pointing at a sleeping deployment (502) or awake and unrouted. A failed
 * second call from a route would leave the first applied — an outage created
 * while ending one. `paas.rollback_project` does both atomically, re-checks
 * membership itself, and is the only path allowed to clear scaled_to_zero_at,
 * which no tenant may write.
 *
 * THE ONE CHECK THE DATABASE CANNOT DO is whether the image still exists. The
 * row records the digest that was published, not that the blob survived. That
 * question is asked here, against the registry, before anything is written.
 */

import { getCaller } from "../../../_lib/auth";
import { json, unauthenticated, notFound, invalid, conflict, apiError } from "../../../_lib/http";
import { assessRollback } from "@/lib/paas/rollback";
import { toCustomerFacing } from "@/lib/paas/errors";
import { imagePresence } from "@/lib/paas/registry";
import { reconcileProjectByRef, kubeContextFromEnv } from "@/lib/paas/reconciler.ts";
import { kube } from "@/lib/paas/k8s/client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Params = { params: Promise<{ ref: string }> };
const PROJECT_REF = /^prj-[0-9a-f]{12}$/;
const DEPLOYMENT_REF = /^dpl-[0-9a-f]{12}$/;

export async function POST(request: Request, { params }: Params) {
  const caller = await getCaller();
  if (!caller) return unauthenticated();

  const { ref } = await params;
  if (!PROJECT_REF.test(ref)) return notFound("Project");

  let body: { deployment?: unknown };
  try {
    body = (await request.json()) as { deployment?: unknown };
  } catch {
    return invalid("Request body must be JSON.");
  }

  const deploymentRef = typeof body.deployment === "string" ? body.deployment.trim() : "";
  if (!DEPLOYMENT_REF.test(deploymentRef)) {
    return invalid("`deployment` is required and must be a deployment ref.", { deployment: "required" });
  }

  const { data: project } = await caller.db
    .from("projects")
    .select("id, ref, name")
    .eq("ref", ref)
    .is("deleted_at", null)
    .maybeSingle();
  if (!project) return notFound("Project");

  // Scoped to the project in the same query. A ref from another project must
  // read as absent rather than as a different refusal — two distinguishable
  // errors let a caller enumerate which refs are real, and the real ones belong
  // to other tenants.
  const { data: target } = await caller.db
    .from("deployments")
    .select("id,ref,project_id,environment_id,state,image_repo,image_digest,scaled_to_zero_at,git_sha,git_ref")
    .eq("ref", deploymentRef)
    .eq("project_id", project.id)
    .maybeSingle();

  const { data: prodEnv } = await caller.db
    .from("environments")
    .select("id")
    .eq("project_id", project.id)
    .eq("kind", "production")
    .maybeSingle();

  const { data: prodAlias } = await caller.db
    .from("aliases")
    .select("deployment_id")
    .eq("project_id", project.id)
    .eq("kind", "production")
    .maybeSingle();

  const decision = assessRollback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (target ?? null) as any,
    { id: project.id },
    (prodAlias?.deployment_id as string | null) ?? null,
    Boolean(target && prodEnv && target.environment_id === prodEnv.id),
  );

  if (decision.action === "refuse") {
    // `wrong-project` is deliberately a 404 and everything else a 409: the
    // first must not confirm the deployment exists, the rest are about a
    // deployment the caller can already see.
    return decision.code === "wrong-project" ? notFound("Deployment") : conflict(decision.reason);
  }

  if (decision.action === "noop") {
    return json({ ok: true, changed: false, deployment: deploymentRef, note: decision.reason });
  }

  // Asked BEFORE the write. Repointing at a digest the registry no longer has
  // is ImagePullBackOff: the rollback reports success, the running pods are
  // replaced, and the site goes down — on someone already handling an incident.
  let imageNote: string | null = null;
  try {
    const k = kube(kubeContextFromEnv());
    const presence = await imagePresence(k, target!.image_repo ?? project.ref, target!.image_digest ?? "");
    if (presence.presence === "absent") {
      return conflict(
        `The image for ${deploymentRef} is no longer in the registry, so rolling back to it would ` +
          `replace a working site with a pod that cannot start. Choose a deployment whose image still exists.`,
      );
    }
    if (presence.presence === "unknown") {
      // NOT a refusal. An unreachable registry is not a missing image, and
      // blocking here would prevent a rollback exactly when the cluster is
      // unhealthy — which is when rollback is for. Reported instead.
      imageNote = "Could not confirm the image exists; the registry did not answer.";
    }
  } catch (e) {
    // Why we could not check is our business — a registry that did not
    // answer, a credential that expired. That we could not check is theirs.
    toCustomerFacing(e, "read", "[v2/rollback]");
    imageNote = "We could not confirm this build is still available. The rollback was applied anyway.";
  }

  // Wake and repoint, atomically, as one authorized write.
  const { data: result, error } = await caller.db.rpc("rollback_project", {
    p_project_ref: project.ref,
    p_deployment_ref: deploymentRef,
  });

  if (error) {
    // The RPC re-checks everything above. Reaching here means the two
    // disagreed, which is worth a log line rather than a silent 500.
    console.error("[v2/rollback] rollback_project failed:", JSON.stringify(error));
    if (error.code === "42501") return apiError("conflict", "You do not have permission to roll back this project.", 403);
    return apiError("internal", "Could not roll back.", 500);
  }

  // The alias write above is durable and is the source of truth. Convergence is
  // attempted now so the change lands in seconds; a failure here is NOT a
  // failed rollback, and saying so stops an operator repeating a write that
  // already succeeded.
  let convergeError: string | null = null;
  try {
    await reconcileProjectByRef(project.ref);
  } catch (e) {
    // A failure here is NOT a failed rollback — the alias write already
    // succeeded and is the source of truth.
    convergeError = toCustomerFacing(e, "deploy", "[v2/rollback]").message;
  }

  return json({
    ok: true,
    changed: true,
    project: project.ref,
    deployment: deploymentRef,
    result,
    converged: convergeError === null,
    convergeError,
    imageNote,
  });
}
