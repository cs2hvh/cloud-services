import { DomainMarketplaceService } from "@/lib/domain-service/application/domain-marketplace.service";
import { createNameComApiService } from "@/lib/domain-service/application/namecom-api.service";
import { createDomainAuditLogAdapter } from "@/lib/domain-service/integrations/audit-log.adapter";
import { createDomainBillingAdapter } from "@/lib/domain-service/integrations/billing.adapter";
import { createDomainEmailAdapter } from "@/lib/domain-service/integrations/email.adapter";
import { createDomainNotificationAdapter } from "@/lib/domain-service/integrations/notification.adapter";
import { SupabaseAppReadAdapter } from "@/lib/domain-service/persistence/supabase-app-read.adapter";
import { SupabaseDomainPurchaseRequestRepository } from "@/lib/domain-service/persistence/supabase-domain-purchase-request.repository";

let singleton: DomainMarketplaceService | null = null;

export function getDomainMarketplaceService(): DomainMarketplaceService {
  if (singleton) return singleton;

  singleton = new DomainMarketplaceService(
    createNameComApiService(),
    new SupabaseAppReadAdapter(),
    new SupabaseDomainPurchaseRequestRepository(),
    {
      billing: createDomainBillingAdapter(),
      audit: createDomainAuditLogAdapter(),
      notifications: createDomainNotificationAdapter(),
      email: createDomainEmailAdapter(),
    }
  );

  return singleton;
}
