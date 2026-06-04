/**
 * PATCH  /api/inference/members/[id] — change role
 * DELETE /api/inference/members/[id] — remove member
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withInferenceAuth } from "@/lib/api/inference-middleware";
import { InferenceMemberService } from "@/lib/services/inference";
import { auditContextFrom } from "@/lib/inference/audit";

const patchSchema = z.object({ role: z.enum(["owner", "admin", "developer", "viewer"]) });
function isUuid(s: string) { return /^[0-9a-f-]{36}$/i.test(s); }

export const PATCH = withInferenceAuth("member-patch", { limit: 20 }, async (req: NextRequest, ctx, routeCtx) => {
  const { id } = await routeCtx.params as { id: string };
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid member id" }, { status: 400 });
  if (ctx.orgRole !== "owner" && ctx.orgRole !== "admin") {
    return NextResponse.json({ error: "Only org owners and admins can change member roles" }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation error", details: parsed.error.issues }, { status: 400 });

  const result = await InferenceMemberService.updateRole(ctx.orgId, id, ctx.userId, ctx.orgRole, parsed.data.role, auditContextFrom(req));
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json({ success: true, data: result.data });
});

export const DELETE = withInferenceAuth("member-delete", { limit: 20 }, async (req: NextRequest, ctx, routeCtx) => {
  const { id } = await routeCtx.params as { id: string };
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid member id" }, { status: 400 });
  if (ctx.orgRole !== "owner" && ctx.orgRole !== "admin") {
    return NextResponse.json({ error: "Only org owners and admins can remove members" }, { status: 403 });
  }

  const result = await InferenceMemberService.remove(ctx.orgId, id, ctx.userId, auditContextFrom(req));
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json({ success: true, removed_id: id });
});
