/**
 * GET    /api/inference/batches/[id]
 * DELETE /api/inference/batches/[id] — soft delete (terminal status only)
 */
import { NextResponse } from "next/server";
import { withInferenceAuth } from "@/lib/api/inference-middleware";
import { InferenceBatchService } from "@/lib/services/inference";

function isBatchId(s: string) { return /^batch_[a-z0-9]+$/i.test(s); }

export const GET = withInferenceAuth("batches-get", { limit: 60 }, async (_req, ctx, routeCtx) => {
  const { id } = await routeCtx.params as { id: string };
  if (!isBatchId(id)) return NextResponse.json({ error: "Invalid batch id" }, { status: 400 });

  const result = await InferenceBatchService.get(ctx.orgId, id);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json(result.data);
});

export const DELETE = withInferenceAuth("batches-delete", { limit: 30 }, async (_req, ctx, routeCtx) => {
  const { id } = await routeCtx.params as { id: string };
  if (!isBatchId(id)) return NextResponse.json({ error: "Invalid batch id" }, { status: 400 });
  if (ctx.orgRole !== "owner" && ctx.orgRole !== "admin") {
    return NextResponse.json({ error: "Only owners/admins can delete batches" }, { status: 403 });
  }

  const result = await InferenceBatchService.softDelete(ctx.orgId, id);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json(result.data);
});
