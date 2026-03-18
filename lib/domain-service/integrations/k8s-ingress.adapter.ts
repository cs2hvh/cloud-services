import { DOMAIN_ERROR_CODES, DomainServiceError } from "@/lib/domain-service/core/errors";
import type { IngressPort } from "@/lib/domain-service/core/ports";
import { KubernetesCustomDomainService } from "@/lib/services/kubernetes-custom-domain";

export class KubernetesIngressAdapter implements IngressPort {
  async addDomainToAppIngress(appName: string, domain: string): Promise<void> {
    try {
      await KubernetesCustomDomainService.addCustomDomainToIngress(appName, domain);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown ingress error";
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.INGRESS_APPLY_FAILED,
        message: `Failed to add domain to ingress: ${message}`,
        retryable: true,
      });
    }
  }

  async removeDomainFromAppIngress(appName: string, domain: string): Promise<void> {
    try {
      await KubernetesCustomDomainService.removeCustomDomainFromIngress(appName, domain);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown ingress error";
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.INGRESS_APPLY_FAILED,
        message: `Failed to remove domain from ingress: ${message}`,
        retryable: true,
      });
    }
  }
}
