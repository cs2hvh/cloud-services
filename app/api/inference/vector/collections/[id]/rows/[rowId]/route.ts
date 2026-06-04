/**
 * GET    /api/inference/vector/collections/[id]/rows/[rowId]
 * DELETE /api/inference/vector/collections/[id]/rows/[rowId]
 */
import { NextRequest, NextResponse } from "next/server";
import { withInferenceAuth } from "@/lib/api/inference-middleware";
import { InferenceVectorService } from "@/lib/services/inference";
import { auditContextFrom } from "@/lib/inference/audit";

function isUuid(s: string) { return /^[0-9a-f-]{36}$/i.test(s); }

export const GET = withInferenceAuth("vec-row-get", { limit: 60 }, async (_req, ctx, routeCtx) => {
  const { id, rowId } = await routeCtx.params as { id: string; rowId: string };
  if (!isUuid(id) || !isUuid(rowId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const result = await InferenceVectorService.getRow(ctx.orgId, id, rowId);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json({ success: true, row: result.data });
});

export const DELETE = withInferenceAuth("vec-row-delete", { limit: 60 }, async (req: NextRequest, ctx, routeCtx) => {
  const { id, rowId } = await routeCtx.params as { id: string; rowId: string };
  if (!isUuid(id) || !isUuid(rowId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  if (ctx.orgRole === "viewer") return NextResponse.json({ error: "Viewers cannot delete rows" }, { status: 403 });

  const result = await InferenceVectorService.deleteRow(ctx.orgId, id, rowId, ctx.userId, auditContextFrom(req));
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json({ success: true, deleted_id: rowId });
});
