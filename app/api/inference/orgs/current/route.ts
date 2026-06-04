/**
 * GET   /api/inference/orgs/current
 * PATCH /api/inference/orgs/current
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withInferenceAuth } from "@/lib/api/inference-middleware";
import { InferenceOrgService } from "@/lib/services/inference";
import { auditContextFrom } from "@/lib/inference/audit";

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  zdr_default: z.boolean().optional(),
  region_pin: z.enum(["us", "eu", "asia"]).nullable().optional(),
  monthly_budget_cents: z.number().int().nonnegative().max(100_000_000).nullable().optional(),
  hard_cap_cents: z.number().int().nonnegative().max(100_000_000).nullable().optional(),
  semantic_cache_threshold: z.number().min(0.5).max(0.99).nullable().optional(),
});

export const GET = withInferenceAuth("org-get", { limit: 60, bootstrapOrg: true }, async (_req, ctx) => {
  const result = await InferenceOrgService.get(ctx.orgId, {
    slug: ctx.orgSlug,
    name: ctx.orgName,
    role: ctx.orgRole,
  });
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json({ success: true, org: result.data.org, counts: result.data.counts });
});

export const PATCH = withInferenceAuth("org-patch", { limit: 20, bootstrapOrg: true }, async (req: NextRequest, ctx) => {
  if (ctx.orgRole !== "owner" && ctx.orgRole !== "admin") {
    return NextResponse.json({ error: "Only org owners and admins can update settings" }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation error", details: parsed.error.issues }, { status: 400 });
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const result = await InferenceOrgService.update(ctx.orgId, ctx.userId, parsed.data, auditContextFrom(req));
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json({ success: true, org: result.data });
});
