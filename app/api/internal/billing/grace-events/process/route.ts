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

type EventGroup = "grace_warning" | "grace_resolved" | "grace_deleted" | "billing_update";

type NotificationShape = {
  type: "success" | "info" | "warning" | "error";
  action: "updated" | "failed";
  title: string;
  message: string;
  emailStatus: "paid" | "due" | "overdue" | "failed";
  dueDate?: string;
  amount?: string;
  emailNotes?: string;
  eventTag: string;
};

function formatDateTime(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatMoney(value: unknown): string | undefined {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return undefined;
  return `$${amount.toFixed(2)}`;
}

function toEventGroup(eventType: string): EventGroup {
  if (
    eventType === "grace_started" ||
    eventType === "grace_reminder_day3" ||
    eventType === "grace_reminder_day1" ||
    eventType === "grace_reminder_6h"
  ) {
    return "grace_warning";
  }
  if (eventType === "grace_resolved") return "grace_resolved";
  if (eventType === "grace_deleted") return "grace_deleted";
  return "billing_update";
}

function serviceTypeLabel(serviceTable: string | null): string {
  switch (serviceTable) {
    case "active_kubernetes":
      return "Kubernetes";
    case "active_database":
      return "Database";
    case "active_objectspace":
      return "Object Storage";
    case "active_spectrum":
      return "Spectrum";
    case "active_platform_apps":
      return "Platform App";
    default:
      return "Service";
  }
}

type ServiceDisplay = {
  key: string;
  serviceTable: string | null;
  serviceId: string | null;
  serviceType: string;
  serviceName: string;
  graceExpiresAt?: string;
  requiredBalance?: string;
};

function mapFromRowsByService(
  rows: OutboxRow[],
  serviceNameLookup: Map<string, string>
): ServiceDisplay[] {
  const byService = new Map<string, ServiceDisplay>();

  for (const row of rows) {
    const serviceTable = row.service_table;
    const serviceId = row.service_id;
    const key = `${serviceTable ?? "unknown"}:${serviceId ?? "unknown"}`;
    const knownName = serviceTable && serviceId ? serviceNameLookup.get(`${serviceTable}:${serviceId}`) : null;
    const serviceName = knownName || serviceId || "Unknown service";

    const expiresAt = formatDateTime(row.payload?.grace_expires_at);
    const requiredBalance = formatMoney(row.payload?.required_balance);

    const existing = byService.get(key);
    if (!existing) {
      byService.set(key, {
        key,
        serviceTable,
        serviceId,
        serviceType: serviceTypeLabel(serviceTable),
        serviceName,
        graceExpiresAt: expiresAt,
        requiredBalance,
      });
      continue;
    }

    if (!existing.graceExpiresAt && expiresAt) existing.graceExpiresAt = expiresAt;
    if (!existing.requiredBalance && requiredBalance) existing.requiredBalance = requiredBalance;
  }

  return [...byService.values()];
}

function extractSpectrumName(dns: unknown, spectrumId: unknown): string {
  if (dns && typeof dns === "object" && !Array.isArray(dns)) {
    const record = dns as Record<string, unknown>;
    if (typeof record.original_name === "string" && record.original_name.trim()) {
      return record.original_name.trim();
    }
    if (typeof record.name === "string" && record.name.trim()) {
      return record.name.trim();
    }
  }
  if (typeof spectrumId === "string" && spectrumId.trim()) {
    return `Spectrum ${spectrumId}`;
  }
  return "Spectrum App";
}

async function loadServiceNameLookup(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  rows: OutboxRow[]
): Promise<Map<string, string>> {
  const lookup = new Map<string, string>();

  const getIds = (table: string) =>
    [...new Set(rows.filter((row) => row.service_table === table).map((row) => row.service_id).filter(Boolean) as string[])];

  const kubernetesIds = getIds("active_kubernetes");
  if (kubernetesIds.length > 0) {
    const { data } = await supabase
      .from("clusters")
      .select("cluster_id, cluster_name")
      .in("cluster_id", kubernetesIds);
    for (const row of data ?? []) {
      lookup.set(`active_kubernetes:${row.cluster_id}`, row.cluster_name || row.cluster_id);
    }
  }

  const databaseIds = getIds("active_database");
  if (databaseIds.length > 0) {
    const { data: byId } = await supabase
      .from("database_cluster")
      .select("id, cluster_id, name")
      .in("id", databaseIds);
    for (const row of byId ?? []) {
      lookup.set(`active_database:${row.id}`, row.name || row.cluster_id || row.id);
    }

    const unresolved = databaseIds.filter((id) => !lookup.has(`active_database:${id}`));
    if (unresolved.length > 0) {
      const { data: byClusterId } = await supabase
        .from("database_cluster")
        .select("id, cluster_id, name")
        .in("cluster_id", unresolved);
      for (const row of byClusterId ?? []) {
        lookup.set(`active_database:${row.cluster_id}`, row.name || row.cluster_id || row.id);
      }
    }
  }

  const objectSpaceIds = getIds("active_objectspace");
  if (objectSpaceIds.length > 0) {
    const { data: byId } = await supabase
      .from("object_spaces")
      .select("id, name, bucket_id")
      .in("id", objectSpaceIds);
    for (const row of byId ?? []) {
      lookup.set(`active_objectspace:${row.id}`, row.name || row.bucket_id || row.id);
    }

    const unresolved = objectSpaceIds.filter((id) => !lookup.has(`active_objectspace:${id}`));
    if (unresolved.length > 0) {
      const { data: byBucketId } = await supabase
        .from("object_spaces")
        .select("id, name, bucket_id")
        .in("bucket_id", unresolved);
      for (const row of byBucketId ?? []) {
        if (row.bucket_id) {
          lookup.set(`active_objectspace:${row.bucket_id}`, row.name || row.bucket_id || row.id);
        }
      }
    }
  }

  const spectrumIds = getIds("active_spectrum");
  if (spectrumIds.length > 0) {
    const { data: byId } = await supabase
      .from("spectrum_apps")
      .select("id, spectrum_id, dns")
      .in("id", spectrumIds);
    for (const row of byId ?? []) {
      lookup.set(`active_spectrum:${row.id}`, extractSpectrumName(row.dns, row.spectrum_id));
    }

    const unresolved = spectrumIds.filter((id) => !lookup.has(`active_spectrum:${id}`));
    if (unresolved.length > 0) {
      const { data: bySpectrumId } = await supabase
        .from("spectrum_apps")
        .select("id, spectrum_id, dns")
        .in("spectrum_id", unresolved);
      for (const row of bySpectrumId ?? []) {
        if (row.spectrum_id) {
          lookup.set(`active_spectrum:${row.spectrum_id}`, extractSpectrumName(row.dns, row.spectrum_id));
        }
      }
    }
  }

  const platformAppIds = getIds("active_platform_apps");
  if (platformAppIds.length > 0) {
    const { data } = await supabase
      .from("platform_apps")
      .select("id, name")
      .in("id", platformAppIds);
    for (const row of data ?? []) {
      lookup.set(`active_platform_apps:${row.id}`, row.name || row.id);
    }
  }

  return lookup;
}

function buildShapeForGroup(rows: OutboxRow[], services: ServiceDisplay[]): NotificationShape {
  const group = toEventGroup(rows[0]?.event_type ?? "");
  const hasFinalWarning = rows.some((row) => row.event_type === "grace_reminder_6h");
  const eventTypes = [...new Set(rows.map((row) => row.event_type))].join(",");

  const shortServiceList = services
    .slice(0, 4)
    .map((service) => `${service.serviceType}: ${service.serviceName}`)
    .join(", ");
  const remainingCount = Math.max(services.length - 4, 0);
  const serviceSuffix = remainingCount > 0 ? ` (+${remainingCount} more)` : "";

  const firstDueDate = services.find((service) => service.graceExpiresAt)?.graceExpiresAt;
  const totalRequired = services.reduce((sum, service) => {
    const amount = Number(service.requiredBalance?.replace("$", ""));
    return Number.isFinite(amount) ? sum + amount : sum;
  }, 0);
  const totalRequiredText = totalRequired > 0 ? `$${totalRequired.toFixed(2)}` : undefined;

  const detailLines = services
    .map((service) => {
      const parts = [`${service.serviceType}: ${service.serviceName}`];
      if (service.graceExpiresAt) parts.push(`expires ${service.graceExpiresAt}`);
      if (service.requiredBalance) parts.push(`required ${service.requiredBalance}`);
      return `- ${parts.join(" | ")}`;
    })
    .join("\n");

  if (group === "grace_warning") {
    return {
      type: "warning",
      action: "updated",
      title: hasFinalWarning ? "Final Billing Grace Warning" : "Billing Grace Reminder",
      message: shortServiceList
        ? `Low balance alert for ${services.length} service(s): ${shortServiceList}${serviceSuffix}.`
        : "Low balance alert: one or more services are in billing grace period.",
      emailStatus: hasFinalWarning ? "overdue" : "due",
      dueDate: firstDueDate ?? new Date().toLocaleDateString("en-US"),
      amount: totalRequiredText ?? "N/A",
      emailNotes: [
        hasFinalWarning
          ? "Final warning: restore credits soon to avoid auto-deletion."
          : "Some services are in billing grace period due to low balance.",
        detailLines,
      ]
        .filter(Boolean)
        .join("\n"),
      eventTag: hasFinalWarning ? "grace_warning_final" : "grace_warning",
    };
  }

  if (group === "grace_resolved") {
    return {
      type: "success",
      action: "updated",
      title: "Billing Grace Resolved",
      message: shortServiceList
        ? `Grace cleared for ${services.length} service(s): ${shortServiceList}${serviceSuffix}.`
        : "Balance restored and grace/deletion scheduling is cleared.",
      emailStatus: "paid",
      dueDate: new Date().toLocaleDateString("en-US"),
      amount: "N/A",
      emailNotes: ["Your balance has been restored.", detailLines].filter(Boolean).join("\n"),
      eventTag: "grace_resolved",
    };
  }

  if (group === "grace_deleted") {
    return {
      type: "error",
      action: "failed",
      title: "Service Deleted Due To Billing",
      message: shortServiceList
        ? `Auto-deleted ${services.length} service(s): ${shortServiceList}${serviceSuffix}.`
        : "One or more services were auto-deleted due to billing.",
      emailStatus: "failed",
      dueDate: new Date().toLocaleDateString("en-US"),
      amount: "N/A",
      emailNotes: [
        "The following services were auto-deleted after grace period expiry:",
        detailLines,
      ]
        .filter(Boolean)
        .join("\n"),
      eventTag: "grace_deleted",
    };
  }

  return {
    type: "info",
    action: "updated",
    title: "Billing Update",
    message: shortServiceList
      ? `Billing updates for ${services.length} service(s): ${shortServiceList}${serviceSuffix}.`
      : "Your billing lifecycle has been updated.",
    emailStatus: "due",
    dueDate: new Date().toLocaleDateString("en-US"),
    amount: "N/A",
    emailNotes: detailLines || "Your billing lifecycle has been updated.",
    eventTag: eventTypes || "billing_update",
  };
}

async function sendUserEmail(
  userId: string,
  invoiceNumber: string,
  shape: NotificationShape
): Promise<void> {
  const supabase = await createServiceClient();
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data?.user?.email) return;

  const email = data.user.email;
  const userName =
    (typeof data.user.user_metadata?.username === "string" && data.user.user_metadata.username) ||
    (typeof data.user.user_metadata?.name === "string" && data.user.user_metadata.name) ||
    email.split("@")[0] ||
    "there";

  await emailService.sendTemplate({
    template: "billingNotification",
    to: email,
    data: {
      customerName: userName,
      invoiceNumber,
      amount: shape.amount ?? "N/A",
      dueDate: shape.dueDate ?? new Date().toLocaleDateString("en-US"),
      status: shape.emailStatus,
      notes: shape.emailNotes ?? shape.message,
      actionLabel: "Open billing dashboard",
      actionUrl: `${process.env.DOMAIN ?? ""}/dashboard/billing`,
    },
    tags: [
      { name: "source", value: "billing-grace-outbox" },
      { name: "event", value: shape.eventTag },
    ],
  });
}

