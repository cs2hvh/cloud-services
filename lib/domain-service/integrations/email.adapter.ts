import { emailService } from "@/lib/email";
import type { DomainEmailPort } from "@/lib/domain-service/core/ports";

export function createDomainEmailAdapter(): DomainEmailPort {
  return {
    async sendImportantEvent(params) {
      const result = await emailService.sendTemplate({
        template: "systemAlert",
        to: params.to,
        data: {
          customerName: params.customerName || "there",
          alertTitle: params.alertTitle,
          severity: params.severity,
          serviceName: params.serviceName,
          detectedAt: new Date().toISOString(),
          summary: params.summary,
          actionUrl: params.actionUrl,
          actionLabel: params.actionLabel,
          metadata: params.metadata,
        },
      });

      if (!result.success) {
        throw new Error(
          result.error instanceof Error
            ? result.error.message
            : result.message || "Failed to send domain service email"
        );
      }
    },
  };
}
