/**
 * POST /api/inference/vector/collections/[id]/query
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withInferenceAuth } from "@/lib/api/inference-middleware";
import { InferenceVectorService } from "@/lib/services/inference";

const querySchema = z.object({
  embedding: z.array(z.number()).optional(),
  text: z.string().optional(),
  top_k: z.number().int().positive().max(100).default(10),
  min_similarity: z.number().min(0).max(1).default(0),
  filter: z.record(z.string(), z.unknown()).optional(),
}).refine((d) => !!d.embedding || !!d.text, { message: "Must provide either `embedding` or `text`" });

export const POST = withInferenceAuth("vec-query", { limit: 120 }, async (req: NextRequest, ctx, routeCtx) => {
  const { id } = await routeCtx.params as { id: string };
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid collection id" }, { status: 400 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const parsed = querySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation error", details: parsed.error.issues }, { status: 400 });

  const result = await InferenceVectorService.query(ctx.orgId, id, parsed.data);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json({ success: true, results: result.data.results, count: result.data.count });
});
