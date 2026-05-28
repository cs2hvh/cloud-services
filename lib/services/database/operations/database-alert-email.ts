import type { SystemAlertEmailData } from "@/lib/email/types";
import {
  resolveUserEmail,
  sendServiceAlertEmail,
} from "@/lib/services/shared/service-alert-email";

// Re-exported so existing database operation imports keep working unchanged.
export { resolveUserEmail };

type DatabaseAlertEmailParams = {
  userEmail?: string;
  serviceName: string;
  alertTitle: string;
  summary: string;
  severity?: SystemAlertEmailData["severity"];
  metadata?: Record<string, string | number | boolean | null | undefined>;
};

export async function sendDatabaseAlertEmail(
  params: DatabaseAlertEmailParams
): Promise<void> {
  await sendServiceAlertEmail({ serviceType: "database", ...params });
}
