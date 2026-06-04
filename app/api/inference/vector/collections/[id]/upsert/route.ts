/**
 * POST /api/inference/vector/collections/[id]/upsert
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withInferenceAuth } from "@/lib/api/inference-middleware";
import { InferenceVectorService } from "@/lib/services/inference";

const upsertSchema = z.object({
  rows: z.array(z.object({
    external_id: z.string().min(1).max(200),
    content: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    embedding: z.array(z.number()).optional(),
  })).min(1).max(100),
});

export const POST = withInferenceAuth("vec-upsert", { limit: 60 }, async (req: NextRequest, ctx, routeCtx) => {
  const { id } = await routeCtx.params as { id: string };
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid collection id" }, { status: 400 });
  if (ctx.orgRole === "viewer") return NextResponse.json({ error: "Viewers cannot upsert" }, { status: 403 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation error", details: parsed.error.issues }, { status: 400 });

  const result = await InferenceVectorService.upsert(ctx.orgId, id, parsed.data.rows);
  if (!result.success) return NextResponse.json({ error: result.error, ...(result.code ? { code: result.code } : {}) }, { status: result.status ?? 500 });
  return NextResponse.json({ success: true, upserted: result.data.upserted, rows: result.data.rows });
});
