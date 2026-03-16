import { isIP } from "node:net";
import { AuditLogService } from "@/lib/audit";
import type { DomainAuditLogPort } from "@/lib/domain-service/core/ports";

export function createDomainAuditLogAdapter(): DomainAuditLogPort {
  return {
    async log(params) {
      const basePayload = {
        user_id: params.userId,
        user_role: params.userRole || "user",
        user_email: params.userEmail,
        user_username: params.userName,
        action: params.action,
        service_id: params.serviceId,
        service_name: params.serviceName,
        metadata: params.metadata,
        ip_address: toInetOrUndefined(params.context?.ipAddress),
        user_agent: params.context?.userAgent,
        request_id: toUuidOrUndefined(params.context?.requestId),
      } as const;

      const result = await AuditLogService.create({
        ...basePayload,
        service_type: "domain",
      });
      if (result.success) return;

      if (shouldFallbackServiceType(result.error)) {
        const fallback = await AuditLogService.create({
          ...basePayload,
          service_type: "platform_apps",
          metadata: {
            ...(params.metadata || {}),
            domain_service_type: "domain",
          },
        });

        if (fallback.success) return;

        throw new Error(fallback.error || "Failed to create domain audit log");
      }

      throw new Error(result.error || "Failed to create domain audit log");
    },
  };
}

function shouldFallbackServiceType(error?: string): boolean {
  const message = (error || "").toLowerCase();
  return message.includes("service_type_check") || message.includes("service_type");
}

function toInetOrUndefined(value?: string): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const withoutPort = /^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(trimmed)
    ? trimmed.split(":")[0]
    : trimmed;

  return isIP(withoutPort) ? withoutPort : undefined;
}

function toUuidOrUndefined(value?: string): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(trimmed) ? trimmed : undefined;
}
