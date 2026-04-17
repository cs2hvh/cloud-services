import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { hasValidCronBearerToken } from "@/lib/security/cron-auth";
import { NotificationService } from "@/lib/notifications/service";
import { emailService } from "@/lib/email";

const RequestSchema = z
  .object({
    limit: z.number().int().min(1).max(200).optional(),
  })
  .optional();

type OutboxRow = {
  id: number;
  event_key: string;
  event_type: string;
  user_id: string;
  service_table: string | null;
  service_id: string | null;
  payload: Record<string, unknown> | null;
  attempts: number;
};

type NotificationShape = {
  type: "success" | "info" | "warning" | "error";
  action: "updated" | "failed";
  title: string;
  message: string;
  emailStatus: "paid" | "due" | "overdue" | "failed";
};

function formatDate(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleDateString("en-US");
}

function getNotificationShape(row: OutboxRow): NotificationShape {
  const expiresAt = formatDate(row.payload?.grace_expires_at);

  switch (row.event_type) {
    case "grace_started":
      return {
        type: "warning",
        action: "updated",
        title: "Billing Grace Period Started",
        message: expiresAt
          ? `Your service entered a billing grace period and may be auto-deleted on ${expiresAt} if balance is not restored.`
          : "Your service entered a billing grace period and may be auto-deleted if balance is not restored.",
        emailStatus: "due",
      };
    case "grace_reminder_day3":
    case "grace_reminder_day1":
      return {
        type: "warning",
        action: "updated",
        title: "Billing Grace Reminder",
        message: expiresAt
          ? `Billing grace is still active. Restore balance before ${expiresAt} to avoid service deletion.`
          : "Billing grace is still active. Restore balance to avoid service deletion.",
        emailStatus: "due",
      };
    case "grace_reminder_6h":
      return {
        type: "warning",
        action: "updated",
        title: "Final Billing Grace Warning",
        message: expiresAt
          ? `Final warning: restore balance before ${expiresAt} to avoid service deletion.`
          : "Final warning: restore balance now to avoid service deletion.",
        emailStatus: "overdue",
      };
    case "grace_resolved":
      return {
        type: "success",
        action: "updated",
        title: "Billing Grace Resolved",
        message: "Balance has been restored and grace/deletion scheduling is cleared.",
        emailStatus: "paid",
      };
    case "grace_deleted":
      return {
        type: "error",
        action: "failed",
        title: "Service Deleted Due To Billing",
        message: "The service was auto-deleted after grace period expiry and insufficient balance.",
        emailStatus: "failed",
      };
    default:
      return {
        type: "info",
        action: "updated",
        title: "Billing Update",
        message: "Your billing lifecycle has been updated.",
        emailStatus: "due",
      };
  }
}

async function sendUserEmail(row: OutboxRow, shape: NotificationShape): Promise<void> {
  const supabase = await createServiceClient();
  const { data, error } = await supabase.auth.admin.getUserById(row.user_id);
  if (error || !data?.user?.email) return;

  const email = data.user.email;
  const userName =
    (typeof data.user.user_metadata?.username === "string" && data.user.user_metadata.username) ||
    (typeof data.user.user_metadata?.name === "string" && data.user.user_metadata.name) ||
    email.split("@")[0] ||
    "there";
  const dueDate = formatDate(row.payload?.grace_expires_at) ?? new Date().toLocaleDateString("en-US");
  const amountRaw = Number(row.payload?.required_balance);
  const amount = Number.isFinite(amountRaw) ? `$${amountRaw.toFixed(2)}` : "N/A";

  await emailService.sendTemplate({
    template: "billingNotification",
    to: email,
    data: {
      customerName: userName,
      invoiceNumber: row.event_key,
      amount,
      dueDate,
      status: shape.emailStatus,
      notes: shape.message,
      actionLabel: "Open billing dashboard",
      actionUrl: `${process.env.DOMAIN ?? ""}/dashboard/billing`,
    },
    tags: [
      { name: "source", value: "billing-grace-outbox" },
      { name: "event", value: row.event_type },
    ],
  });
}

async function processRow(row: OutboxRow): Promise<void> {
  const shape = getNotificationShape(row);

  const notificationResult = await NotificationService.create({
    user_id: row.user_id,
    type: shape.type,
    title: shape.title,
    message: shape.message,
    service_type: "billing",
    service_id: row.service_id ?? undefined,
    action: shape.action,
    metadata: {
      eventType: row.event_type,
      serviceTable: row.service_table,
      ...(row.payload ?? {}),
    },
  });

  if (!notificationResult.success) {
    throw new Error(notificationResult.error || "Failed to create in-app notification");
  }

  await sendUserEmail(row, shape);
}

export async function POST(req: Request) {
  if (!hasValidCronBearerToken(req)) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "Invalid or missing authorization" },
      { status: 401 }
    );
  }

  const parsedBody = RequestSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "BAD_REQUEST", message: parsedBody.error.issues[0]?.message || "Invalid payload" },
      { status: 400 }
    );
  }

  const limit = parsedBody.data?.limit ?? 50;
  const supabase = await createServiceClient();
  const nowIso = new Date().toISOString();

  const { data: rows, error: fetchError } = await supabase
    .schema("billing")
    .from("notification_outbox")
    .select("id, event_key, event_type, user_id, service_table, service_id, payload, attempts")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (fetchError) {
    return NextResponse.json(
      { error: "FETCH_FAILED", message: fetchError.message },
      { status: 500 }
    );
  }

  let processed = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of (rows ?? []) as OutboxRow[]) {
    const { data: claimedRow, error: claimError } = await supabase
      .schema("billing")
      .from("notification_outbox")
      .update({
        status: "processing",
        attempts: (row.attempts ?? 0) + 1,
        updated_at: nowIso,
      })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (claimError || !claimedRow) {
      skipped += 1;
      continue;
    }

    try {
      await processRow(row);
      const { error: completeError } = await supabase
        .schema("billing")
        .from("notification_outbox")
        .update({
          status: "processed",
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("id", row.id);

      if (completeError) throw new Error(completeError.message);
      processed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown outbox processing failure";
      await supabase
        .schema("billing")
        .from("notification_outbox")
        .update({
          status: "failed",
          last_error: message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      failed += 1;
    }
  }

  return NextResponse.json({
    success: true,
    processed,
    failed,
    skipped,
    scanned: rows?.length ?? 0,
  });
}
