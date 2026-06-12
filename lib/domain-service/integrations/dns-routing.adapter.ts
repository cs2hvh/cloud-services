import { Resolver } from "dns";
import type { DnsRoutingPort } from "@/lib/domain-service/core/ports";
import type { DnsRoutingStatus } from "@/lib/domain-service/core/types";

/**
 * Resolves A/AAAA addresses for a domain using public DNS and compares
 * them against the platform ingress IPs from the KUBE_IP env variable.
 *
 * Used by DomainService.listDomains() to decorate each DomainRecord with
 * live DNS routing state so the frontend can gate the Activate button.
 */
export class DnsRoutingAdapter implements DnsRoutingPort {
  private readonly resolver: Resolver;
  private readonly expectedIps: string[];

  constructor() {
    this.resolver = new Resolver();
    // Use the same configurable resolver list as the DNS provider adapter so
    // both checks see a consistent view of DNS. Defaults to Cloudflare first
    // to avoid Google DNS negative-cache issues on freshly-created records.
    this.resolver.setServers(parseRoutingDnsServers(process.env.DOMAINS_PUBLIC_DNS));
    this.expectedIps = DnsRoutingAdapter.parseExpectedIps();
  }

  async getRoutingStatus(domain: string): Promise<DnsRoutingStatus> {
    if (this.expectedIps.length === 0) {
      // KUBE_IP not configured — return neutral status so nothing is blocked.
      return {
        ready: false,
        resolved_ips: [],
        expected_ips: [],
        message: "Platform ingress IP (KUBE_IP) is not configured.",
      };
    }

    const isApex = domain.split(".").filter(Boolean).length <= 2;

    let resolved: string[];
    try {
      resolved = await this.resolveAll(domain);
    } catch {
      return {
        ready: false,
        resolved_ips: [],
        expected_ips: this.expectedIps,
        message: isApex
          ? `Unable to resolve ${domain}. Add an A record pointing to ${this.expectedIps.join(", ")}.`
          : `Unable to resolve ${domain}. Add the CNAME record shown below at your DNS provider.`,
      };
    }

    if (resolved.length === 0) {
      return {
        ready: false,
        resolved_ips: [],
        expected_ips: this.expectedIps,
        message: isApex
          ? `No DNS records detected yet. Add an A record for ${domain} pointing to ${this.expectedIps.join(", ")} and wait for propagation.`
          : `No DNS records detected yet. Add the CNAME record shown below at your DNS provider and wait for propagation.`,
      };
    }

    const matches = resolved.some((ip) => this.expectedIps.includes(ip));
    if (matches) {
      return {
        ready: true,
        resolved_ips: resolved,
        expected_ips: this.expectedIps,
        message: "DNS is correctly pointing to the platform ingress.",
      };
    }

    return {
      ready: false,
      resolved_ips: resolved,
      expected_ips: this.expectedIps,
      message: isApex
        ? `DNS currently resolves to ${resolved.join(", ")}. Update the A record to ${this.expectedIps.join(", ")}.`
        : `DNS currently resolves to ${resolved.join(", ")}. Check that your CNAME record shown below is correct and not routed through a proxy or CDN.`,
    };
  }

  private async resolveAll(domain: string): Promise<string[]> {
    const [ipv4, ipv6] = await Promise.all([
      this.resolve(domain, 4),
      this.resolve(domain, 6),
    ]);
    return [...ipv4, ...ipv6];
  }

  private resolve(domain: string, family: 4 | 6): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const handler = (err: NodeJS.ErrnoException | null, addresses: string[]) => {
        if (err) {
          if (err.code === "ENOTFOUND" || err.code === "ENODATA" || err.code === "EAI_AGAIN") {
            return resolve([]);
          }
          return reject(err);
        }
        resolve(addresses || []);
      };

      if (family === 4) {
        this.resolver.resolve4(domain, handler);
      } else {
        this.resolver.resolve6(domain, handler);
      }
    });
  }

  private static parseExpectedIps(): string[] {
    const raw = process.env.KUBE_IP?.trim();
    if (!raw) return [];
    return raw.split(",").map((ip) => ip.trim()).filter(Boolean);
  }
}

function parseRoutingDnsServers(raw?: string): string[] {
  const configured = raw
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (configured && configured.length > 0) return configured;
  return ["1.1.1.1", "8.8.8.8"];
}
