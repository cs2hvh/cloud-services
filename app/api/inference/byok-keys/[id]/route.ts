/**
 * DELETE /api/inference/byok-keys/[id]
 */
import { NextRequest, NextResponse } from "next/server";
import { withInferenceAuth } from "@/lib/api/inference-middleware";
import { InferenceByokKeyService } from "@/lib/services/inference";
import { auditContextFrom } from "@/lib/inference/audit";

export const DELETE = withInferenceAuth("byok-delete", { limit: 20 }, async (req: NextRequest, ctx, routeCtx) => {
  const { id } = await routeCtx.params as { id: string };
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid BYOK key id" }, { status: 400 });

  if (ctx.orgRole !== "owner" && ctx.orgRole !== "admin") {
    return NextResponse.json({ error: "Only org owners and admins can delete BYOK keys" }, { status: 403 });
  }

  const result = await InferenceByokKeyService.delete(ctx.orgId, id, ctx.userId, auditContextFrom(req));
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json({ success: true, deleted_id: id });
});
