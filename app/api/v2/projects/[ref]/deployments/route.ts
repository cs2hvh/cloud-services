/**
 * GET  /api/v2/projects/{ref}/deployments — this project's build history
 * POST /api/v2/projects/{ref}/deployments — deploy it now
 *
 * THE SEAM. The POST only ENQUEUES: it resolves the commit and writes a
 * `queued` row, and the build worker picks it up. It does not build inline, and
 * that is not laziness — a build takes minutes, an HTTP request does not, and a
 * promise left running after a response dies with the process. Anything relying
 * on that works in development and drops builds in production, where the symptom
 * is a deploy that simply never happens with nothing anywhere saying why.
 *
 * It is also the boundary the elevation rule draws: the ENQUEUE is a
 * tenant-scoped write and belongs under RLS, here. The BUILD is privileged and
 * belongs to the worker. A route that did both would be writing paas.deployments
 * with the service role, which boundary.test.ts fails on.
 *
 * THE COMMIT IS RESOLVED FROM GITHUB, not accepted from the caller. A sha in the
 * request body is a sha nobody checked — and it reaches a `git fetch` on a build
 * VM. Resolving it here also means the row records exactly what will be built,
 * rather than "whatever HEAD is by the time a worker gets to it", which is a
 * different commit if someone pushes in between.
 */

import { createClient } from "@/lib/supabase/server";
import { listBranches } from "@/lib/paas/github/client";
import { json, unauthenticated, notFound, invalid, conflict, apiError } from "../../../_lib/http";
import { affordability, shouldRefuse } from "../../../_lib/afford";
import { requireTier, hourlyRateUsd, clampInstances } from "@/lib/paas/tiers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Ctx = { params: Promise<{ ref: string }> };

/** Refs are `prj-` plus hex. Shape-checked before it reaches a query. */
const PROJECT_REF = /^prj-[0-9a-f]{12}$/;

async function resolveProject(supabase: Awaited<ReturnType<typeof createClient>>, ref: string) {
  return supabase
    .schema("paas")
    .from("projects")
    .select("id,ref,repo_full_name,production_branch,installation_id,tier,instance_count,deleted_at")
    .eq("ref", ref)
    .maybeSingle();
}

export async function GET(_req: Request, ctx: Ctx) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return unauthenticated();

  const { ref } = await ctx.params;
  if (!PROJECT_REF.test(ref)) return notFound("Project");

  const project = await resolveProject(supabase, ref);
  if (project.error) {
    console.error("[v2/deployments GET] project read failed:", JSON.stringify(project.error));
    return apiError("internal", "Could not read the project.", 500);
  }
  // RLS makes another team's project invisible, so this is both "no such
  // project" and "not yours" — deliberately indistinguishable.
  if (!project.data || project.data.deleted_at) return notFound("Project");

  const { data, error } = await supabase
    .schema("paas")
    .from("deployments")
    .select("ref,state,trigger,git_sha,git_ref,git_message,queued_at,ready_at,error_message")
    .eq("project_id", project.data.id)
    .order("queued_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[v2/deployments GET] read failed:", JSON.stringify(error));
    return apiError("internal", "Could not read deployments.", 500);
  }

  return json({
    deployments: (data ?? []).map((d) => ({
      ref: d.ref,
      state: d.state,
      trigger: d.trigger,
      sha: d.git_sha,
      shortSha: d.git_sha ? String(d.git_sha).slice(0, 7) : null,
      branch: d.git_ref,
      message: d.git_message,
      queuedAt: d.queued_at,
      readyAt: d.ready_at,
      error: d.error_message ?? null,
    })),
  });
}