async function processRowGroup(
  rows: OutboxRow[],
  serviceNameLookup: Map<string, string>
): Promise<void> {
  if (rows.length === 0) return;

  const services = mapFromRowsByService(rows, serviceNameLookup);
  const shape = buildShapeForGroup(rows, services);
  const primaryServiceId = services.length === 1 ? services[0]?.serviceId ?? undefined : undefined;
  const primaryServiceTable = services.length === 1 ? services[0]?.serviceTable ?? undefined : undefined;
  const eventTypes = [...new Set(rows.map((row) => row.event_type))];
  const eventKeys = rows.map((row) => row.event_key);

  const notificationResult = await NotificationService.create({
    user_id: rows[0].user_id,
    type: shape.type,
    title: shape.title,
    message: shape.message,
    service_type: "billing",
    service_id: primaryServiceId,
    action: shape.action,
    metadata: {
      eventTypes,
      eventKeys,
      serviceTable: primaryServiceTable,
      serviceCount: services.length,
      services,
    },
  });

  if (!notificationResult.success) {
    throw new Error(notificationResult.error || "Failed to create in-app notification");
  }

  await sendUserEmail(
    rows[0].user_id,
    eventKeys[0] ?? `billing-grace-${Date.now()}`,
    shape
  );
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
  const claimedRows: OutboxRow[] = [];

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
    claimedRows.push(row);
  }

  const serviceNameLookup = await loadServiceNameLookup(supabase, claimedRows);
  const groupedRows = new Map<string, OutboxRow[]>();

  for (const row of claimedRows) {
    const groupKey = `${row.user_id}:${toEventGroup(row.event_type)}`;
    const existing = groupedRows.get(groupKey);
    if (existing) {
      existing.push(row);
    } else {
      groupedRows.set(groupKey, [row]);
    }
  }

  for (const groupRows of groupedRows.values()) {
    const rowIds = groupRows.map((row) => row.id);

    try {
      await processRowGroup(groupRows, serviceNameLookup);
      const { error: completeError } = await supabase
        .schema("billing")
        .from("notification_outbox")
        .update({
          status: "processed",
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_error: null,
        })
        .in("id", rowIds);

      if (completeError) throw new Error(completeError.message);
      processed += rowIds.length;
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
        .in("id", rowIds);
      failed += rowIds.length;
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
