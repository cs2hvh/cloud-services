/**
 * GET    /api/inference/fine-tuning/jobs/[id] — job details
 * DELETE /api/inference/fine-tuning/jobs/[id] — cancel job
 */
import { NextRequest, NextResponse } from "next/server";
import { withInferenceAuth } from "@/lib/api/inference-middleware";
import { InferenceFineTuneService } from "@/lib/services/inference";
import { auditContextFrom } from "@/lib/inference/audit";

function isUuid(s: string) { return /^[0-9a-f-]{36}$/i.test(s); }

export const GET = withInferenceAuth("ft-detail", { limit: 60 }, async (_req, ctx, routeCtx) => {
  const { id } = await routeCtx.params as { id: string };
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid job id" }, { status: 400 });

  const result = await InferenceFineTuneService.get(ctx.orgId, id);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json({ success: true, data: result.data });
});

export const DELETE = withInferenceAuth("ft-cancel", { limit: 20 }, async (req: NextRequest, ctx, routeCtx) => {
  const { id } = await routeCtx.params as { id: string };
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
  if (ctx.orgRole === "viewer") return NextResponse.json({ error: "Viewers cannot cancel fine-tuning jobs" }, { status: 403 });

  const result = await InferenceFineTuneService.cancel(ctx.orgId, id, ctx.userId, auditContextFrom(req));
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json({ success: true, cancelled_id: result.data.cancelled_id });
});
