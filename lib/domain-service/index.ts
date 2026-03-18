import { DomainService } from "@/lib/domain-service/application/domain-service";
import { createDomainAuditLogAdapter } from "@/lib/domain-service/integrations/audit-log.adapter";
import { NameComDnsProviderAdapter } from "@/lib/domain-service/integrations/dns-provider.adapter";
import { DnsRoutingAdapter } from "@/lib/domain-service/integrations/dns-routing.adapter";
import { createDomainEmailAdapter } from "@/lib/domain-service/integrations/email.adapter";
import { KubernetesIngressAdapter } from "@/lib/domain-service/integrations/k8s-ingress.adapter";
import { NameComRegistrarAdapter } from "@/lib/domain-service/integrations/namecom-registrar.adapter";
import { createDomainNotificationAdapter } from "@/lib/domain-service/integrations/notification.adapter";
import { SupabaseAppReadAdapter } from "@/lib/domain-service/persistence/supabase-app-read.adapter";
import { SupabaseAppWriteAdapter } from "@/lib/domain-service/persistence/supabase-app-write.adapter";
import { SupabaseDomainOperationRepository } from "@/lib/domain-service/persistence/supabase-domain-operation.repository";
import { SupabaseDomainPurchaseRequestRepository } from "@/lib/domain-service/persistence/supabase-domain-purchase-request.repository";
import { SupabaseDomainRepository } from "@/lib/domain-service/persistence/supabase-domain.repository";

let singleton: DomainService | null = null;

export function getDomainService(): DomainService {
  if (singleton) {
    return singleton;
  }

  if (!process.env.KUBE_IP) {
    console.warn(
      "[DomainService] KUBE_IP is not set — DNS routing checks will return ready:false for all domains"
    );
  }

  const registrar = new NameComRegistrarAdapter();
  singleton = new DomainService({
    appRead: new SupabaseAppReadAdapter(),
    appWrite: new SupabaseAppWriteAdapter(),
    domains: new SupabaseDomainRepository(),
    operations: new SupabaseDomainOperationRepository(),
    purchaseRequests: new SupabaseDomainPurchaseRequestRepository(),
    registrar,
    dns: new NameComDnsProviderAdapter(registrar),
    dnsRouting: new DnsRoutingAdapter(),
    ingress: new KubernetesIngressAdapter(),
    audit: createDomainAuditLogAdapter(),
    notifications: createDomainNotificationAdapter(),
    email: createDomainEmailAdapter(),
  });

  return singleton;
}

export { DomainService };
