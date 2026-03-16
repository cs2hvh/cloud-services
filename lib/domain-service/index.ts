import { DomainService } from "@/lib/domain-service/application/domain-service";
import { NameComDnsProviderAdapter } from "@/lib/domain-service/integrations/dns-provider.adapter";
import { KubernetesIngressAdapter } from "@/lib/domain-service/integrations/k8s-ingress.adapter";
import { NameComRegistrarAdapter } from "@/lib/domain-service/integrations/namecom-registrar.adapter";
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
  });

  return singleton;
}

export { DomainService };
