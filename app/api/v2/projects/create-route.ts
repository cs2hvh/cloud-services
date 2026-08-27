/**
 * The POST half of /api/v2/projects. Kept beside the GET rather than inside it
 * so each is readable on its own; `route.ts` re-exports this as its POST.
 */

import { createClient } from "@/lib/supabase/server";
import { json, unauthenticated, invalid, conflict, apiError, fromPostgrestError } from "../_lib/http";
import { validateCreateProject } from "./create";

export async function createProject(req: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return unauthenticated();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return invalid("Body is not JSON.");
  }

  const check = validateCreateProject((body ?? {}) as Record<string, unknown>);
  if (!check.ok) return invalid(check.message, check.fields);
  const plan = check.plan;

  const db = supabase.schema("paas");

  // The account. Idempotent, and the same call every dashboard page makes.
  const { data: team, error: teamError } = await db
    .rpc("bootstrap_personal_team")
    .single<{ id: string; ref: string }>();
  if (teamError || !team) {
    console.error("[v2/projects POST] bootstrap failed:", JSON.stringify(teamError));
    return apiError("internal", "Could not load your account. Nothing has been created.", 500);
  }

  // THE INSTALLATION MUST BE ONE OF THEIRS. RLS answers this — the row is
  // invisible unless the caller's team holds it — so a caller naming a stranger's
  // installation id gets "not found" rather than deploy access to their
  // repositories. Checked here rather than trusted from the body, because this
  // id is what later mints a GitHub token.
  const { data: install, error: installError } = await db
    .from("installations")
    .select("installation_id,account_login,deleted_at")
    .eq("installation_id", plan.installationId)
    .maybeSingle();

  if (installError) {
    console.error("[v2/projects POST] installation read failed:", JSON.stringify(installError));
    return apiError("internal", "Could not verify your GitHub connection.", 500);
  }
  if (!install || install.deleted_at) {
    return invalid("That GitHub connection is not available to your account.", { installationId: "unknown" });
  }

  const { data: created, error: writeError } = await db
    .from("projects")
    .insert({
      team_id: team.id,
      name: plan.name,
      slug: plan.slug,
      provider: "github",
      repo_id: plan.repoFullName,
      repo_full_name: plan.repoFullName,
      installation_id: plan.installationId,
      production_branch: plan.productionBranch,
      root_directory: plan.rootDirectory,
      tier: plan.tier,
      instance_count: plan.instances,
    })
    .select("id,ref,name,slug,repo_full_name,production_branch,tier,instance_count")
    .single();

  if (writeError) {
    // A duplicate slug within the team is the common one, and it is a real
    // conflict rather than an error: two projects would fight over one hostname.
    if (writeError.code === "23505") {
      return conflict(`You already have a project named "${plan.slug}".`);
    }
    const translated = fromPostgrestError(writeError);
    if (translated) return translated;
    console.error("[v2/projects POST] insert failed:", JSON.stringify(writeError));
    return apiError("internal", "Could not create the project.", 500);
  }

  // The production environment, created with the project rather than lazily at
  // first deploy. A project whose environment appears only on success means a
  // failed first build leaves a project that cannot be retried.
  const { error: envError } = await db.from("environments").insert({
    project_id: created.id,
    kind: "production",
    name: "production",
  });
  // Reported, not fatal: the deploy path creates it if missing, so a project
  // without one still works. Saying nothing would hide a schema problem that
  // shows up much later as a confusing deploy failure.
  if (envError && envError.code !== "23505") {
    console.warn("[v2/projects POST] environment not created:", JSON.stringify(envError));
  }

  // `id` is internal — refs are the public identifier everywhere else in this
  // API, and leaking a uuid invites callers to start addressing rows by it.
  const { id: _internal, ...publicView } = created;
  return json({ project: publicView }, 201);
}
