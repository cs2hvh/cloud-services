/**
 * GET  /api/inference/deployments — list BYO deployments
 * POST /api/inference/deployments — create deployment
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withInferenceAuth } from "@/lib/api/inference-middleware";
import { InferenceDeploymentService } from "@/lib/services/inference";
import { auditContextFrom } from "@/lib/inference/audit";

const createSchema = z.object({
  name: z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9_-]*$/i, "Use letters, digits, hyphens, underscores"),
  source: z.enum(["docker", "huggingface", "truss"]),
  source_ref: z.string().min(1).max(500),
  source_revision: z.string().max(200).optional().nullable(),
  gpu_sku: z.string().min(1, "Select a GPU"),
  autoscale: z.object({
    min_workers: z.number().int().min(0).max(50).default(0),
    max_workers: z.number().int().min(1).max(50).default(4),
    idle_timeout_s: z.number().int().min(5).max(3600).default(60),
  }).default({ min_workers: 0, max_workers: 4, idle_timeout_s: 60 })
    .refine((v) => v.min_workers <= v.max_workers, "min_workers must be <= max_workers"),
  hf_token: z.string().min(1).max(200).optional(),
});

export const GET = withInferenceAuth("deploy-list", { limit: 30, bootstrapOrg: true }, async (req: NextRequest, ctx) => {
  const statusFilter = new URL(req.url).searchParams.get("status") ?? undefined;
  const result = await InferenceDeploymentService.list(ctx.orgId, statusFilter);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ success: true, org: { id: ctx.orgId, slug: ctx.orgSlug, name: ctx.orgName, role: ctx.orgRole }, data: result.data });
});

export const POST = withInferenceAuth("deploy-create", { limit: 5, bootstrapOrg: true }, async (req: NextRequest, ctx) => {
  if (ctx.orgRole === "viewer") return NextResponse.json({ error: "Viewers cannot create deployments" }, { status: 403 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Validation error", details: [{ message: "Invalid JSON body" }] }, { status: 400 }); }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation error", details: parsed.error.issues }, { status: 400 });

  if (parsed.data.source !== "huggingface" && parsed.data.hf_token) {
    return NextResponse.json({ error: "hf_token is only meaningful when source = 'huggingface'" }, { status: 400 });
  }

  const result = await InferenceDeploymentService.create(ctx.orgId, ctx.userId, parsed.data, auditContextFrom(req));
  if (!result.success) {
    return NextResponse.json(
      { error: result.error, preflight: result.meta?.preflight },
      { status: result.status ?? 500 }
    );
  }
  return NextResponse.json({ success: true, data: result.data, preflight: (result as { meta?: { preflight?: unknown } }).meta?.preflight }, { status: 201 });
});
