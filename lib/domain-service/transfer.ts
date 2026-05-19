import { DomainTransferService } from "@/lib/domain-service/application/domain-transfer.service";
import { createDomainAuditLogAdapter } from "@/lib/domain-service/integrations/audit-log.adapter";
import { createDomainBillingAdapter } from "@/lib/domain-service/integrations/billing.adapter";
import { createDomainEmailAdapter } from "@/lib/domain-service/integrations/email.adapter";
import { createDomainNotificationAdapter } from "@/lib/domain-service/integrations/notification.adapter";
import { createDomainUserResolverAdapter } from "@/lib/domain-service/integrations/user-resolver.adapter";
import { NameComRegistrarAdapter } from "@/lib/domain-service/integrations/namecom-registrar.adapter";
import { SupabaseDomainTransferRequestRepository } from "@/lib/domain-service/persistence/supabase-domain-transfer-request.repository";
import { SupabaseDomainPurchaseRequestRepository } from "@/lib/domain-service/persistence/supabase-domain-purchase-request.repository";

let singleton: DomainTransferService | null = null;

export function getDomainTransferService(): DomainTransferService {
  if (singleton) return singleton;

  singleton = new DomainTransferService(
    new NameComRegistrarAdapter(),
    new SupabaseDomainTransferRequestRepository(),
    {
      billing: createDomainBillingAdapter(),
      audit: createDomainAuditLogAdapter(),
      notifications: createDomainNotificationAdapter(),
      email: createDomainEmailAdapter(),
      userResolver: createDomainUserResolverAdapter(),
      purchaseRequests: new SupabaseDomainPurchaseRequestRepository(),
    }
  );

  return singleton;
}
