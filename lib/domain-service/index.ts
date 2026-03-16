import { DomainService } from "@/lib/domain-service/application/domain-service";
import { createDomainAuditLogAdapter } from "@/lib/domain-service/integrations/audit-log.adapter";
import { NameComDnsProviderAdapter } from "@/lib/domain-service/integrations/dns-provider.adapter";
import { createDomainEmailAdapter } from "@/lib/domain-service/integrations/email.adapter";
import { KubernetesIngressAdapter } from "@/lib/domain-service/integrations/k8s-ingress.adapter";
import { NameComRegistrarAdapter } from "@/lib/domain-service/integrations/namecom-registrar.adapter";
import { createDomainNotificationAdapter } from "@/lib/domain-service/integrations/notification.adapter";
import { SupabaseAppReadAdapter } from "@/lib/domain-service/persistence/supabase-app-read.adapter";
import { SupabaseDomainOperationRepository } from "@/lib/domain-service/persistence/supabase-domain-operation.repository";
import { SupabaseDomainRepository } from "@/lib/domain-service/persistence/supabase-domain.repository";

let singleton: DomainService | null = null;

export function getDomainService(): DomainService {
  if (singleton) {
    return singleton;
  }

  const registrar = new NameComRegistrarAdapter();
  singleton = new DomainService({
    appRead: new SupabaseAppReadAdapter(),
    domains: new SupabaseDomainRepository(),
    operations: new SupabaseDomainOperationRepository(),
    registrar,
    dns: new NameComDnsProviderAdapter(registrar),
    ingress: new KubernetesIngressAdapter(),
    audit: createDomainAuditLogAdapter(),
    notifications: createDomainNotificationAdapter(),
    email: createDomainEmailAdapter(),
  });

  return singleton;
}

export { DomainService };
