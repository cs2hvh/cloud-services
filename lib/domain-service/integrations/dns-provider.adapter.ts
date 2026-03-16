import { Resolver } from "dns";
import {
  DOMAIN_ERROR_CODES,
  DomainServiceError,
  toDomainServiceError,
} from "@/lib/domain-service/core/errors";
import type { DnsProviderPort } from "@/lib/domain-service/core/ports";
import {
  NameComRegistrarAdapter,
  type NameComRecord,
} from "@/lib/domain-service/integrations/namecom-registrar.adapter";

export class NameComDnsProviderAdapter implements DnsProviderPort {
  private readonly resolver: Resolver;

  constructor(private readonly nameCom: NameComRegistrarAdapter) {
    this.resolver = new Resolver();
    this.resolver.setServers(["8.8.8.8", "1.1.1.1"]);
  }

  async listTxtRecords(recordName: string): Promise<string[]> {
    try {
      const records = await new Promise<string[][]>((resolve, reject) => {
        this.resolver.resolveTxt(recordName, (err, addresses) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(addresses);
        });
      });

      return records.flat();
    } catch (error: unknown) {
      const code = (error as { code?: string }).code;
      if (code === "ENODATA" || code === "ENOTFOUND") {
        return [];
      }

      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.INTERNAL_ERROR,
        message: `DNS TXT lookup failed for ${recordName}`,
        details: { dns_error: code || "UNKNOWN" },
      });
    }
  }

  async ensureCnameRecord(params: { fqdn: string; target: string; ttl: number }): Promise<void> {
    const { zone, host } = await this.resolveManagedZone(params.fqdn);
    const ttl = Math.max(params.ttl, 300);

    const list = await this.nameCom.listRecords(zone);
    const existing = list.records.find(
      (record) => record.type === "CNAME" && normalizeHost(record.host) === normalizeHost(host)
    );

    if (existing?.answer === params.target && Number(existing.ttl || 300) === ttl) {
      return;
    }

    if (existing?.id) {
      await this.nameCom.updateRecord(zone, existing.id, {
        host,
        type: "CNAME",
        answer: params.target,
        ttl,
      });
      return;
    }

    await this.nameCom.createRecord(zone, {
      host,
      type: "CNAME",
      answer: params.target,
      ttl,
    });
  }

  private async resolveManagedZone(fqdn: string): Promise<{ zone: string; host: string }> {
    const normalized = normalizeFqdn(fqdn);
    const parts = normalized.split(".").filter(Boolean);

    if (parts.length < 2) {
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.DOMAIN_INVALID,
        message: "Invalid FQDN for DNS management",
        details: { domain: fqdn },
      });
    }

    for (let i = 0; i <= parts.length - 2; i += 1) {
      const candidateZone = parts.slice(i).join(".");

      try {
        const summary = await this.nameCom.getDomainSummary(candidateZone);
        if (summary?.domainName) {
          const host = i === 0 ? "@" : parts.slice(0, i).join(".");
          return { zone: candidateZone, host };
        }
      } catch (error: unknown) {
        const serviceError = toDomainServiceError(error);
        if (serviceError.code === DOMAIN_ERROR_CODES.DOMAIN_NOT_FOUND) {
          continue;
        }
        throw serviceError;
      }
    }

    throw new DomainServiceError({
      code: DOMAIN_ERROR_CODES.DOMAIN_INVALID,
      message: "No managed Name.com zone found for the requested domain",
      details: { domain: fqdn },
    });
  }
}

function normalizeFqdn(fqdn: string): string {
  return fqdn.trim().toLowerCase().replace(/\.$/, "");
}

function normalizeHost(host: NameComRecord["host"]): string {
  if (!host || host === "") {
    return "@";
  }
  return host;
}
