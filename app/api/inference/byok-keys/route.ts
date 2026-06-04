/**
 * GET  /api/inference/byok-keys — list masked BYOK keys
 * POST /api/inference/byok-keys — verify, encrypt, store
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withInferenceAuth } from "@/lib/api/inference-middleware";
import { InferenceByokKeyService } from "@/lib/services/inference";
import { auditContextFrom } from "@/lib/inference/audit";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  provider: z.enum(["openrouter", "openai", "anthropic", "google", "mistral", "custom"]),
  api_key: z.string().min(10).max(500),
});

export const GET = withInferenceAuth("byok-list", { limit: 30, bootstrapOrg: true }, async (_req, ctx) => {
  const result = await InferenceByokKeyService.list(ctx.orgId);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ success: true, org: { id: ctx.orgId, slug: ctx.orgSlug, name: ctx.orgName }, data: result.data });
});

export const POST = withInferenceAuth("byok-create", { limit: 10, bootstrapOrg: true }, async (req: NextRequest, ctx) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Validation error", details: [{ message: "Invalid JSON body" }] }, { status: 400 }); }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation error", details: parsed.error.issues }, { status: 400 });

  const result = await InferenceByokKeyService.create(ctx.orgId, ctx.userId, parsed.data, auditContextFrom(req));
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json({ success: true, data: result.data }, { status: 201 });
});
