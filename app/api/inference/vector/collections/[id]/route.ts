/**
 * GET    /api/inference/vector/collections/[id]
 * DELETE /api/inference/vector/collections/[id]
 */
import { NextRequest, NextResponse } from "next/server";
import { withInferenceAuth } from "@/lib/api/inference-middleware";
import { InferenceVectorService } from "@/lib/services/inference";
import { auditContextFrom } from "@/lib/inference/audit";

function isUuid(s: string) { return /^[0-9a-f-]{36}$/i.test(s); }

export const GET = withInferenceAuth("vec-detail", { limit: 60 }, async (_req, ctx, routeCtx) => {
  const { id } = await routeCtx.params as { id: string };
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid collection id" }, { status: 400 });

  const result = await InferenceVectorService.get(ctx.orgId, id);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json({ success: true, data: result.data });
});

export const DELETE = withInferenceAuth("vec-delete", { limit: 10 }, async (req: NextRequest, ctx, routeCtx) => {
  const { id } = await routeCtx.params as { id: string };
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid collection id" }, { status: 400 });
  if (ctx.orgRole !== "owner" && ctx.orgRole !== "admin") {
    return NextResponse.json({ error: "Only org owners and admins can delete collections" }, { status: 403 });
  }

  const result = await InferenceVectorService.delete(ctx.orgId, id, ctx.userId, auditContextFrom(req));
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json({ success: true, deleted_id: id });
});
