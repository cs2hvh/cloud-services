/**
 * GET /api/v2/deployments/[ref] — one deployment, with its project and
 * environment, and which hostnames currently point at it.
 *
 * There is no PATCH or DELETE. paas makes deployments immutable — git_sha and
 * image_digest are write-once, terminal states cannot change — and a route
 * that offered edits would only ever return a trigger error.
 */

import { getCaller } from "../../_lib/auth";
import {
  json,
  unauthenticated,
  notFound,
  fromPostgrestError,
  apiError,
} from "../../_lib/http";
import {
  DEPLOYMENT_COLUMNS_EXPANDED,
  toDeploymentDto,
  type DeploymentRow,
} from "../../_lib/deployments";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ ref: string }> };

export async function GET(_request: Request, { params }: Params) {
  const caller = await getCaller();
  if (!caller) return unauthenticated();
  const { ref } = await params;

  const { data, error } = await caller.db
    .from("deployments")
    .select(`id, ${DEPLOYMENT_COLUMNS_EXPANDED}`)
    .eq("ref", ref)
    .maybeSingle();

  if (error) {
    const mapped = fromPostgrestError(error);
    if (mapped) return mapped;
    console.error("[v2/deployments/:ref] read failed:", error);
    return apiError("internal", "Could not load the deployment.", 500);
  }
  if (!data) return notFound("Deployment");

  const row = data as DeploymentRow & { id: string };

  // Which hostnames serve this deployment right now. This is the honest
  // answer to "is this live?" — state='ready' only means it built, not that
  // anything routes to it. Promote/rollback moves aliases, not deployments.
  const { data: aliasRows, error: aliasError } = await caller.db
    .from("aliases")
    .select("ref, hostname, kind")
    .eq("deployment_id", row.id);

  if (aliasError) {
    console.error("[v2/deployments/:ref] alias lookup failed:", aliasError);
  }

  const aliases = (aliasRows ?? []) as Array<{
    ref: string;
    hostname: string;
    kind: string;
  }>;

  return json({
    deployment: toDeploymentDto(row),
    servedBy: aliases.map((a) => ({
      ref: a.ref,
      hostname: a.hostname,
      kind: a.kind,
      url: `https://${a.hostname}`,
    })),
    isLive: aliases.length > 0,
  });
}
