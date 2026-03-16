import { DomainMarketplaceService } from "@/lib/domain-service/application/domain-marketplace.service";
import { createNameComApiService } from "@/lib/domain-service/application/namecom-api.service";
import { SupabaseAppReadAdapter } from "@/lib/domain-service/persistence/supabase-app-read.adapter";
import { SupabaseDomainPurchaseRequestRepository } from "@/lib/domain-service/persistence/supabase-domain-purchase-request.repository";

let singleton: DomainMarketplaceService | null = null;

export function getDomainMarketplaceService(): DomainMarketplaceService {
  if (singleton) return singleton;

  singleton = new DomainMarketplaceService(
    createNameComApiService(),
    new SupabaseAppReadAdapter(),
    new SupabaseDomainPurchaseRequestRepository()
  );

  return singleton;
}

