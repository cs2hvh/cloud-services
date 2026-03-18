import { NotificationService, createServiceNotification } from "@/lib/notifications/service";
import type { DomainNotificationPort } from "@/lib/domain-service/core/ports";

export function createDomainNotificationAdapter(): DomainNotificationPort {
  return {
    async notify(params) {
      const notification = createServiceNotification({
        userId: params.userId,
        type: params.type,
        action: params.action,
        serviceType: "domain",
        serviceName: params.serviceName,
        serviceId: params.serviceId,
        error: params.error,
        metadata: params.metadata,
      });

      const result = await NotificationService.create(notification);
      if (result.success) return;

      if (shouldFallbackServiceType(result.error)) {
        const fallbackNotification = createServiceNotification({
          userId: params.userId,
          type: params.type,
          action: params.action,
          serviceType: "platform_app",
          serviceName: params.serviceName,
          serviceId: params.serviceId,
          error: params.error,
          metadata: {
            ...(params.metadata || {}),
            domain_service_type: "domain",
          },
        });

        const fallback = await NotificationService.create(fallbackNotification);
        if (fallback.success) return;

        throw new Error(fallback.error || "Failed to create domain notification");
      }

      throw new Error(result.error || "Failed to create domain notification");
    },
  };
}

function shouldFallbackServiceType(error?: string): boolean {
  const message = (error || "").toLowerCase();
  return message.includes("service_type_check") || message.includes("service_type");
}
