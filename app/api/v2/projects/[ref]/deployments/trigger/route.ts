/**
 * POST /api/v2/projects/[ref]/deployments/trigger — redeploy on demand.
 *
 * This route deliberately did not exist until there was a builder. An endpoint
 * that accepts a trigger and cannot build reports success for nothing, which
 * is worse than a missing button.
 *
 * THE SPLIT, and it is the elevation rule again:
 *
 *   this route  — creates the deployment row through the RLS client, so
 *                 Postgres decides whether this caller may deploy this project
 *   deploy.ts   — acceptQueuedDeployment(ref) validates and the worker builds
 *
 * The infrastructure lane never decides who may deploy, and this route never
 * writes as the platform. A single function doing both the enqueue and the
 * build would have meant a request handler writing paas.deployments with the
 * service role — which lib/paas/boundary.test.ts now fails on.
 *
 * acceptQueuedDeployment refuses anything not in `queued`, which is what stops
 * a double-click, a retry and the worker from all building one deployment. It
 * returns a reason rather than throwing so the caller can say what happened.
 */

import { acceptQueuedDeployment } from "@/lib/paas/deploy.ts";
import { getCaller } from "../../../../_lib/auth";
import {
  json,
  unauthenticated,
  notFound,
  invalid,
  conflict,
  fromPostgrestError,
  apiError,
} from "../../../../_lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ ref: string }> };

/** A git ref reaches a clone command. v1 shipped a traversal of this shape. */
const GIT_REF = /^[A-Za-z0-9._\-\/]{1,255}$/;

export async function POST(request: Request, { params }: Params) {
  const caller = await getCaller();
  if (!caller) return unauthenticated();
  const { ref } = await params;

  let body: { gitRef?: unknown } = {};
  try {
    body = (await request.json()) as { gitRef?: unknown };
  } catch {
    // An empty body is fine — redeploy the production branch.
  }

  const { data: projectRow, error: projectError } = await caller.db
    .from("projects")
    .select("id, ref, production_branch, installation_id")
    .eq("ref", ref)
    .is("deleted_at", null)
    .maybeSingle();

  if (projectError) {
    const mapped = fromPostgrestError(projectError);
    if (mapped) return mapped;
    console.error("[v2/trigger] project lookup failed:", projectError);
    return apiError("internal", "Could not load the project.", 500);
  }
  if (!projectRow) return notFound("Project");

  const project = projectRow as {
    id: string;
    ref: string;
    production_branch: string;
    installation_id: number | null;
  };

  if (project.installation_id === null) {
    // Nothing can clone this repo. Say so rather than queueing a build that
    // will fail thirty seconds later for a reason the user cannot see.
    return conflict(
      "This project has no GitHub App installation, so its repository cannot be cloned."
    );
  }

  const gitRef =
    typeof body.gitRef === "string" && body.gitRef.trim()
      ? body.gitRef.trim()
      : project.production_branch;

  if (!GIT_REF.test(gitRef) || gitRef.includes("..")) {
    return invalid("Malformed git ref.", { gitRef: "malformed" });
  }

  // The production environment is where a manual redeploy lands. A project
  // without one cannot deploy at all, and that is worth saying plainly.
  const { data: envRow } = await caller.db
    .from("environments")
    .select("id")
    .eq("project_id", project.id)
    .eq("kind", "production")
    .maybeSingle();

  if (!envRow) {
    return conflict(
      "This project has no production environment, so there is nowhere to deploy."
    );
  }

  // Created through RLS: Postgres decides whether this caller may write it.
  // git_sha is left null rather than invented — the build resolves the real
  // commit and records it, and a placeholder here would put another
  // undistinguishable row in the deployment list.
  const { data: created, error: createError } = await caller.db
    .from("deployments")
    .insert({
      project_id: project.id,
      environment_id: (envRow as { id: string }).id,
      state: "queued",
      trigger: "redeploy",
      created_by: caller.userId,
      git_ref: gitRef,
      git_sha: null,
    })
    .select("ref")
    .single();

  if (createError) {
    const mapped = fromPostgrestError(createError);
    if (mapped) return mapped;
    console.error("[v2/trigger] create failed:", createError);
    return apiError("internal", "Could not queue the deployment.", 500);
  }

  const deploymentRef = (created as { ref: string }).ref;

  // Hand it over. The row is already durable, so a refusal here is not a lost
  // deployment — it is a queued one nobody picked up, which is visible.
  let accepted: Awaited<ReturnType<typeof acceptQueuedDeployment>>;
  try {
    accepted = await acceptQueuedDeployment(deploymentRef);
  } catch (err) {
    console.error("[v2/trigger] handoff failed:", err);
    return json(
      {
        deployment: { ref: deploymentRef, gitRef },
        status: "queued_not_accepted",
        note:
          "The deployment is recorded but the builder could not be reached. " +
          "It stays queued rather than being lost.",
      },
      202
    );
  }

  return json(
    {
      deployment: { ref: deploymentRef, gitRef },
      status: accepted.accepted ? "building" : "queued_not_accepted",
      // The real reason, not a generic failure — a refusal is usually "already
      // building", which is the double-click guard working.
      ...(accepted.accepted ? {} : { note: accepted.reason }),
    },
    202
  );
}
