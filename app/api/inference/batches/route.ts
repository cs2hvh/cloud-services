/**
 * GET  /api/inference/batches — list batches (OpenAI shape)
 * POST /api/inference/batches — create batch
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withInferenceAuth } from "@/lib/api/inference-middleware";
import { InferenceBatchService } from "@/lib/services/inference";
import { auditContextFrom } from "@/lib/inference/audit";

const createSchema = z.object({
  input_file_id: z.string().regex(/^file_[a-z0-9]+$/i, "Invalid file id"),
  endpoint: z.enum(["/v1/chat/completions", "/v1/embeddings"]),
  completion_window: z.literal("24h").default("24h"),
  metadata: z.record(z.string(), z.string()).refine((m) => Object.keys(m).length <= 16, "metadata supports at most 16 entries").optional(),
});

export const GET = withInferenceAuth("batches-list", { limit: 60 }, async (_req, ctx) => {
  const result = await InferenceBatchService.list(ctx.orgId);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ object: "list", data: result.data });
});

export const POST = withInferenceAuth("batches-create", { limit: 30 }, async (req: NextRequest, ctx) => {
  if (ctx.orgRole === "viewer") {
    return NextResponse.json({ error: "Viewers cannot create batches" }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation error", details: parsed.error.issues }, { status: 400 });

  const result = await InferenceBatchService.create(ctx.orgId, ctx.userId, parsed.data, auditContextFrom(req));
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json(result.data, { status: 201 });
});
