/**
 * GET  /api/inference/fine-tuning/jobs — list jobs for the active org
 * POST /api/inference/fine-tuning/jobs — create a new fine-tuning job
 *
 * Response shapes are identical to the original fat route.
 * Business logic (balance gate, GPU-fit, preflight, billing) lives in
 * InferenceFineTuneService.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withInferenceAuth } from "@/lib/api/inference-middleware";
import { InferenceFineTuneService } from "@/lib/services/inference";
import { auditContextFrom } from "@/lib/inference/audit";

const createSchema = z.object({
  name: z.string().min(1).max(80).regex(/^[a-z0-9][a-z0-9_-]*$/i, "Use letters, digits, hyphens, underscores"),
  base_model_id: z.string().min(1),
  method: z.enum(["lora", "qlora", "full"]).default("lora"),
  dataset_url: z.string().url("Dataset URL must be a valid https:// or s3:// URL").refine(
    (u) => u.startsWith("https://") || u.startsWith("s3://") || u.startsWith("r2://"),
    "Use https://, s3://, or r2:// URL"
  ),
  validation_dataset_url: z.string().url().optional().nullable(),
  gpu_sku: z.string().min(1, "Select a GPU"),
  hyperparams: z.object({
    rank: z.number().int().min(1).max(256).optional(),
    alpha: z.number().int().min(1).max(512).optional(),
    lr: z.number().positive().max(1).optional(),
    epochs: z.number().int().min(1).max(50).optional(),
    batch_size: z.number().int().min(1).max(64).optional(),
    gradient_accumulation_steps: z.number().int().min(1).max(64).optional(),
    max_seq_length: z.number().int().min(128).max(131072).optional(),
    warmup_steps: z.number().int().min(0).max(10000).optional(),
    target_modules: z.array(z.string()).optional(),
  }).passthrough().default({}),
});

// GET — original rate-limit key: "rl:inf-ft-list", limit 30/min
export const GET = withInferenceAuth("ft-list", { limit: 30, bootstrapOrg: true }, async (req: NextRequest, ctx) => {
  const statusFilter = new URL(req.url).searchParams.get("status") ?? undefined;
  const result = await InferenceFineTuneService.list(ctx.orgId, statusFilter);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  // Identical shape to original: { success, org, data }
  return NextResponse.json({
    success: true,
    org: { id: ctx.orgId, slug: ctx.orgSlug, name: ctx.orgName, role: ctx.orgRole },
    data: result.data,
  });
});

// POST — original rate-limit key: "rl:inf-ft-create", limit 5/min
export const POST = withInferenceAuth("ft-create", { limit: 5, bootstrapOrg: true }, async (req: NextRequest, ctx) => {
  if (ctx.orgRole === "viewer") {
    return NextResponse.json({ error: "Viewers cannot create fine-tuning jobs" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Validation error", details: [{ message: "Invalid JSON body" }] }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation error", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const result = await InferenceFineTuneService.create(
    ctx.orgId,
    ctx.userId,
    parsed.data,
    auditContextFrom(req)
  );

  if (!result.success) {
    const status = result.status ?? 500;
    const body: Record<string, unknown> = { error: result.error };
    if (result.code) body.code = result.code;
    if (result.meta?.preflight) body.preflight = result.meta.preflight;
    if (result.meta?.required_usd) body.required_usd = result.meta.required_usd;
    return NextResponse.json(body, { status });
  }

  // Identical shape to original: { success, data, preflight }
  return NextResponse.json(
    { success: true, data: result.data, preflight: result.meta?.preflight },
    { status: 201 }
  );
});
