/**
 * GET  /api/inference/vector/collections — list collections
 * POST /api/inference/vector/collections — create collection ($8/mo, billed hourly)
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withInferenceAuth } from "@/lib/api/inference-middleware";
import { InferenceVectorService } from "@/lib/services/inference";
import { auditContextFrom } from "@/lib/inference/audit";

const createSchema = z.object({
  name: z.string().min(1).max(60).regex(/^[a-z0-9][a-z0-9_-]*$/i),
  description: z.string().max(500).optional().nullable(),
  dimensions: z.number().int().positive().max(4096).optional(),
  distance_metric: z.enum(["cosine", "l2", "inner_product"]).default("cosine"),
  embedding_model_id: z.string().min(1).optional().nullable(),
  index_type: z.enum(["hnsw", "ivfflat", "none"]).default("hnsw"),
  index_params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});

export const GET = withInferenceAuth("vec-list", { limit: 30, bootstrapOrg: true }, async (_req, ctx) => {
  const result = await InferenceVectorService.list(ctx.orgId);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ success: true, org: { id: ctx.orgId, slug: ctx.orgSlug, name: ctx.orgName, role: ctx.orgRole }, data: result.data });
});

export const POST = withInferenceAuth("vec-create", { limit: 10, bootstrapOrg: true }, async (req: NextRequest, ctx) => {
  if (ctx.orgRole === "viewer") return NextResponse.json({ error: "Viewers cannot create collections" }, { status: 403 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Validation error", details: [{ message: "Invalid JSON" }] }, { status: 400 }); }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation error", details: parsed.error.issues }, { status: 400 });

  const result = await InferenceVectorService.create(ctx.orgId, ctx.userId, parsed.data, auditContextFrom(req));
  if (!result.success) return NextResponse.json({ error: result.error, ...(result.code ? { code: result.code } : {}) }, { status: result.status ?? 500 });
  return NextResponse.json({ success: true, data: result.data }, { status: 201 });
});
