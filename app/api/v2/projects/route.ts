/**
 * /api/v2/projects — list and create.
 *
 * Reads and writes go through the RLS-scoped client, so "only my team's
 * projects" is enforced by paas RLS rather than by a filter written here that
 * a future route could forget.
 */

import { getCaller, resolveTeamId, defaultTeamId } from "../_lib/auth";
import {
  json,
  unauthenticated,
  notFound,
  invalid,
  conflict,
  fromPostgrestError,
  apiError,
} from "../_lib/http";
import {
  PROJECT_COLUMNS_WITH_TEAM,
  toProjectDto,
  slugify,
  type ProjectRow,
} from "../_lib/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  const caller = await getCaller();
  if (!caller) return unauthenticated();

  const { data, error } = await caller.db
    .from("projects")
    .select(PROJECT_COLUMNS_WITH_TEAM)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    const mapped = fromPostgrestError(error);
    if (mapped) return mapped;
    console.error("[v2/projects] list failed:", error);
    return apiError("internal", "Could not load projects.", 500);
  }

  return json({ projects: (data as ProjectRow[]).map(toProjectDto) });
}

interface CreateBody {
  name?: unknown;
  team?: unknown;
  provider?: unknown;
  repoId?: unknown;
  repoFullName?: unknown;
  installationId?: unknown;
  productionBranch?: unknown;
  rootDirectory?: unknown;
  framework?: unknown;
}

export async function POST(request: Request) {
  const caller = await getCaller();
  if (!caller) return unauthenticated();

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return invalid("Request body must be JSON.");
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return invalid("A project name is required.", { name: "required" });

  const slug = slugify(name);
  if (!slug) {
    return invalid(
      "Project name must contain at least one letter or number.",
      { name: "unusable" }
    );
  }

  const repoFullName =
    typeof body.repoFullName === "string" ? body.repoFullName.trim() : "";
  const repoId = typeof body.repoId === "string" ? body.repoId.trim() : "";
  if (!repoFullName || !repoId) {
    return invalid("A source repository is required.", {
      repoFullName: repoFullName ? "ok" : "required",
      repoId: repoId ? "ok" : "required",
    });
  }

  // Resolve the target team. An explicit ref the caller cannot see is a 404,
  // not a 403 — probing refs must not confirm which teams exist.
  let teamId: string | null;
  if (typeof body.team === "string" && body.team.trim()) {
    teamId = await resolveTeamId(caller, body.team.trim());
    if (!teamId) return notFound("Team");
  } else {
    teamId = await defaultTeamId(caller);
    if (!teamId) {
      return invalid(
        "Specify which team this project belongs to.",
        { team: "required" }
      );
    }
  }

  const insert = {
    team_id: teamId,
    name,
    slug,
    provider: typeof body.provider === "string" ? body.provider : "github",
    repo_id: repoId,
    repo_full_name: repoFullName,
    installation_id:
      typeof body.installationId === "number" ? body.installationId : null,
    production_branch:
      typeof body.productionBranch === "string" && body.productionBranch.trim()
        ? body.productionBranch.trim()
        : "main",
    root_directory:
      typeof body.rootDirectory === "string" && body.rootDirectory.trim()
        ? body.rootDirectory.trim()
        : null,
    framework: typeof body.framework === "string" ? body.framework : null,
  };

  // `id` is selected here and used only to attach the environment below. It is
  // never serialized — toProjectDto picks named fields, so it cannot leak.
  const { data, error } = await caller.db
    .from("projects")
    .insert(insert)
    .select(`id, ${PROJECT_COLUMNS_WITH_TEAM}`)
    .single();

  if (error) {
    if (error.code === "23505") {
      return conflict(`A project named "${slug}" already exists in this team.`);
    }
    const mapped = fromPostgrestError(error);
    if (mapped) return mapped;
    console.error("[v2/projects] create failed:", error);
    return apiError("internal", "Could not create the project.", 500);
  }

  const project = toProjectDto(data as ProjectRow);

  // Every project needs somewhere to deploy to. Created here rather than by a
  // trigger so the failure is visible to the caller instead of leaving a
  // project that silently cannot deploy.
  const { error: envError } = await caller.db.from("environments").insert({
    project_id: (data as { id: string }).id,
    kind: "production",
    name: "Production",
  });

  if (envError) {
    // The project exists; report it, but do not claim the environment landed.
    console.error("[v2/projects] production environment failed:", envError);
    return json(
      {
        project,
        warning:
          "Project created, but its production environment could not be set up. " +
          "Deployments will fail until it exists.",
      },
      201
    );
  }

  return json({ project }, 201);
}
