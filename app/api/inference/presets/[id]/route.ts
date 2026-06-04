/**
 * PATCH  /api/inference/presets/[id]
 * DELETE /api/inference/presets/[id]
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withInferenceAuth } from "@/lib/api/inference-middleware";
import { InferencePresetService } from "@/lib/services/inference";
import { auditContextFrom } from "@/lib/inference/audit";

const patchSchema = z.object({
  name: z.string().min(1).max(60).regex(/^[a-z0-9][a-z0-9-]*$/i).optional(),
  description: z.string().max(500).nullable().optional(),
  config: z.object({
    models: z.array(z.string().min(1)).min(1).max(20),
    provider_sort: z.enum(["price", "throughput", "latency"]).nullable().optional(),
    max_latency_ms: z.number().int().positive().max(60_000).nullable().optional(),
    allow_fallbacks: z.boolean().optional(),
    preferred_max_price_per_mtok: z.number().nonnegative().nullable().optional(),
  }).optional(),
});

function isUuid(s: string) { return /^[0-9a-f-]{36}$/i.test(s); }

export const PATCH = withInferenceAuth("presets-patch", { limit: 20 }, async (req: NextRequest, ctx, routeCtx) => {
  const { id } = await routeCtx.params as { id: string };
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid preset id" }, { status: 400 });
  if (ctx.orgRole === "viewer") return NextResponse.json({ error: "Viewers cannot update presets" }, { status: 403 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation error", details: parsed.error.issues }, { status: 400 });
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const result = await InferencePresetService.update(ctx.orgId, id, ctx.userId, parsed.data, auditContextFrom(req));
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json({ success: true, data: result.data });
});

export const DELETE = withInferenceAuth("presets-delete", { limit: 20 }, async (req: NextRequest, ctx, routeCtx) => {
  const { id } = await routeCtx.params as { id: string };
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid preset id" }, { status: 400 });
  if (ctx.orgRole !== "owner" && ctx.orgRole !== "admin") {
    return NextResponse.json({ error: "Only owners and admins can delete presets" }, { status: 403 });
  }

  const result = await InferencePresetService.delete(ctx.orgId, id, ctx.userId, auditContextFrom(req));
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json({ success: true, deleted_id: id });
});
