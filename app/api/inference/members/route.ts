/**
 * GET /api/inference/members — list org members
 */
import { NextResponse } from "next/server";
import { withInferenceAuth } from "@/lib/api/inference-middleware";
import { InferenceMemberService } from "@/lib/services/inference";

export const GET = withInferenceAuth("members", { limit: 30 }, async (_req, ctx) => {
  const result = await InferenceMemberService.list(ctx.orgId, ctx.userId);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({
    success: true,
    org: { id: ctx.orgId, slug: ctx.orgSlug, name: ctx.orgName, your_role: ctx.orgRole },
    counts: result.data.counts,
    data: result.data.data,
  });
});
