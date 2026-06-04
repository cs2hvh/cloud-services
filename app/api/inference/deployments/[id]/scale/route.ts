/**
 * POST /api/inference/deployments/[id]/scale
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withInferenceAuth } from "@/lib/api/inference-middleware";
import { InferenceDeploymentService } from "@/lib/services/inference";
import { auditContextFrom } from "@/lib/inference/audit";

const scaleSchema = z.object({
  min_workers: z.number().int().min(0).max(50),
  max_workers: z.number().int().min(1).max(50),
  idle_timeout_s: z.number().int().min(5).max(3600),
}).refine((v) => v.min_workers <= v.max_workers, { message: "min_workers must be <= max_workers" });

export const POST = withInferenceAuth("deploy-scale", { limit: 20, bootstrapOrg: true }, async (req: NextRequest, ctx, routeCtx) => {
  const { id } = await routeCtx.params as { id: string };
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid deployment id" }, { status: 400 });
  if (ctx.orgRole === "viewer") return NextResponse.json({ error: "Viewers cannot scale deployments" }, { status: 403 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Validation error", details: [{ message: "Invalid JSON" }] }, { status: 400 }); }

  const parsed = scaleSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation error", details: parsed.error.issues }, { status: 400 });

  const result = await InferenceDeploymentService.scale(ctx.orgId, id, ctx.userId, parsed.data, auditContextFrom(req));
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json({ success: true, autoscale: result.data.autoscale });
});
