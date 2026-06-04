/**
 * GET    /api/inference/files/[id]
 * DELETE /api/inference/files/[id]
 */
import { NextRequest, NextResponse } from "next/server";
import { withInferenceAuth } from "@/lib/api/inference-middleware";
import { InferenceFileService } from "@/lib/services/inference";
import { auditContextFrom } from "@/lib/inference/audit";

function isFileId(s: string) { return /^file_[a-z0-9]+$/i.test(s); }

export const GET = withInferenceAuth("files-get", { limit: 60 }, async (_req, ctx, routeCtx) => {
  const { id } = await routeCtx.params as { id: string };
  if (!isFileId(id)) return NextResponse.json({ error: "Invalid file id" }, { status: 400 });

  const result = await InferenceFileService.get(ctx.orgId, id);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json(result.data);
});

export const DELETE = withInferenceAuth("files-delete", { limit: 30 }, async (req: NextRequest, ctx, routeCtx) => {
  const { id } = await routeCtx.params as { id: string };
  if (!isFileId(id)) return NextResponse.json({ error: "Invalid file id" }, { status: 400 });
  if (ctx.orgRole === "viewer") return NextResponse.json({ error: "Viewers cannot delete files" }, { status: 403 });

  const result = await InferenceFileService.delete(ctx.orgId, id, ctx.userId, auditContextFrom(req));
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json({ id, object: "file", deleted: true });
});
