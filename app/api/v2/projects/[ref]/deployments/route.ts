/**
 * GET /api/v2/projects/[ref]/deployments — deployment history for one project.
 *
 * Read-only. Triggering a deployment is not here: it needs the builder, which
 * lives in the other lane, and an endpoint that accepts a trigger but cannot
 * actually build would report success for nothing.
 */

import { getCaller } from "../../../_lib/auth";
import {
  json,
  unauthenticated,
  notFound,
  invalid,
  fromPostgrestError,
  apiError,
} from "../../../_lib/http";
import {
  DEPLOYMENT_COLUMNS,
  toDeploymentDto,
  type DeploymentRow,
} from "../../../_lib/deployments";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ ref: string }> };

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

export async function GET(request: Request, { params }: Params) {
  const caller = await getCaller();
  if (!caller) return unauthenticated();
  const { ref } = await params;

  const url = new URL(request.url);
  const rawLimit = url.searchParams.get("limit");
  const limit = rawLimit
    ? Math.min(Math.max(Number(rawLimit) || DEFAULT_LIMIT, 1), MAX_LIMIT)
    : DEFAULT_LIMIT;
  const before = url.searchParams.get("before");
  const state = url.searchParams.get("state");

  // Resolve the project first so an unknown ref is a clean 404 rather than an
  // empty deployment list, which would read as "this project has no
  // deployments" for a project the caller cannot see.
  const { data: project, error: projectError } = await caller.db
    .from("projects")
    .select("id, ref, name")
    .eq("ref", ref)
    .is("deleted_at", null)
    .maybeSingle();

  if (projectError) {
    const mapped = fromPostgrestError(projectError);
    if (mapped) return mapped;
    console.error("[v2/deployments] project lookup failed:", projectError);
    return apiError("internal", "Could not load the project.", 500);
  }
  if (!project) return notFound("Project");

  let query = caller.db
    .from("deployments")
    .select(DEPLOYMENT_COLUMNS)
    .eq("project_id", (project as { id: string }).id)
    .order("queued_at", { ascending: false })
    .limit(limit + 1); // one extra row tells us whether more exist

  if (state) {
    const allowed = [
      "queued",
      "building",
      "publishing",
      "ready",
      "error",
      "canceled",
    ];
    if (!allowed.includes(state)) {
      return invalid(`Unknown state "${state}".`, { state: "invalid" });
    }
    query = query.eq("state", state);
  }

  if (before) {
    const when = new Date(before);
    if (Number.isNaN(when.getTime())) {
      return invalid("`before` must be an ISO timestamp.", { before: "invalid" });
    }
    query = query.lt("queued_at", when.toISOString());
  }

  const { data, error } = await query;

  if (error) {
    const mapped = fromPostgrestError(error);
    if (mapped) return mapped;
    console.error("[v2/deployments] list failed:", error);
    return apiError("internal", "Could not load deployments.", 500);
  }

  const rows = data as DeploymentRow[];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return json({
    project: {
      ref: (project as { ref: string }).ref,
      name: (project as { name: string }).name,
    },
    deployments: page.map(toDeploymentDto),
    // Keyset, not offset: deployments are appended constantly and an offset
    // page would silently skip or repeat rows as new ones arrive.
    nextCursor: hasMore ? page[page.length - 1].queued_at : null,
  });
}
