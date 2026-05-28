import { emailService } from "@/lib/email";
import { getEmailConfig } from "@/lib/email/config";
import type { SystemAlertEmailData } from "@/lib/email/types";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Service families that can send user-facing alert emails. Each maps to a
 * dashboard destination and a Resend tag so emails are consistent and traceable
 * across the platform.
 */
export type ServiceAlertType =
  | "database"
  | "kubernetes"
  | "object-storage"
  | "app"
  | "spectrum";

const SERVICE_DASHBOARD: Record<
  ServiceAlertType,
  { path: string; label: string; tag: string }
> = {
  database: {
    path: "/dashboard/services/database",
    label: "Open databases",
    tag: "database",
  },
  kubernetes: {
    path: "/dashboard/services/kubernetes",
    label: "Open Kubernetes clusters",
    tag: "kubernetes",
  },
  "object-storage": {
    path: "/dashboard/services/object-storage",
    label: "Open object storage",
    tag: "object_storage",
  },
  app: {
    path: "/dashboard/services/apps",
    label: "Open apps",
    tag: "platform_app",
  },
  spectrum: {
    path: "/dashboard/services/network-ddos",
    label: "Open network shields",
    tag: "spectrum",
  },
};

export type ServiceAlertEmailParams = {
  serviceType: ServiceAlertType;
  userEmail?: string;
  serviceName: string;
  alertTitle: string;
  summary: string;
  severity?: SystemAlertEmailData["severity"];
  metadata?: Record<string, string | number | boolean | null | undefined>;
  /** Override the default dashboard path for the action button. */
  actionPath?: string;
  /** Override the default action button label. */
  actionLabel?: string;
};

function getRecipientName(email: string): string {
  const localPart = email.split("@")[0] || "there";
  return localPart.replace(/[._-]+/g, " ").trim() || "there";
}

/**
 * Resolve a user's email address from their id so operations that only carry a
 * user/owner id (not an email) can still notify the right person. Returns
 * undefined on any failure so callers can safely skip sending.
 */
export async function resolveUserEmail(
  userId?: string | null
): Promise<string | undefined> {
  if (!userId) {
    return undefined;
  }

  try {
    const supabase = await createServiceClient();
    const { data, error } = await supabase.auth.admin.getUserById(userId);
    if (error || !data?.user?.email) {
      return undefined;
    }
    return data.user.email;
  } catch {
    return undefined;
  }
}

/**
 * Send a professional service alert email using the shared `systemAlert`
 * template. No-ops when no recipient is known or email delivery is not
 * configured, and never throws — callers fire-and-forget inside their own
 * try/catch the same way notifications are sent.
 */
export async function sendServiceAlertEmail(
  params: ServiceAlertEmailParams
): Promise<void> {
  if (!params.userEmail || !process.env.RESEND_API_KEY) {
    return;
  }

  const { appUrl } = getEmailConfig();
  const dashboard = SERVICE_DASHBOARD[params.serviceType];
  const metadata = Object.entries(params.metadata || {}).reduce<
    Record<string, string | number | boolean>
  >((acc, [key, value]) => {
    if (value !== undefined && value !== null) {
      acc[key] = value;
    }
    return acc;
  }, {});

  const result = await emailService.sendTemplate({
    template: "systemAlert",
    to: params.userEmail,
    data: {
      customerName: getRecipientName(params.userEmail),
      alertTitle: params.alertTitle,
      severity: params.severity || "info",
      serviceName: params.serviceName,
      detectedAt: new Date().toISOString(),
      summary: params.summary,
      actionUrl: `${appUrl}${params.actionPath ?? dashboard.path}`,
      actionLabel: params.actionLabel ?? dashboard.label,
      metadata,
    },
    tags: [
      { name: "service", value: dashboard.tag },
      { name: "alert", value: params.alertTitle },
    ],
  });

  if (!result.success) {
    throw new Error(result.message || "Failed to send service alert email");
  }
}