export async function POST(req: Request, ctx: Ctx) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return unauthenticated();

  const { ref } = await ctx.params;
  if (!PROJECT_REF.test(ref)) return notFound("Project");

  const project = await resolveProject(supabase, ref);
  if (project.error) {
    console.error("[v2/deployments POST] project read failed:", JSON.stringify(project.error));
    return apiError("internal", "Could not read the project.", 500);
  }
  if (!project.data || project.data.deleted_at) return notFound("Project");
  const p = project.data;

  let body: Record<string, unknown> = {};
  try {
    body = ((await req.json()) ?? {}) as Record<string, unknown>;
  } catch {
    // An empty body is the normal case for "deploy the production branch".
    body = {};
  }

  const branch =
    typeof body.branch === "string" && body.branch.trim() ? body.branch.trim() : p.production_branch;
  if (/\s/.test(branch) || branch.length > 255) return invalid("That branch name is not valid.");

  if (!p.installation_id) {
    return invalid("This project has no GitHub connection. Reconnect GitHub and try again.");
  }

  // Resolve the head of that branch through OUR installation. Also the check
  // that the branch exists at all — a deploy of a typo'd branch should fail
  // here, in milliseconds, not on a build VM three minutes later.
  let sha: string | null = null;
  try {
    const branches = await listBranches(Number(p.installation_id), p.repo_full_name);
    sha = branches.find((b) => b.name === branch)?.commit?.sha ?? null;
  } catch (e) {
    console.error("[v2/deployments POST] github failed:", (e as Error).message);
    return apiError("upstream_error", "Could not reach GitHub to resolve that branch.", 502);
  }
  if (!sha) return invalid(`Branch "${branch}" does not exist in ${p.repo_full_name}.`);

  const db = supabase.schema("paas");

  // CAN THEY AFFORD IT? Asked before a build VM is leased, because refusing at
  // this point costs nothing and refusing after a build has run costs a build.
  // The same check guards the trigger route and the webhook — one balance rule
  // for three doors, so a new door cannot quietly skip it.
  let hourly = 0;
  try {
    hourly = hourlyRateUsd(requireTier(p.tier), clampInstances(p.instance_count ?? 1));
  } catch {
    // Unpriceable is not free. An unknown tier means nobody can say what this
    // costs, and deploying it anyway is how a mispriced app runs indefinitely.
    return apiError("internal", `This project has an unknown plan ("${p.tier}") and cannot be priced.`, 500);
  }

  const afford = await affordability(db, p.id, hourly);
  if (shouldRefuse(afford)) {
    return apiError("invalid_request", afford.reason, 402, { billing: afford.state });
  }

  // Environment by KIND for production, by branch name for anything else — the
  // same rule the webhook uses, so a manual deploy of a feature branch lands in
  // the same preview environment a push would.
  const isProduction = branch === p.production_branch;
  const envName = isProduction ? "production" : branch;

  const existingEnv = await db
    .from("environments")
    .select("id,kind,name")
    .eq("project_id", p.id)
    .eq("name", envName)
    .maybeSingle();

  let environmentId = existingEnv.data?.id ?? null;
  if (!environmentId) {
    const createdEnv = await db
      .from("environments")
      .insert({ project_id: p.id, kind: isProduction ? "production" : "preview", name: envName })
      .select("id")
      .single();
    if (createdEnv.error) {
      console.error("[v2/deployments POST] environment insert failed:", JSON.stringify(createdEnv.error));
      return apiError("internal", "Could not prepare the environment.", 500);
    }
    environmentId = createdEnv.data.id;
  }

  // Idempotency, keyed on (environment, sha) — NOT (project, sha). A branch cut
  // from the production head carries a commit that is already deployed, and the
  // project-wide key answers "already recorded" for it, which silently
  // suppresses the deploy.
  const already = await db
    .from("deployments")
    .select("ref,state")
    .eq("environment_id", environmentId)
    .eq("git_sha", sha)
    .in("state", ["queued", "building", "publishing"])
    .maybeSingle();

  if (already.data) {
    return conflict(`That commit is already ${already.data.state} as ${already.data.ref}.`);
  }

  const { data: created, error: writeError } = await db
    .from("deployments")
    .insert({
      project_id: p.id,
      environment_id: environmentId,
      trigger: "manual",
      git_sha: sha,
      git_ref: branch,
      git_message: `Deployed from the dashboard by ${user.email ?? user.id}`,
    })
    .select("ref,state,git_sha,git_ref,queued_at")
    .single();

  if (writeError) {
    console.error("[v2/deployments POST] insert failed:", JSON.stringify(writeError));
    return apiError("internal", "Could not queue the deployment.", 500);
  }

  return json(
    {
      deployment: {
        ref: created.ref,
        state: created.state,
        sha: created.git_sha,
        shortSha: String(created.git_sha).slice(0, 7),
        branch: created.git_ref,
        queuedAt: created.queued_at,
      },
      // Said plainly rather than implied by a 202: the row exists and a worker
      // has to pick it up. If no worker is running, nothing will happen and the
      // deployment will sit in `queued` — which is visible, unlike a lost build.
      note: "Queued. A build worker will pick this up.",
    },
    202,
  );
}
