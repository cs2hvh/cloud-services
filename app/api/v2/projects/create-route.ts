/**
 * The POST half of /api/v2/projects. Kept beside the GET rather than inside it
 * so each is readable on its own; `route.ts` re-exports this as its POST.
 */

import { createClient } from "@/lib/supabase/server";
import { json, unauthenticated, invalid, conflict, apiError, fromPostgrestError } from "../_lib/http";
import { validateCreateProject } from "./create";
import { notifyAppEvent } from "@/lib/paas/notifications";

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

  // THE CONNECTION MUST BE ONE OF THEIRS. RLS answers this — the row is
  // invisible unless the caller's team holds it — so a caller naming a
  // stranger's connection gets "not found" rather than deploy access to their
  // repositories. Checked here rather than trusted from the body, because this
  // is what later selects the credential the build authenticates with.
  //
  // MATCHED ON (provider, external_id), WHICH IS THE PRIMARY KEY. Matching on
  // external_id alone would let a GitLab project numbered 42 satisfy a check
  // meant for GitHub installation 42 — the migration that introduced the
  // composite key called out that exact collision, and a lookup that ignores
  // half the key reintroduces it.
  const { data: install, error: installError } = await db
    .from("installations")
    .select("provider,external_id,account_login,deleted_at")
    .eq("provider", plan.provider)
    .eq("external_id", plan.connectionId)
    .maybeSingle();

  if (installError) {
    console.error("[v2/projects POST] connection read failed:", JSON.stringify(installError));
    return apiError("internal", `Could not verify your ${plan.provider} connection.`, 500);
  }
  if (!install || install.deleted_at) {
    return invalid(`That ${plan.provider} connection is not available to your account.`, {
      connectionId: "unknown",
    });
  }

  const { data: created, error: writeError } = await db
    .from("projects")
    .insert({
      team_id: team.id,
      name: plan.name,
      slug: plan.slug,
      provider: plan.provider,
      repo_id: plan.repoFullName,
      repo_full_name: plan.repoFullName,
      // connection_id is the provider-agnostic identity; installation_id is the
      // deprecated GitHub-only column it replaced, kept in step while it still
      // exists. Null rather than 0 for the other providers, because 0 is a
      // value and this is an absence.
      connection_id: plan.connectionId,
      installation_id: plan.installationId > 0 ? plan.installationId : null,
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
      // Actionable, because the fix is one field away. Deploying the same
      // repository twice is ordinary — a staging copy, or two apps from one
      // monorepo — and the old message read like a refusal with no remedy.
      return conflict(
        `You already have an app called "${plan.slug}". Give this one a different name — ` +
          `the name sets its address, so two apps can share a repository.`,
      );
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
  // Awaited rather than fired off, because a serverless runtime reclaims the
  // process the moment this handler returns — a floating promise here is a mail
  // that sometimes sends. notifyAppEvent never throws, so it cannot turn a
  // created project into a failed request.
  await notifyAppEvent({ projectRef: created.ref as string, event: "created" });

  const { id: _internal, ...publicView } = created;
  return json({ project: publicView }, 201);
}
