/**
 * GET    /api/inference/deployments/[id]
 * DELETE /api/inference/deployments/[id]
 */
import { NextRequest, NextResponse } from "next/server";
import { withInferenceAuth } from "@/lib/api/inference-middleware";
import { InferenceDeploymentService } from "@/lib/services/inference";
import { auditContextFrom } from "@/lib/inference/audit";

function isUuid(s: string) { return /^[0-9a-f-]{36}$/i.test(s); }

export const GET = withInferenceAuth("deploy-detail", { limit: 60, bootstrapOrg: true }, async (_req, ctx, routeCtx) => {
  const { id } = await routeCtx.params as { id: string };
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid deployment id" }, { status: 400 });

  const result = await InferenceDeploymentService.get(ctx.orgId, id);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json({ success: true, data: result.data });
});

export const DELETE = withInferenceAuth("deploy-delete", { limit: 10, bootstrapOrg: true }, async (req: NextRequest, ctx, routeCtx) => {
  const { id } = await routeCtx.params as { id: string };
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid deployment id" }, { status: 400 });
  if (ctx.orgRole === "viewer") return NextResponse.json({ error: "Viewers cannot delete deployments" }, { status: 403 });

  const result = await InferenceDeploymentService.delete(ctx.orgId, id, ctx.userId, auditContextFrom(req));
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json({ success: true, ...(result.data.already_deleted ? { already_deleted: true } : {}) });
});
