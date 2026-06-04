/**
 * GET  /api/inference/api-keys — list org API keys (masked)
 * POST /api/inference/api-keys — create new key (show-once plaintext)
 *
 * Response shapes are identical to the original fat route.
 * Business logic lives in InferenceApiKeyService.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withInferenceAuth } from "@/lib/api/inference-middleware";
import { InferenceApiKeyService } from "@/lib/services/inference";
import { auditContextFrom } from "@/lib/inference/audit";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  allowed_models: z.array(z.string()).optional().nullable(),
  allowed_ip_cidrs: z.array(z.string()).optional().nullable(),
  zdr_enabled: z.boolean().optional(),
  semantic_cache_enabled: z.boolean().optional(),
  monthly_budget_cents: z.number().int().nonnegative().optional().nullable(),
  hard_cap_cents: z.number().int().nonnegative().optional().nullable(),
  rate_limit_rpm: z.number().int().min(1).max(10000).optional().nullable(),
  expires_at: z.string().datetime().optional().nullable(),
});

// GET — original rate-limit key: "rl:inf-keys-list", limit 30/min
export const GET = withInferenceAuth("keys-list", { limit: 30, bootstrapOrg: true }, async (_req, ctx) => {
  const result = await InferenceApiKeyService.list(ctx.orgId);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  // Identical shape to original: { success, org, data }
  return NextResponse.json({
    success: true,
    org: { id: ctx.orgId, slug: ctx.orgSlug, name: ctx.orgName },
    data: result.data,
  });
});

// POST — original rate-limit key: "rl:inf-keys-create", limit 10/min
export const POST = withInferenceAuth("keys-create", { limit: 10, bootstrapOrg: true }, async (req: NextRequest, ctx) => {
  if (ctx.orgRole === "viewer") {
    return NextResponse.json({ error: "Viewers cannot create API keys" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Validation error", details: [{ message: "Invalid JSON body" }] },
      { status: 400 }
    );
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation error", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const result = await InferenceApiKeyService.create(
    ctx.orgId,
    ctx.userId,
    parsed.data,
    auditContextFrom(req)
  );

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  // Identical shape to original: { success, data: { ...row, api_key }, message }
  return NextResponse.json(
    {
      success: true,
      data: result.data,
      message: "Copy this key now — for security, the full key will never be shown again.",
    },
    { status: 201 }
  );
});
