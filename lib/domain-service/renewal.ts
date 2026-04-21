import { DomainRenewalService } from "@/lib/domain-service/application/domain-renewal.service";
import { createDomainBillingAdapter } from "@/lib/domain-service/integrations/billing.adapter";
import { createDomainAuditLogAdapter } from "@/lib/domain-service/integrations/audit-log.adapter";
import { createDomainNotificationAdapter } from "@/lib/domain-service/integrations/notification.adapter";

let singleton: DomainRenewalService | null = null;

export function getDomainRenewalService(): DomainRenewalService {
  if (singleton) return singleton;
  singleton = new DomainRenewalService({
    billing: createDomainBillingAdapter(),
    audit: createDomainAuditLogAdapter(),
    notifications: createDomainNotificationAdapter(),
  });
  return singleton;
}
