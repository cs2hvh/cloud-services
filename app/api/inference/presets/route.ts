/**
 * GET  /api/inference/presets — list presets
 * POST /api/inference/presets — create preset
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withInferenceAuth } from "@/lib/api/inference-middleware";
import { InferencePresetService } from "@/lib/services/inference";
import { auditContextFrom } from "@/lib/inference/audit";

const presetConfigSchema = z.object({
  models: z.array(z.string().min(1)).min(1).max(20),
  provider_sort: z.enum(["price", "throughput", "latency"]).optional().nullable(),
  max_latency_ms: z.number().int().positive().max(60_000).optional().nullable(),
  allow_fallbacks: z.boolean().optional(),
  preferred_max_price_per_mtok: z.number().nonnegative().optional().nullable(),
});

const createSchema = z.object({
  name: z.string().min(1).max(60).regex(/^[a-z0-9][a-z0-9-]*$/i),
  description: z.string().max(500).optional().nullable(),
  config: presetConfigSchema,
});

export const GET = withInferenceAuth("presets-list", { limit: 30, bootstrapOrg: true }, async (_req, ctx) => {
  const result = await InferencePresetService.list(ctx.orgId);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ success: true, org: { id: ctx.orgId, slug: ctx.orgSlug, name: ctx.orgName, role: ctx.orgRole }, data: result.data });
});

export const POST = withInferenceAuth("presets-create", { limit: 10, bootstrapOrg: true }, async (req: NextRequest, ctx) => {
  if (ctx.orgRole === "viewer") return NextResponse.json({ error: "Viewers cannot create presets" }, { status: 403 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation error", details: parsed.error.issues }, { status: 400 });

  const result = await InferencePresetService.create(ctx.orgId, ctx.userId, parsed.data, auditContextFrom(req));
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json({ success: true, data: result.data }, { status: 201 });
});
