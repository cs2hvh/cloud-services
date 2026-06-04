/**
 * GET    /api/inference/vector/collections/[id]/rows — list rows
 * DELETE /api/inference/vector/collections/[id]/rows — bulk delete by external_id
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withInferenceAuth } from "@/lib/api/inference-middleware";
import { InferenceVectorService } from "@/lib/services/inference";
import { auditContextFrom } from "@/lib/inference/audit";

const bulkDeleteSchema = z.object({
  external_ids: z.array(z.string().min(1).max(200)).min(1).max(500),
});

function isUuid(s: string) { return /^[0-9a-f-]{36}$/i.test(s); }

export const GET = withInferenceAuth("vec-rows-list", { limit: 60 }, async (req: NextRequest, ctx, routeCtx) => {
  const { id } = await routeCtx.params as { id: string };
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid collection id" }, { status: 400 });

  const url = new URL(req.url);
  const limit = Math.min(200, Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "50", 10) || 50));
  const offset = Math.max(0, Number.parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);
  const q = url.searchParams.get("q")?.trim() ?? undefined;

  const result = await InferenceVectorService.listRows(ctx.orgId, id, { limit, offset, q });
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json({ success: true, ...result.data });
});

export const DELETE = withInferenceAuth("vec-rows-delete", { limit: 20 }, async (req: NextRequest, ctx, routeCtx) => {
  const { id } = await routeCtx.params as { id: string };
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid collection id" }, { status: 400 });
  if (ctx.orgRole === "viewer") return NextResponse.json({ error: "Viewers cannot delete rows" }, { status: 403 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const parsed = bulkDeleteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation error", details: parsed.error.issues }, { status: 400 });

  const result = await InferenceVectorService.deleteRows(ctx.orgId, id, parsed.data.external_ids, ctx.userId, auditContextFrom(req));
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json({ success: true, deleted: result.data.deleted });
});
