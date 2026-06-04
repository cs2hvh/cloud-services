/**
 * GET /api/inference/usage/summary
 * ?days=N (default 7, max 90)
 */
import { NextRequest, NextResponse } from "next/server";
import { withInferenceAuth } from "@/lib/api/inference-middleware";
import { InferenceUsageService } from "@/lib/services/inference";

export const GET = withInferenceAuth("usage-summary", { limit: 60 }, async (req: NextRequest, ctx) => {
  const daysParam = Number(req.nextUrl.searchParams.get("days") ?? "7");
  const days = Number.isFinite(daysParam) ? Math.min(Math.max(1, daysParam), 90) : 7;

  const result = await InferenceUsageService.summary({ id: ctx.orgId, slug: ctx.orgSlug, name: ctx.orgName }, days);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json(result.data);
});
