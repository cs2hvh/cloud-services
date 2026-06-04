/**
 * POST /api/inference/batches/[id]/cancel
 */
import { NextRequest, NextResponse } from "next/server";
import { withInferenceAuth } from "@/lib/api/inference-middleware";
import { InferenceBatchService } from "@/lib/services/inference";
import { auditContextFrom } from "@/lib/inference/audit";

function isBatchId(s: string) { return /^batch_[a-z0-9]+$/i.test(s); }

export const POST = withInferenceAuth("batch-cancel", { limit: 30 }, async (req: NextRequest, ctx, routeCtx) => {
  const { id } = await routeCtx.params as { id: string };
  if (!isBatchId(id)) return NextResponse.json({ error: "Invalid batch id" }, { status: 400 });
  if (ctx.orgRole === "viewer") return NextResponse.json({ error: "Viewers cannot cancel batches" }, { status: 403 });

  const result = await InferenceBatchService.cancel(ctx.orgId, id, ctx.userId, auditContextFrom(req));
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json(result.data);
});
