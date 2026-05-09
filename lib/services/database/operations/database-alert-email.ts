import { emailService } from "@/lib/email";
import { getEmailConfig } from "@/lib/email/config";
import type { SystemAlertEmailData } from "@/lib/email/types";

type DatabaseAlertEmailParams = {
  userEmail?: string;
  serviceName: string;
  alertTitle: string;
  summary: string;
  severity?: SystemAlertEmailData["severity"];
  metadata?: Record<string, string | number | boolean | null | undefined>;
};

function getRecipientName(email: string): string {
  const localPart = email.split("@")[0] || "there";
  return localPart.replace(/[._-]+/g, " ").trim() || "there";
}

export async function sendDatabaseAlertEmail(
  params: DatabaseAlertEmailParams
): Promise<void> {
  if (!params.userEmail || !process.env.RESEND_API_KEY) {
    return;
  }

  const { appUrl } = getEmailConfig();
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
      actionUrl: `${appUrl}/dashboard/services/database`,
      actionLabel: "Open databases",
      metadata,
    },
    tags: [
      { name: "service", value: "database" },
      { name: "alert", value: params.alertTitle },
    ],
  });

  if (!result.success) {
    throw new Error(
      result.message || "Failed to send database alert email"
    );
  }
}
