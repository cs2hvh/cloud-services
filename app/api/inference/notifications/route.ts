/**
 * GET /api/inference/notifications — get org notification settings
 * PUT /api/inference/notifications — replace settings (admin/owner only)
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withInferenceAuth } from "@/lib/api/inference-middleware";
import { InferenceNotificationService } from "@/lib/services/inference";
import { auditContextFrom } from "@/lib/inference/audit";

const EVENTS = ["finetune.succeeded", "finetune.failed", "batch.completed", "batch.failed", "serving_pod.ready", "serving_pod.stopped", "org.spend_threshold_reached"] as const;

const settingsSchema = z.object({
  events_subscribed: z.array(z.enum(EVENTS)).max(EVENTS.length),
  email_recipients: z.array(z.string().email()).max(5),
  in_app_enabled: z.boolean(),
  webhook_enabled: z.boolean(),
  webhook_url: z.string().url().refine((u) => u.startsWith("https://"), "Webhook URL must be https").nullable().optional(),
  webhook_secret: z.string().min(16).max(200).nullable().optional(),
});

export const GET = withInferenceAuth("notif-get", { limit: 60 }, async (_req, ctx) => {
  const result = await InferenceNotificationService.get(ctx.orgId);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json(result.data);
});

export const PUT = withInferenceAuth("notif-config", { limit: 30 }, async (req: NextRequest, ctx) => {
  if (ctx.orgRole !== "owner" && ctx.orgRole !== "admin") {
    return NextResponse.json({ error: "Only owners and admins can change notification settings" }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation error", details: parsed.error.issues }, { status: 400 });

  const result = await InferenceNotificationService.update(ctx.orgId, ctx.userId, parsed.data, auditContextFrom(req));
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json({ success: true });
});
