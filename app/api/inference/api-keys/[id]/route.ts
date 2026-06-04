/**
 * PATCH  /api/inference/api-keys/[id] — update name/budget/scope
 * DELETE /api/inference/api-keys/[id] — soft revoke
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withInferenceAuth } from "@/lib/api/inference-middleware";
import { InferenceApiKeyService } from "@/lib/services/inference";
import { auditContextFrom } from "@/lib/inference/audit";

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  allowed_models: z.array(z.string()).optional().nullable(),
  allowed_ip_cidrs: z.array(z.string()).optional().nullable(),
  zdr_enabled: z.boolean().optional(),
  semantic_cache_enabled: z.boolean().optional(),
  monthly_budget_cents: z.number().int().nonnegative().optional().nullable(),
  hard_cap_cents: z.number().int().nonnegative().optional().nullable(),
  rate_limit_rpm: z.number().int().min(1).max(10000).optional().nullable(),
});

function isUuid(s: string) { return /^[0-9a-f-]{36}$/i.test(s); }

export const PATCH = withInferenceAuth("keys-patch", { limit: 30 }, async (req: NextRequest, ctx, routeCtx) => {
  const { id } = await routeCtx.params as { id: string };
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid API key id" }, { status: 400 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Validation error", details: [{ message: "Invalid JSON body" }] }, { status: 400 }); }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation error", details: parsed.error.issues }, { status: 400 });

  const result = await InferenceApiKeyService.update(ctx.orgId, id, ctx.userId, parsed.data, auditContextFrom(req));
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json({ success: true, data: result.data });
});

export const DELETE = withInferenceAuth("keys-delete", { limit: 20 }, async (req: NextRequest, ctx, routeCtx) => {
  const { id } = await routeCtx.params as { id: string };
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid API key id" }, { status: 400 });

  if (ctx.orgRole !== "owner" && ctx.orgRole !== "admin") {
    return NextResponse.json({ error: "Only org owners and admins can revoke API keys" }, { status: 403 });
  }

  const result = await InferenceApiKeyService.revoke(ctx.orgId, id, ctx.userId, auditContextFrom(req));
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json({ success: true, revoked_id: id });
});
